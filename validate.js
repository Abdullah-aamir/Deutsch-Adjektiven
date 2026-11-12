/* validate.js — the gate every model-written item must pass.
 *
 * The model is allowed to be wrong. It is not allowed to be wrong *and
 * believed*. Nothing here asks a model whether a model was right: every check
 * is a comparison against the 36-cell table, a closed word list, or the
 * item's own internal consistency.
 *
 * The one error that actually hurts is a wrong gender, because that produces
 * a wrong answer key rather than a silly sentence. We catch it by asking the
 * model for the noun's nominative article and checking it against the gender
 * the cell demands — models are far better at "das Wasser" than at
 * "mit frischem Wasser", so this turns the strong skill into a guard on the
 * weak one.
 */

import { CELL_BY_KEY, TWO_WAY_PREPOSITIONS, INDECLINABLE, NOUNS } from './data.js';

export const ARTICLE_TO_GENDER = { der: 'm', die: 'f', das: 'n' };

/* Our own 120 nouns, verified by hand. A model-proposed noun that happens to
   be one of these can be checked properly; anything else is self-consistent
   at best, and is labelled as such rather than dressed up as verified. */
const KNOWN = new Map(NOUNS.map(n => [n.lemma.toLowerCase(), n]));

/* Prepositions that govern exactly one case. If the sentence uses one of
   these, the case is a fact and not a claim. */
export const ONE_CASE_PREPOSITIONS = {
  dat: ['mit', 'aus', 'bei', 'nach', 'seit', 'von', 'zu', 'gegenüber', 'ab', 'außer'],
  acc: ['für', 'ohne', 'durch', 'gegen', 'um', 'bis', 'entlang'],
};

export class Rejected extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

const str = v => (typeof v === 'string' ? v.trim() : '');

/**
 * @param raw  what the model returned for one item
 * @param cell the cell it was asked to write for
 * @returns {{item: object, trust: 'verified'|'self-consistent'}}
 * @throws  Rejected with a machine-readable reason
 */
