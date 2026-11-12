/* app.js — the three screens. All state lives in localStorage; nothing is
   fetched, so every screen works with the aeroplane mode on. */

import { CELLS } from './data.js';
import {
  store, rebuildState, generateItem, nextCell, check, applyAttempt,
  posteriorMean, gridData, mistakes, SESSION_LENGTH,
} from './engine.js';
import { pool, LOW_WATER } from './pool.js';
import { refill, loadConfig, saveConfig, isConfigured, PROVIDERS } from './ai.js';

const $ = id => document.getElementById(id);

/* Shown in Settings so you can tell at a glance which build is deployed —
   an installed PWA can serve a cached older one. Keep in step with sw.js. */
const APP_VERSION = 'v6';

const app = {
  attempts: store.loadAttempts(),
  settings: store.loadSettings(),
  state: null,
  items: [],
  i: 0,
  answered: false,
  shownAt: 0,
  right: 0,
  meanBefore: new Map(),
};
app.state = rebuildState(app.attempts);

/* ===========================================================================
 * Practice
 * ======================================================================== */
/**
 * One item. The selector picks the cell you are worst at; if the pool holds a
 * model-written item for that cell we use it, otherwise the static generator
 * makes one. That fallback is why the app works on a plane, with no key, and
 * when the model is unreachable.
 */
function nextItem(batch) {
  const opts = { hints: app.settings.hints };
  const useAi = isConfigured();
  for (let tries = 0; tries < 40; tries++) {
    const cell = nextCell(app.state, Math.random);
    if (useAi) {
      const fromPool = pool.take(cell.id);
      if (fromPool) return fromPool;
    }
    const item = generateItem(cell, app.attempts, batch, Math.random, opts, true);
    if (item) return item;
  }
  return generateItem(nextCell(app.state, Math.random), app.attempts, batch, Math.random, opts, false);
}

function startSession() {
  app.meanBefore = new Map(CELLS.map(c => [c.id, posteriorMean(app.state[c.id])]));
  const batch = [];
  app.items = [];
  for (let i = 0; i < SESSION_LENGTH; i++) {
    const item = nextItem(batch);
    batch.push({ frame_id: item.frame_id, noun_id: item.noun_id, cell_id: item.cell_id });
    app.items.push(item);
  }
  maybeRefill();
  app.i = 0;
  app.right = 0;
  $('summary').hidden = true;
  $('question').hidden = false;
  showItem();
}

function showItem() {
  const it = app.items[app.i];
  app.answered = false;

  // Keep the adjective stem and the blank on the same line.
  const cut = it.prompt_before.lastIndexOf(' ') + 1;
  $('before').textContent = it.prompt_before.slice(0, cut);
  $('stem').textContent = it.prompt_before.slice(cut);
  $('after').textContent = it.prompt_after;
  const hint = app.settings.hints ? it.hint : null;
  it.hint_shown = hint ? 1 : 0;
  $('hint').textContent = hint ? `(${hint})` : '';

  const input = $('answer');
  input.value = '';
  input.readOnly = false;
  input.className = 'blank';
  $('feedback').hidden = true;
  $('provenance').hidden = true;
  $('flag').hidden = false;
  $('advance').textContent = 'Check';
  $('advance').disabled = false;

  $('counter').textContent = `${app.i + 1} of ${app.items.length}`;
  $('progress-bar').style.width = `${(app.i / app.items.length) * 100}%`;

  input.focus();
  app.shownAt = performance.now();
}

