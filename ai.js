/* ai.js — bring-your-own-key client for an OpenAI-compatible endpoint.
 *
 * The key is yours and stays in this browser profile; nothing is proxied
 * through anyone. The model is asked for sentences and for the facts we need
 * to check them, and is never asked for the answer key — see validate.js.
 */

import { CELLS } from './data.js';
import { validateBatch } from './validate.js';
import { pool, REFILL_BATCH, TARGET_PER_CELL } from './pool.js';

const KEY = 'aet.ai.v1';

/* Base URLs are stable; model IDs are not. Mistral Large 4 ("Le Chonk") is
   Mistral's current open-weight flagship — 1.05T parameters, 52B active,
   released under the Mistral Ecosystem Open Weight License v26.10. Its API is
   OpenAI-compatible, so this client talks to it unchanged.

   Note the ID differs by provider: Mistral's own API takes "mistral-large-4",
   OpenRouter takes "mistralai/mistral-large-4-0". Pin the version rather than
   using the "mistral-large-latest" alias, which moves under you when Mistral
   ships a new flagship. */
export const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter (free tier)', base: 'https://openrouter.ai/api/v1',
    model: 'google/gemma-4-31b-it:free',
    hint: 'any :free id — see the README for alternates',
    free: true,
  },
  mistral: {
    label: 'Mistral (paid)', base: 'https://api.mistral.ai/v1',
    model: 'mistral-large-4', hint: 'mistral-large-4',
  },
  together: {
    label: 'Together', base: 'https://api.together.xyz/v1',
    model: '', hint: "check Together's current model list",
  },
  groq: {
    label: 'Groq', base: 'https://api.groq.com/openai/v1',
    model: '', hint: "check Groq's current model list",
  },
  deepinfra: {
    label: 'DeepInfra', base: 'https://api.deepinfra.com/v1/openai',
    model: '', hint: "check DeepInfra's current model list",
  },
  custom: {
    label: 'Custom (OpenAI-compatible)', base: '',
    model: '', hint: 'any /chat/completions endpoint',
  },
};

/* OpenRouter's free tier allows 20 requests a minute and 50 a day (1,000 a
   day once you have bought credits). A full pool is about 50 calls, so it
   costs roughly one day's free budget to fill and a handful of calls a month
   to keep topped up. The refill stops short of the cap rather than running
   into it. */
export const FREE_TIER_CALL_BUDGET = 40;

export function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
  const provider = saved.provider || 'openrouter';
  const d = PROVIDERS[provider] || PROVIDERS.custom;
  return {
    enabled: !!saved.enabled,
    provider,
    base: saved.base || d.base,
    model: saved.model ?? d.model ?? '',
    apiKey: saved.apiKey || '',
    ...saved,
  };
}
export function saveConfig(cfg) { localStorage.setItem(KEY, JSON.stringify(cfg)); }
export const isConfigured = () => {
  const c = loadConfig();
  return !!(c.enabled && c.apiKey && c.base && c.model);
};

const GENDER_WORD = { m: 'masculine (der)', f: 'feminine (die)', n: 'neuter (das)', pl: 'plural (die)' };
const KASUS_WORD = { nom: 'nominative', acc: 'accusative', dat: 'dative' };
const CLASS_WORD = {
  def: 'after a definite article (der/die/das/dieser)',
  ein: 'after an ein-word (ein/kein/mein/dein/sein/ihr/unser)',
  none: 'with no article at all',
};

/* The prompt states the ending, so the model writes correct German, and then
   asks for the noun's dictionary article separately. If the article it gives
   contradicts the gender the slot requires, the item is discarded — that is
   the gender check, and it only works because the two facts are asked for
   independently. */
function buildPrompt(cell, n) {
  const wantsPlural = cell.gender_num === 'pl';
  return `You write example sentences for a German adjective-ending trainer.

Write ${n} DIFFERENT short everyday German sentences. Each one must contain exactly one attributive adjective in this grammatical slot:

- article: ${CLASS_WORD[cell.article_class]}
- case: ${KASUS_WORD[cell.kasus]}
- noun: ${GENDER_WORD[cell.gender_num]}${wantsPlural ? ', written in its plural form' : ', singular'}
- the adjective therefore ends in "-${cell.ending}"

Rules:
- Everyday A2/B1 vocabulary. Vary the nouns, adjectives and sentence patterns; do not reuse a noun.
- The adjective and noun must make sense together. "saftiger Kaffee" and "wildes Zimmer" are the kind of thing to avoid.
- Never use in, an, auf, über, unter, vor, hinter, neben or zwischen: their case is ambiguous.
- Do not use an adjective whose dictionary form ends in -e, -el or -er (leise, dunkel, teuer), or "hoch".
- Avoid weak masculine nouns (Student, Junge, Kollege, Mensch, Name).
- 4 to 10 words. One sentence, ending in a full stop.${wantsPlural && cell.kasus === 'dat'
    ? '\n- This is the dative plural, so the noun itself takes its dative-plural form (Kindern, Büchern, Eiern).' : ''}

Return ONLY a JSON object: {"items":[...]} where each item is:
{
  "sentence": "the full sentence with the adjective already correctly inflected",
  "adjective": "the adjective's dictionary form, no ending",
  "noun": "the noun exactly as it appears in the sentence",
  "article": "the noun's dictionary article in the nominative singular: der, die or das${wantsPlural ? ' (give the singular article even though the sentence is plural)' : ''}",
  "number": "${wantsPlural ? 'pl' : 'sg'}",
  "ending": "${cell.ending}"
}

Be exact about "article": it is the dictionary gender of the noun, not the word used in the sentence.`;
}

