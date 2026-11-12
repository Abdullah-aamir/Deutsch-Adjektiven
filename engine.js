/* engine.js — generator, answer checking, mastery, storage.
 *
 * No part of this file decides what a correct ending is. It decides which
 * cell to test; the ending falls out of a lookup in CELLS.
 */

import {
  CELLS, CELL_BY_KEY, CELL_BY_ID, NOUNS, ADJECTIVES, FRAMES,
  NOUN_BY_ID, ADJ_BY_ID, FRAME_BY_ID,
  DEF_ARTICLES, DER_WORD_STEMS, DER_WORD_ENDINGS,
  EIN_WORD_STEMS, EIN_WORD_ENDINGS, HINT_ARTICLE,
} from './data.js';

export const LAMBDA = 0.98;          // forgetting factor, ~50 attempts of memory
export const SESSION_LENGTH = 20;
export const NO_REPEAT_WINDOW = 40;  // (frame, noun) pairs
export const CELL_REPEAT_WINDOW = 10; // (frame, cell) pairs

/* ===========================================================================
 * Random numbers. Seedable, so the tests are deterministic.
 * ======================================================================== */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const defaultRng = () => Math.random();

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

/* Marsaglia-Tsang gamma, then beta = g1 / (g1 + g2). */
function gammaVariate(k, rng) {
  if (k < 1) {
    const u = rng() || 1e-12;
    return gammaVariate(1 + k, rng) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      // Box-Muller for a standard normal
      const u1 = rng() || 1e-12, u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng() || 1e-12;
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaVariate(alpha, beta, rng) {
  const g1 = gammaVariate(alpha, rng);
  const g2 = gammaVariate(beta, rng);
  return g1 / (g1 + g2) || 0;
}

/* ===========================================================================
 * Mastery
 * ======================================================================== */
export const posteriorMean = s => s.alpha / (s.alpha + s.beta);
export function posteriorSd(s) {
  const a = s.alpha, b = s.beta, n = a + b;
  return Math.sqrt((a * b) / (n * n * (n + 1)));
}

export function freshState() {
  const st = {};
  for (const c of CELLS) st[c.id] = { alpha: 1, beta: 1, last_seen: null, n: 0 };
  return st;
}

/** Apply one scored attempt. empty and junk never reach here. */
export function applyAttempt(state, cellId, correct, ts) {
  const s = state[cellId];
  const c = correct ? 1 : 0;
  s.alpha = LAMBDA * s.alpha + c;
  s.beta = LAMBDA * s.beta + (1 - c);
  s.last_seen = ts;
  s.n = (s.n || 0) + 1;
  return s;
}

/** Rebuild cell_state from the attempts log. Derived data, always replayable. */
export function rebuildState(attempts) {
  const state = freshState();
  const ordered = [...attempts].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  for (const a of ordered) {
    if (a.error_kind === 'empty' || a.error_kind === 'junk') continue;
    applyAttempt(state, a.cell_id, !!a.correct, a.ts);
  }
  return state;
}

/**
 * Thompson sampling, inverted for weakness-seeking: one draw per cell, take
 * the lowest. Favours weak cells, still revisits strong ones through the tails,
 * and explores thin evidence because those posteriors are wide.
 */
export function nextCell(state, rng = defaultRng) {
  let best = null, bestDraw = Infinity;
  for (const c of CELLS) {
    const s = state[c.id];
    const draw = betaVariate(s.alpha, s.beta, rng);
    if (draw < bestDraw) { bestDraw = draw; best = c; }
  }
  return best;
}

/* ===========================================================================
 * Answer checking. The blank holds an ending, so the answer space is five
 * strings and none of them needs a key the learner does not have.
 * ======================================================================== */
export const VALID_ENDINGS = new Set(['e', 'en', 'er', 'es', 'em']);

export function check(given, expected) {
  const g = String(given ?? '').trim().toLowerCase().replace(/^-+/, '');
  if (!g) return { correct: false, error_kind: 'empty' };
  if (!VALID_ENDINGS.has(g)) return { correct: false, error_kind: 'junk' };
  return g === expected
    ? { correct: true, error_kind: null }
    : { correct: false, error_kind: 'ending' };
}

/* ===========================================================================
 * Generator
 * ======================================================================== */

/** The number of a cell: pl is plural, everything else singular. */
const numberOf = gn => (gn === 'pl' ? 'pl' : 'sg');

/**
 * Is this (frame, noun) legal for this cell? Single source of truth, used by
 * the generator and by the coverage test, so the test measures what runs.
 */
function frameNounOk(frame, noun, cell) {
  const num = numberOf(cell.gender_num);
  if (frame.kasus !== cell.kasus) return false;
  if (!frame.allowed_number.includes(num)) return false;
  const allowedArticles = num === 'pl' ? frame.article_pl : frame.article_sg;
  if (!allowedArticles.includes(cell.article_class)) return false;
  if (!frame.allowed_sem.includes(noun.sem_class)) return false;
  if (num === 'pl') {
    // Plural cells are not gendered; any countable noun fits.
    if (!noun.countable) return false;            // no plural of mass nouns
  } else {
    if (noun.gender !== cell.gender_num) return false;
    // German has no bare singular count noun: "*Guter Lehrer ist angekommen".
    if (cell.article_class === 'none' && !noun.mass) return false;
    // ...and no ein-word on a noun that cannot be counted: "*ein Obst".
    if (cell.article_class === 'ein' && !noun.countable) return false;
  }
  return true;
}

function adjectivesFor(noun) {
  return ADJECTIVES.filter(a => a.applies_to.includes(noun.sem_class));
}

/** Every legal (frame, noun) pair for a cell, with its adjective options. */
export function pairsForCell(cell) {
  const out = [];
  for (const frame of FRAMES) {
    for (const noun of NOUNS) {
      if (!frameNounOk(frame, noun, cell)) continue;
      const adjs = adjectivesFor(noun);
      if (adjs.length) out.push({ frame, noun, adjs });
    }
  }
  return out;
}

/** Coverage: how many valid (frame, noun, adjective) triples a cell has. */
export function tripleCount(cell) {
  return pairsForCell(cell).reduce((n, p) => n + p.adjs.length, 0);
}

/* A possessive asserts ownership, and "mein Fluss" is odd in a way the
 * grammar cannot catch. Only people, animals and objects get possessives;
 * places, food and abstractions get ein/kein. */
const OWNABLE = new Set(['person', 'animal', 'object']);

function articleSurface(cell, noun, rng) {
  const { article_class: ac, kasus, gender_num: gn } = cell;
  if (ac === 'none') return '';
  if (ac === 'def') {
    const options = [DEF_ARTICLES[kasus][gn]];
    for (const stem of DER_WORD_STEMS) options.push(stem + DER_WORD_ENDINGS[kasus][gn]);
    return pick(options, rng);
  }
  // ein-words: 'ein' itself has no plural, and possessives need an owner.
  const stems = EIN_WORD_STEMS.filter(s =>
    (gn !== 'pl' || s.plural) &&
    (OWNABLE.has(noun.sem_class) || s.stem === 'ein' || s.stem === 'kein'));
  return pick(stems, rng).stem + EIN_WORD_ENDINGS[kasus][gn];
}

function nounSurface(noun, cell) {
  if (cell.gender_num !== 'pl') return noun.lemma;
  return cell.kasus === 'dat' ? noun.dat_pl : noun.plural;
}

function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Assemble one item. The eight steps run in order and step 6 — the ending — is
 * a dictionary access, never a computation.
 */
export function buildItem(cell, frame, noun, adj, rng = defaultRng, { hints = true } = {}) {
  const isPlural = cell.gender_num === 'pl';
  const template = isPlural ? frame.template_pl : frame.template;
  const article = articleSurface(cell, noun, rng);
  const nounForm = nounSurface(noun, cell);
  const ending = cell.ending;                        // step 6: the answer

  let np = (article ? article + ' ' : '') + adj.lemma + '\u0000' + ' ' + nounForm;
  const atStart = template.startsWith('{np}');
  if (atStart) np = capitalise(np);

  const rendered = template.replace('{np}', np);
  const [before, after] = rendered.split('\u0000');

  return {
    item_id: `${cell.id}-${frame.id}-${noun.id}-${adj.id}-${Math.floor(rng() * 1e9)}`,
    cell_id: cell.id, frame_id: frame.id, noun_id: noun.id, adj_id: adj.id,
    cell: { article_class: cell.article_class, kasus: cell.kasus, gender_num: cell.gender_num },
    prompt_before: before,
    prompt_after: after,
    expected: ending,
    full_sentence: before + ending + after,
    explanation: cell.explanation,
    hint: hints && cell.article_class === 'none' ? HINT_ARTICLE[cell.gender_num] : null,
    hint_shown: hints && cell.article_class === 'none' ? 1 : 0,
  };
}

/** Anti-repetition over the recent log plus the batch being generated. */
function recentKeys(attempts, batch) {
  const recent = attempts.slice(-NO_REPEAT_WINDOW).concat(batch);
  const pairSeen = new Set();
  const cellSeen = new Set();
  recent.forEach((a, i) => {
    pairSeen.add(`${a.frame_id}|${a.noun_id}`);
    if (i >= recent.length - CELL_REPEAT_WINDOW) cellSeen.add(`${a.frame_id}|${a.cell_id}`);
  });
  return { pairSeen, cellSeen };
}

/**
 * Both anti-repetition rules are hard constraints. If a cell cannot satisfy
 * them the caller re-draws a cell rather than relaxing them; only a lone
 * generateItem call with nowhere left to go falls back.
 */
export function generateItem(cell, attempts, batch, rng = defaultRng, opts = {}, strict = false) {
  const pairs = pairsForCell(cell);
  if (!pairs.length) throw new Error(`no material for cell ${cell.key}`);
  const { pairSeen, cellSeen } = recentKeys(attempts, batch);

  let pool = pairs.filter(p =>
    !pairSeen.has(`${p.frame.id}|${p.noun.id}`) &&
    !cellSeen.has(`${p.frame.id}|${cell.id}`));
  if (!pool.length) {
    if (strict) return null;
    pool = pairs.filter(p => !pairSeen.has(`${p.frame.id}|${p.noun.id}`));
  }
  if (!pool.length) pool = pairs;

  const p = pick(pool, rng);
  return buildItem(cell, p.frame, p.noun, pick(p.adjs, rng), rng, opts);
}

/** A whole session, generated up front so nothing is computed while you wait. */
export function generateSession(state, attempts, n = SESSION_LENGTH, rng = defaultRng, opts = {}) {
  const batch = [];
  const items = [];
  for (let i = 0; i < n; i++) {
    let item = null;
    for (let tries = 0; tries < 40 && !item; tries++) {
      item = generateItem(nextCell(state, rng), attempts, batch, rng, opts, true);
    }
    if (!item) item = generateItem(nextCell(state, rng), attempts, batch, rng, opts, false);
    batch.push({ frame_id: item.frame_id, noun_id: item.noun_id, cell_id: item.cell_id });
    items.push(item);
  }
  return items;
}

/* ===========================================================================
 * Storage. localStorage, one key per table, compact rows for the attempts log.
 * ======================================================================== */
const KEY_ATTEMPTS = 'aet.attempts.v1';
const KEY_SETTINGS = 'aet.settings.v1';
const MAX_ATTEMPTS = 20000;

const FIELDS = ['ts', 'cell_id', 'frame_id', 'noun_id', 'adj_id', 'prompt',
  'expected', 'given', 'correct', 'hint_shown', 'ms', 'error_kind'];

const toRow = a => FIELDS.map(f => a[f]);
const fromRow = r => Object.fromEntries(FIELDS.map((f, i) => [f, r[i]]));

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export const store = {
  loadAttempts() {
    const rows = safeParse(localStorage.getItem(KEY_ATTEMPTS), []);
    return rows.map(fromRow);
  },
  saveAttempts(attempts) {
    const trimmed = attempts.slice(-MAX_ATTEMPTS);
    try {
      localStorage.setItem(KEY_ATTEMPTS, JSON.stringify(trimmed.map(toRow)));
    } catch (e) {
      console.warn('storage full, keeping the last 5000 attempts', e);
      localStorage.setItem(KEY_ATTEMPTS,
        JSON.stringify(trimmed.slice(-5000).map(toRow)));
    }
  },
  loadSettings() {
    return Object.assign({ hints: true }, safeParse(localStorage.getItem(KEY_SETTINGS), {}));
  },
  saveSettings(s) { localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); },
  exportAll() {
    return JSON.stringify({
      version: 1,
      exported: new Date().toISOString(),
      attempts: this.loadAttempts(),
      settings: this.loadSettings(),
    }, null, 2);
  },
  importAll(json) {
    const data = JSON.parse(json);
    if (!Array.isArray(data.attempts)) throw new Error('no attempts in that file');
    this.saveAttempts(data.attempts);
    if (data.settings) this.saveSettings(data.settings);
    return data.attempts.length;
  },
};

/* ===========================================================================
 * Reporting
 * ======================================================================== */
export function gridData(state, attempts) {
  const counts = new Map();
  for (const a of attempts) {
    if (a.error_kind === 'empty' || a.error_kind === 'junk') continue;
    counts.set(a.cell_id, (counts.get(a.cell_id) || 0) + 1);
  }
  return CELLS.map(c => ({
    cell: c,
    n: counts.get(c.id) || 0,
    mean: posteriorMean(state[c.id]),
    sd: posteriorSd(state[c.id]),
  }));
}

export function mistakes(attempts, limit = 50) {
  return attempts
    .filter(a => !a.correct && a.error_kind === 'ending')
    .slice(-limit).reverse()
    .map(a => ({
      ...a,
      cell: CELL_BY_ID.get(a.cell_id),
      noun: NOUN_BY_ID.get(a.noun_id),
      adj: ADJ_BY_ID.get(a.adj_id),
      frame: FRAME_BY_ID.get(a.frame_id),
    }));
}

export function historyByDay(attempts, days = 30) {
  const cutoff = Date.now() - days * 864e5;
  const byDay = new Map();
  for (const a of attempts) {
    const t = Date.parse(a.ts);
    if (!(t >= cutoff)) continue;
    if (a.error_kind === 'empty' || a.error_kind === 'junk') continue;
    const d = a.ts.slice(0, 10);
    const e = byDay.get(d) || { date: d, n: 0, right: 0 };
    e.n++; if (a.correct) e.right++;
    byDay.set(d, e);
  }
  return [...byDay.values()]
    .map(e => ({ ...e, accuracy: e.n ? e.right / e.n : 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export { CELLS, CELL_BY_KEY, CELL_BY_ID };