function submit() {
  const it = app.items[app.i];
  const input = $('answer');
  const given = input.value;
  const res = check(given, it.expected);
  const ms = Math.round(performance.now() - app.shownAt);
  const ts = new Date().toISOString();

  const attempt = {
    ts, cell_id: it.cell_id, frame_id: it.frame_id, noun_id: it.noun_id,
    adj_id: it.adj_id, prompt: it.full_sentence, expected: it.expected,
    given: String(given), correct: res.correct ? 1 : 0,
    hint_shown: it.hint_shown, ms, error_kind: res.error_kind,
    adj_lemma: it.adj_lemma || null,
    source: it.source || 'static',
    trust: it.trust || 'verified',
  };
  app.attempts.push(attempt);
  store.saveAttempts(app.attempts);

  // empty and junk are recorded but never become evidence about a cell.
  if (res.error_kind !== 'empty' && res.error_kind !== 'junk') {
    applyAttempt(app.state, it.cell_id, res.correct, ts);
  }
  if (res.correct) app.right++;

  app.answered = true;
  input.readOnly = true;
  input.className = 'blank ' + (res.correct ? 'right' : 'wrong');

  $('verdict').textContent = res.correct ? 'Right'
    : res.error_kind === 'empty' ? 'Nothing typed — not counted'
    : res.error_kind === 'junk' ? 'Not one of the five endings — not counted'
    : 'Not this one';
  $('solution').innerHTML = res.correct ? ''
    : it.prompt_before.replace(/</g, '&lt;') + '<b>' + it.expected + '</b>'
      + it.prompt_after.replace(/</g, '&lt;');
  $('explanation').textContent = res.correct ? '' : it.explanation;
  const prov = $('provenance');
  if (!res.correct && it.source === 'ai') {
    prov.querySelector('span').textContent = it.trust === 'verified'
      ? 'Model-written sentence. The ending is from the table, so it is right.'
      : 'Model-written sentence. The ending is from the table; the noun\u2019s gender is the model\u2019s claim.';
    prov.hidden = false;
    app.flagged = it;
  } else {
    prov.hidden = true;
    app.flagged = null;
  }

  $('feedback').hidden = false;

  const btn = $('advance');
  btn.textContent = app.i + 1 < app.items.length ? 'Next' : 'See results';
  // A fast double-tap on "Check" must not skip straight past the explanation.
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, 350);

  renderGrid();
  renderMistakes();
}

function advance() {
  app.i++;
  if (app.i < app.items.length) { showItem(); return; }
  finishSession();
}

function finishSession() {
  $('progress-bar').style.width = '100%';
  $('counter').textContent = 'done';
  $('question').hidden = true;
  $('summary').hidden = false;
  $('score').textContent = `${app.right} of ${app.items.length} right`;

  const moved = CELLS
    .map(c => ({ c, d: posteriorMean(app.state[c.id]) - (app.meanBefore.get(c.id) ?? 0) }))
    .filter(x => Math.abs(x.d) > 0.004)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 2);

  $('moved').textContent = moved.length
    ? 'Moved most: ' + moved.map(x =>
        `${cellName(x.c)} ${x.d > 0 ? '↑' : '↓'}${Math.abs(Math.round(x.d * 100))}`).join(', ')
    : 'No cell moved much.';
  $('again').focus();
}

const PATTERN = { def: 'weak', ein: 'mixed', none: 'strong' };
const GENDER = { m: 'masc.', f: 'fem.', n: 'neut.', pl: 'plural' };
const KASUS = { nom: 'nominative', acc: 'accusative', dat: 'dative' };
const cellName = c => `${PATTERN[c.article_class]} ${KASUS[c.kasus]} ${GENDER[c.gender_num]}`;

/* ===========================================================================
 * Grid — the three declension tables, shaded by posterior mean.
 * ======================================================================== */
const BLOCKS = [
  ['def', 'Weak', 'after der / die / das, dieser'],
  ['ein', 'Mixed', 'after ein, kein, mein, dein, sein, ihr, unser'],
  ['none', 'Strong', 'no article at all'],
];

const darkMode = window.matchMedia('(prefers-color-scheme: dark)');

/* Hue carries the posterior mean, strength carries the evidence: a cell you
   have answered twice is visibly paler than one you have answered thirty
   times at the same accuracy. */
function shade(mean, n) {
  if (!n) return 'var(--panel)';
  const hue = 6 + 139 * Math.max(0, Math.min(1, mean));
  const conf = Math.min(1, n / 10);
  const sat = Math.round(34 + 30 * conf);
  const lum = darkMode.matches ? 38 : 60;
  const mix = Math.round(52 + 44 * conf);
  return `color-mix(in srgb, hsl(${hue} ${sat}% ${lum}%) ${mix}%, var(--panel))`;
}
darkMode.addEventListener('change', () => renderGrid());