async function post(cfg, prompt, signal, withJsonMode) {
  const body = {
    model: cfg.model,
    temperature: 0.9,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: 'You are a careful German teacher. You reply with JSON only.' },
      { role: 'user', content: prompt },
    ],
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  return fetch(`${cfg.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal, headers, body: JSON.stringify(body),
  });
}

/* ---------------------------------------------------------------------------
 * Reading the reply.
 *
 * Models do not reliably return bare JSON. They wrap it in prose, in markdown
 * fences, or in <think> blocks; reasoning models spend the token budget
 * thinking and get cut off mid-array. None of that should surface as a raw
 * "Expected ',' or ']'" from JSON.parse, and a truncated reply should still
 * give up the items that did arrive — on a free tier a wasted call is a real
 * cost.
 * ------------------------------------------------------------------------ */

function stripNoise(text) {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?(?:think|thinking|reasoning|scratchpad)>/gi, '')
    .replace(/```(?:json|javascript)?/gi, '')
    .trim();
}

const tryParse = t => { try { return JSON.parse(t); } catch { return null; } };

/** The balanced {...} or [...] starting at i, or null if it never closes. */
function balancedFrom(text, i) {
  const open = text[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { if (inStr) esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(i, j + 1);
  }
  return null;
}

const itemsOf = v =>
  Array.isArray(v) ? v
    : (v && typeof v === 'object' && (v.items || v.sentences || v.data || v.examples)) || [];

export function extractItems(rawText) {
  const text = stripNoise(rawText);
  if (!text) throw new Error('the model returned an empty reply');

  // 1. the whole thing is JSON
  const whole = tryParse(text);
  if (whole) {
    const it = itemsOf(whole);
    if (Array.isArray(it) && it.length) return it;
  }

  // 2. the first balanced block that yields items
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    const chunk = balancedFrom(text, i);
    // An unbalanced opener means this block was truncated; a later one may
    // still be whole, so keep scanning rather than giving up here.
    if (!chunk) continue;
    const parsed = tryParse(chunk);
    const it = parsed ? itemsOf(parsed) : [];
    if (Array.isArray(it) && it.length) return it;
    if (chunk) i += chunk.length - 1;
  }

  // 3. truncated mid-array: keep every object that did arrive complete
  const salvaged = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const chunk = balancedFrom(text, i);
    if (!chunk) continue;
    const obj = tryParse(chunk);
    if (obj && typeof obj === 'object' && typeof obj.sentence === 'string') salvaged.push(obj);
    i += chunk.length - 1;
  }
  if (salvaged.length) return salvaged;

  throw new Error(
    `could not read JSON from the reply (${text.length} chars, begins "${text.slice(0, 50)}")`);
}