export function validateItem(raw, cell) {
  if (!raw || typeof raw !== 'object') throw new Rejected('not-an-object');

  const sentence = str(raw.sentence);
  const adjective = str(raw.adjective).toLowerCase();
  const noun = str(raw.noun);
  const article = str(raw.article).toLowerCase();

  if (!sentence || !adjective || !noun) throw new Rejected('missing-fields');

  /* ---- 1. the adjective must be one we can safely suffix ---------------- */
  if (/(el|er|e)$/.test(adjective)) throw new Rejected('adjective-stem-changes');
  if (adjective === 'hoch') throw new Rejected('adjective-hoch');
  if (INDECLINABLE.includes(adjective)) throw new Rejected('adjective-indeclinable');
  if (!/^[a-zäöüß]+$/.test(adjective)) throw new Rejected('adjective-not-a-word');

  /* ---- 2. gender: the check that protects the answer key ---------------- */
  const wantGender = cell.gender_num;
  const known = KNOWN.get(noun.toLowerCase());

  let trust = 'self-consistent';
  if (wantGender === 'pl') {
    // A plural slot needs a plural noun form; we cannot confirm it from a
    // dictionary, but we can insist the model said so and that the dative
    // plural looks like one.
    if (raw.number && str(raw.number) !== 'pl') throw new Rejected('number-mismatch');
    if (cell.kasus === 'dat' && !/[ns]$/.test(noun)) throw new Rejected('dative-plural-form');
    if (known) trust = 'verified';
  } else {
    if (!article) throw new Rejected('no-article-claim');
    const claimed = ARTICLE_TO_GENDER[article];
    if (!claimed) throw new Rejected('article-not-der-die-das');
    // The model's own article contradicting the slot it was asked to fill is
    // the signature of a hallucinated gender.
    if (claimed !== wantGender) throw new Rejected(`gender-contradiction:${article}`);
    if (known) {
      if (known.gender !== wantGender) throw new Rejected('gender-wrong-vs-lexicon');
      trust = 'verified';
    }
  }

  /* ---- 3. case: a fact when a one-case preposition governs OUR phrase ----
   * Only the preposition heading this noun phrase tells us anything. A
   * preposition elsewhere in the sentence governs some other phrase:
   * "Gute Weine kommen aus Italien" is a nominative item that happens to
   * contain a dative PP, and rejecting it would be wrong. */
  const words = sentence.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const governor = findGovernor(words, adjective + cell.ending);

  if (governor) {
    if (TWO_WAY_PREPOSITIONS.includes(governor)) {
      throw new Rejected(`two-way-preposition:${governor}`);
    }
    for (const [kasus, preps] of Object.entries(ONE_CASE_PREPOSITIONS)) {
      if (!preps.includes(governor)) continue;
      if (kasus !== cell.kasus) throw new Rejected(`preposition-wrong-case:${governor}`);
    }
  }

  /* ---- 4. the ending comes from our table, never from the model -------- */
  const authority = CELL_BY_KEY.get(cell.key);
  if (!authority) throw new Rejected('unknown-cell');
  const ending = authority.ending;
  if (raw.ending && str(raw.ending).toLowerCase().replace(/^-/, '') !== ending) {
    // The model disagreeing with the table is cheap evidence the whole item
    // was reasoned badly. Throw it away rather than silently correcting it.
    throw new Rejected(`ending-disagreement:${str(raw.ending)}`);
  }

  /* ---- 5. the sentence must actually contain the inflected adjective --- */
  const inflected = adjective + ending;
  const idx = findWord(sentence, inflected);
  if (idx < 0) throw new Rejected('adjective-not-in-sentence');
  if (findWord(sentence, inflected, idx + 1) >= 0) throw new Rejected('adjective-twice');
  if (!findWordExact(sentence, noun)) throw new Rejected('noun-not-in-sentence');

  /* ---- 6. shape ---------------------------------------------------------- */
  if (!/^[A-ZÄÖÜ]/.test(sentence)) throw new Rejected('no-capital');
  if (!/[.!?]$/.test(sentence)) throw new Rejected('no-final-punctuation');
  if (/\s{2,}/.test(sentence)) throw new Rejected('double-space');
  if (/\s[.!?,]/.test(sentence)) throw new Rejected('space-before-punctuation');
  if (sentence.length > 90) throw new Rejected('too-long');
  if (words.length < 3) throw new Rejected('too-short');
  if (/[_\[\]{}<>*#|]/.test(sentence)) throw new Rejected('markup-in-sentence');

  /* ---- 7. split into prompt halves at the blank ------------------------- */
  const before = sentence.slice(0, idx) + adjective;
  const after = sentence.slice(idx + inflected.length);

  return {
    trust,
    item: {
      item_id: `ai-${cell.id}-${hash(sentence)}`,
      cell_id: cell.id,
      cell: { article_class: cell.article_class, kasus: cell.kasus, gender_num: cell.gender_num },
      prompt_before: before,
      prompt_after: after,
      expected: ending,
      full_sentence: sentence,
      explanation: authority.explanation,
      hint: cell.article_class === 'none'
        ? { m: 'der', f: 'die', n: 'das', pl: 'die' }[cell.gender_num] : null,
      hint_shown: cell.article_class === 'none' ? 1 : 0,
      adj_lemma: adjective,
      noun_lemma: noun,
      source: 'ai',
      trust,
      frame_id: null, noun_id: known ? known.id : null, adj_id: null,
    },
  };
}

/**
 * The preposition heading this noun phrase, if any: scan back from the
 * inflected adjective past at most an article and a second adjective. Beyond
 * that we are in a different phrase and it tells us nothing about our case.
 */
const ALL_PREPS = new Set([
  ...TWO_WAY_PREPOSITIONS,
  ...ONE_CASE_PREPOSITIONS.dat,
  ...ONE_CASE_PREPOSITIONS.acc,
]);
const ARTICLE_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner',
  'mein', 'meine', 'meinen', 'meinem', 'meiner',
  'dein', 'deine', 'deinen', 'deinem', 'deiner',
  'sein', 'seine', 'seinen', 'seinem', 'seiner',
  'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer',
  'dies', 'diese', 'dieser', 'diesen', 'diesem', 'dieses',
  'im', 'am', 'zum', 'zur', 'vom', 'beim', 'ins', 'ans',
]);

function findGovernor(words, inflected) {
  const at = words.indexOf(inflected.toLowerCase());
  if (at <= 0) return null;
  for (let i = at - 1; i >= 0 && i >= at - 3; i--) {
    const w = words[i];
    if (ALL_PREPS.has(w)) return w;
    if (ARTICLE_WORDS.has(w)) continue;   // an article sits between prep and adjective
    return null;                          // anything else ends the phrase
  }
  return null;
}

/* Find a whole word, so "gut" does not match inside "gute". */
function findWord(sentence, word, from = 0) {
  const re = new RegExp(`(?<![\\p{L}])${escape(word)}(?![\\p{L}])`, 'iu');
  const sub = sentence.slice(from);
  const m = sub.match(re);
  return m ? from + m.index : -1;
}
const findWordExact = (sentence, word) => findWord(sentence, word) >= 0;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Validate a batch, returning what survived and why the rest did not. */
export function validateBatch(rawItems, cell) {
  const kept = [], rejected = [];
  for (const raw of rawItems || []) {
    try {
      const { item } = validateItem(raw, cell);
      kept.push(item);
    } catch (e) {
      rejected.push({ reason: e.reason || 'error', sentence: str(raw?.sentence).slice(0, 70) });
    }
  }
  return { kept, rejected };
}