function renderGrid() {
  const data = gridData(app.state, app.attempts);
  const byKey = new Map(data.map(d => [d.cell.key, d]));
  const out = [];

  for (const [ac, title, subtitle] of BLOCKS) {
    out.push(`<div class="table-block"><h3>${title}</h3><p class="after">${subtitle}</p>
      <table class="grid"><thead><tr><th class="row-head"></th>
      <th>Masc.</th><th>Fem.</th><th>Neut.</th><th>Plural</th></tr></thead><tbody>`);
    for (const k of ['nom', 'acc', 'dat']) {
      out.push(`<tr><th class="row-head">${KASUS[k].slice(0, 3)}.</th>`);
      for (const g of ['m', 'f', 'n', 'pl']) {
        const d = byKey.get(`${ac}|${k}|${g}`);
        const pct = d.n ? Math.round(d.mean * 100) + '%' : '—';
        out.push(`<td><div class="cell" style="background:${shade(d.mean, d.n)}"
            title="${cellName(d.cell)} · ${pct} · ${d.n} scored">
            <span class="end">-${d.cell.ending}</span>
            <span class="n">${d.n ? pct + ' · ' + d.n : '·'}</span></div></td>`);
      }
      out.push('</tr>');
    }
    out.push('</tbody></table></div>');
  }
  $('grids').innerHTML = out.join('');
}

/* ===========================================================================
 * Mistakes
 * ======================================================================== */
function renderMistakes() {
  const rows = mistakes(app.attempts, 50);
  if (!rows.length) {
    $('mistakes').innerHTML = '<p class="empty">Nothing wrong yet.</p>';
    return;
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const body = rows.map(r => {
    const marked = esc(r.prompt).replace(
      new RegExp(`(${r.adj.lemma})${r.expected}`),
      (_, stem) => `${stem}<b>${r.expected}</b>`);
    return `<tr>
      <td class="sent">${marked}</td>
      <td class="given">${esc(r.given) || '—'} → ${esc(r.expected)}</td>
      <td class="when">${when(r.ts)}</td></tr>`;
  }).join('');
  $('mistakes').innerHTML = `<table class="mistakes"><thead><tr>
    <th>Sentence</th><th>You / right</th><th>When</th></tr></thead><tbody>${body}</tbody></table>`;
}

function when(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ===========================================================================
 * Navigation, settings, install
 * ======================================================================== */
function show(screen) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  $(`screen-${screen}`).classList.add('active');
  for (const t of document.querySelectorAll('.tab'))
    t.setAttribute('aria-selected', String(t.dataset.screen === screen));
  if (screen === 'practice' && !app.answered && $('summary').hidden) $('answer').focus();
}

for (const t of document.querySelectorAll('.tab')) {
  t.addEventListener('click', () => show(t.dataset.screen));
}

$('answer').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.stopPropagation();   // the last Enter must not also reach the restart handler
  if (app.answered) advance(); else submit();
});
// Keep Enter working after a tap elsewhere on the page.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!$('screen-practice').classList.contains('active')) return;
  if (document.activeElement === $('answer') || $('settings').open) return;
  if (!$('summary').hidden) { e.preventDefault(); startSession(); return;}
  e.preventDefault();
  if (app.answered) advance(); else submit();
});
$('advance').addEventListener('click', () => {
  if (app.answered) advance(); else submit();
  // Re-focusing inside the click gesture reopens the phone keyboard.
  if (!app.answered) $('answer').focus();
});

$('again').addEventListener('click', startSession);

$('settings-open').addEventListener('click', () => {
  $('hints-toggle').checked = !!app.settings.hints;
  const scored = app.attempts.filter(a => a.error_kind !== 'empty' && a.error_kind !== 'junk');
  const days = new Set(app.attempts.map(a => a.ts.slice(0, 10))).size;
  const acc = scored.length
    ? Math.round(100 * scored.filter(a => a.correct).length / scored.length) : 0;
  $('stats').textContent =
    `${scored.length} scored attempts over ${days} day${days === 1 ? '' : 's'}, ${acc}% right.`;
  renderAiFields();
  const sw = navigator.serviceWorker?.controller ? 'cached offline' : 'not cached yet';
  $('build').textContent = `Build ${APP_VERSION} — ${sw}.`;
  $('settings').showModal();
});

$('hints-toggle').addEventListener('change', e => {
  app.settings.hints = e.target.checked;
  store.saveSettings(app.settings);
});

