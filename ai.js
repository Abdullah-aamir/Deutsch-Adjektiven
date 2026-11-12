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
  mistral: {
    label: 'Mistral (direct)', base: 'https://api.mistral.ai/v1',
    model: 'mistral-large-4', hint: 'mistral-large-4',
  },
  openrouter: {
    label: 'OpenRouter', base: 'https://openrouter.ai/api/v1',
    model: 'mistralai/mistral-large-4-0', hint: 'mistralai/mistral-large-4-0',
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

export function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
  const provider = saved.provider || 'mistral';
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
    max_tokens: 1600,
    messages: [
      { role: 'system', content: 'You are a careful German teacher. You reply with JSON only.' },
      { role: 'user', content: prompt },
    ],
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };

  return fetch(`${cfg.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  });
}

async function callModel(cfg, prompt, signal) {
  // Not every endpoint accepts response_format. If one rejects it, ask again
  // without — the parser below copes with JSON wrapped in prose anyway.
  let res = await post(cfg, prompt, signal, true);
  if (res.status === 400) {
    const peek = await res.clone().text().catch(() => '');
    if (/response_format|json/i.test(peek)) res = await post(cfg, prompt, signal, false);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 160) : ''}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);           // some models wrap it in prose
    if (!m) throw new Error('model did not return JSON');
    parsed = JSON.parse(m[0]);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.sentences || [];
  if (!Array.isArray(items)) throw new Error('no items array in the reply');
  return items;
}

/**
 * Top up the emptiest cells. Safe to call at any time: it does nothing
 * without a key, when offline, or when every cell is above the low-water
 * mark. Never throws into the UI — it reports instead.
 *
 * @param onProgress called with ({done, total, cell, kept, rejected})
 */
export async function refill({ maxCalls = 40, full = false, signal, onProgress } = {}) {
  const cfg = loadConfig();
  if (!cfg.enabled) return { ok: false, reason: 'AI items are switched off.' };
  if (!cfg.apiKey) return { ok: false, reason: 'No API key saved.' };
  if (!cfg.base || !cfg.model) return { ok: false, reason: 'No endpoint or model set.' };
  if (!navigator.onLine) return { ok: false, reason: 'Offline — the pool will be topped up next time you are online.' };

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
      const raw = await callModel(cfg, buildPrompt(cell, want), signal);
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
      pool.note({ event: 'error', cell: cell.key, message: String(err.message || err) });
      return { ok: false, reason: `${err.message || err}`, kept, rejected, reasons };
    }
  }

  pool.note({ event: 'refill', kept, rejected, reasons });
  return { ok: true, kept, rejected, reasons, calls };
}

export { CELLS };