async function callModel(cfg, prompt, signal) {
  // Not every endpoint accepts response_format. If one rejects it, ask again
  // without — the reader above copes with JSON wrapped in prose anyway.
  let res;
  try {
    res = await post(cfg, prompt, signal, true);
    if (res.status === 400) {
      const peek = await res.clone().text().catch(() => '');
      if (/response_format|json/i.test(peek)) res = await post(cfg, prompt, signal, false);
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // fetch() rejects with a bare TypeError for CORS, DNS and blocked requests.
    const err = new Error(
      'Could not reach the endpoint. Check the URL, and note that a page opened ' +
      'from file:// or inside a sandboxed preview is usually blocked from calling ' +
      'other sites — deploy it and try there.');
    err.cause = e;
    throw err;
  }

  if (res.status === 429) {
    const err = new Error('rate-limited');
    err.rateLimited = true;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${res.status} — the API key was rejected by this endpoint.`);
  }
  if (res.status === 404) {
    throw new Error(`404 — "${cfg.model}" is not a model this endpoint serves. ` +
      'Free model IDs are withdrawn without notice; try another.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 160) : ''}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content ?? '';
  const cut = choice?.finish_reason === 'length';

  try {
    return extractItems(text);
  } catch (e) {
    if (cut) {
      throw new Error('the reply was cut off before any complete sentence arrived — ' +
        'this model spends its budget on reasoning. Try a non-reasoning model.');
    }
    throw e;
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
});

export async function refill({ maxCalls, full = false, signal, onProgress } = {}) {
  const cfg = loadConfig();
  if (!cfg.enabled) return { ok: false, reason: 'AI items are switched off.' };
  if (!cfg.apiKey) return { ok: false, reason: 'No API key saved.' };
  if (!cfg.base || !cfg.model) return { ok: false, reason: 'No endpoint or model set.' };
  if (!navigator.onLine) return { ok: false, reason: 'Offline — the pool will be topped up next time you are online.' };

  // Stay inside the free daily allowance unless the user is on a paid model.
  const budget = maxCalls ?? (PROVIDERS[cfg.provider]?.free || /:free$/.test(cfg.model)
    ? FREE_TIER_CALL_BUDGET : 60);
  maxCalls = budget;

  let calls = 0, kept = 0, rejected = 0;
  const reasons = {};
  const tried = new Map();   // a cell the model cannot write for must not loop

  while (calls < maxCalls) {
    const targets = (full ? pool.hungryCells() : pool.lowCells())
      .filter(t => (tried.get(t.cell.id) || 0) < 2);
    if (!targets.length) break;

    const { cell, n } = targets[0];
    tried.set(cell.id, (tried.get(cell.id) || 0) + 1);
    const want = Math.max(2, Math.min(REFILL_BATCH, TARGET_PER_CELL - n));

    try {
      calls++;
      let raw;
      try {
        raw = await callModel(cfg, buildPrompt(cell, want), signal);
      } catch (e) {
        if (!e.rateLimited) throw e;
        // 20 requests a minute on the free tier: wait out the window once.
        await sleep(Math.min(20, e.retryAfter || 8) * 1000, signal);
        raw = await callModel(cfg, buildPrompt(cell, want), signal);
      }
      const r = validateBatch(raw, cell);
      const added = pool.add(cell.id, r.kept);
      kept += added;
      rejected += r.rejected.length;
      for (const x of r.rejected) reasons[x.reason] = (reasons[x.reason] || 0) + 1;
      // A cell that gained nothing twice is skipped rather than retried forever.
      if (added > 0) tried.set(cell.id, 0);
      onProgress?.({ calls, cell, kept, rejected, remaining: targets.length });
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, reason: 'Refill cancelled.', kept, rejected };
      if (err.rateLimited) {
        // Out of free quota for now. Keep what we got; the pool and the
        // static generator both still work.
        pool.note({ event: 'refill', kept, rejected, reasons });
        return {
          ok: true, kept, rejected, reasons, calls, rateLimited: true,
          reason: `Free-tier limit reached after ${calls} calls — kept ${kept}. ` +
                  'Try again later; the pool and the built-in generator keep working meanwhile.',
        };
      }
      pool.note({ event: 'error', cell: cell.key, message: String(err.message || err) });
      return { ok: false, reason: `${err.message || err}`, kept, rejected, reasons };
    }
  }

  pool.note({ event: 'refill', kept, rejected, reasons });
  return { ok: true, kept, rejected, reasons, calls };
}

/**
 * One call, reported in full: reachability, auth, model id, whether the reply
 * could be read, and how much of it survived the validator. Costs a single
 * request out of the daily allowance and replaces a guessing game.
 */
export async function testConnection({ signal } = {}) {
  const cfg = loadConfig();
  if (!cfg.apiKey) return { ok: false, detail: 'No API key saved.' };
  if (!cfg.base || !cfg.model) return { ok: false, detail: 'No endpoint or model set.' };

  const cell = CELLS.find(c => c.key === 'def|acc|m') || CELLS[0];
  try {
    const raw = await callModel(cfg, buildPrompt(cell, 3), signal);
    const r = validateBatch(raw, cell);
    const reasons = r.rejected.map(x => x.reason.split(':')[0]);
    return {
      ok: true,
      detail: `Reached ${cfg.model}: ${raw.length} sentence(s) back, ` +
        `${r.kept.length} passed, ${r.rejected.length} rejected` +
        (reasons.length ? ` (${[...new Set(reasons)].join(', ')})` : '') + '.',
    };
  } catch (err) {
    if (err.rateLimited) return { ok: false, detail: 'Rate-limited — the free daily allowance is used up.' };
    return { ok: false, detail: String(err.message || err) };
  }
}

export { CELLS };