$('export').addEventListener('click', () => {
  const blob = new Blob([store.exportAll()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `adjektivendungen-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const n = store.importAll(await file.text());
    app.attempts = store.loadAttempts();
    app.settings = store.loadSettings();
    app.state = rebuildState(app.attempts);
    renderGrid(); renderMistakes(); startSession();
    alert(`Imported ${n} attempts.`);
  } catch (err) {
    alert(`Could not read that file: ${err.message}`);
  }
  e.target.value = '';
});

$('reset').addEventListener('click', () => {
  if (!confirm('Erase every attempt and start from no knowledge? This cannot be undone.')) return;
  app.attempts = [];
  store.saveAttempts([]);
  app.state = rebuildState([]);
  renderGrid(); renderMistakes(); startSession();
});

/* ===========================================================================
 * Model-written items: settings, pool gauge, refill
 * ======================================================================== */
function renderPool() {
  const st = pool.status();
  const pct = Math.round(100 * st.total / st.capacity);
  $('pool-bar').style.width = `${Math.min(100, pct)}%`;
  $('pool-status').textContent = st.total
    ? `${st.total} sentences ready (${pct}% full). ${st.empty} of 36 cells empty.`
    : 'Pool empty — the built-in generator is supplying every item.';
  const last = st.log.filter(l => l.event === 'refill').slice(-1)[0];
  const err = st.log.filter(l => l.event === 'error').slice(-1)[0];
  $('refill-log').textContent = err && (!last || err.at > last.at)
    ? `Last refill failed: ${err.message}`
    : last
      ? `Last refill: kept ${last.kept}, rejected ${last.rejected}` +
        (Object.keys(last.reasons || {}).length
          ? ` (${Object.entries(last.reasons).map(([k, v]) => `${k} x${v}`).join(', ')})` : '')
      : '';
}

function renderAiFields() {
  const cfg = loadConfig();
  $('ai-toggle').checked = cfg.enabled;
  const sel = $('ai-provider');
  if (!sel.options.length) {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      sel.add(new Option(p.label, id));
    }
  }
  sel.value = cfg.provider;
  $('ai-base').value = cfg.base;
  $('ai-model').value = cfg.model;
  $('ai-model').placeholder = (PROVIDERS[cfg.provider] || {}).hint || 'model id';
  $('ai-key').value = cfg.apiKey;
  renderPool();
}

function readAiFields() {
  saveConfig({
    enabled: $('ai-toggle').checked,
    provider: $('ai-provider').value,
    base: $('ai-base').value.trim(),
    model: $('ai-model').value.trim(),
    apiKey: $('ai-key').value.trim(),
  });
}

$('ai-toggle').addEventListener('change', () => {
  readAiFields();
  if ($('ai-toggle').checked) maybeRefill();
});
$('ai-provider').addEventListener('change', e => {
  const d = PROVIDERS[e.target.value];
  if (d) {
    $('ai-base').value = d.base;
    $('ai-model').value = d.model || '';
    $('ai-model').placeholder = d.hint || 'model id';
  }
  readAiFields();
});
for (const id of ['ai-base', 'ai-model', 'ai-key']) {
  $(id).addEventListener('change', () => {
    if (id === 'ai-key' && $('ai-key').value.trim() && !$('ai-toggle').checked) {
      $('ai-toggle').checked = true;
    }
    readAiFields();
  });
}

let refilling = false;
async function doRefill(opts) {
  if (refilling) return;
  refilling = true;
  const btn = $('refill');
  const was = btn.textContent;
  btn.textContent = 'Refilling...';
  btn.disabled = true;
  try {
    const r = await refill({
      ...opts,
      onProgress: p => {
        btn.textContent = `Refilling... ${p.kept} kept`;
        renderPool();
      },
    });
    renderPool();
    if (r.reason && (!r.ok || r.rateLimited)) $('refill-log').textContent = r.reason;
  } finally {
    btn.textContent = was; btn.disabled = false; refilling = false;
  }
}

/* Called after every session. Tops up quietly in the background and never
   blocks you from practising — the static generator covers any gap. */
function maybeRefill() {
  if (!isConfigured() || !navigator.onLine || refilling) return;
  if (pool.lowCells().length === 0) return;
  doRefill({ maxCalls: 8, full: false }).catch(() => {});
}

$('refill').addEventListener('click', () => doRefill({ full: true }));
$('pool-clear').addEventListener('click', () => {
  if (!confirm('Throw away every model-written sentence in the pool?')) return;
  pool.clear(); renderPool();
});

$('flag').addEventListener('click', () => {
  if (!app.flagged) return;
  pool.remove(app.flagged.full_sentence);
  $('provenance').querySelector('span').textContent = 'Flagged and removed from the pool.';
  $('flag').hidden = true;
});

/* Install prompt — Chrome fires this once the PWA criteria are met. */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('install').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install').hidden = true;
});
window.addEventListener('appinstalled', () => { $('install').hidden = true; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.warn('service worker not registered:', err.message));
  });
}

/* ───────────────────────────── go ───────────────────────────── */
renderGrid();
renderMistakes();
startSession();
