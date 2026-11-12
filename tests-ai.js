/* tests-ai.js — the rejection path.
 *
 * The question these tests answer is not "does the model write good German".
 * It is "when the model writes bad German, does any of it reach the learner".
 * So every case below is something a real model actually does wrong.
 *
 * Run: node tests-ai.js
 */

import { CELL_BY_KEY } from './data.js';
import { validateItem, validateBatch, Rejected } from './validate.js';
import { extractItems } from './ai.js';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (e) { failed++; failures.push([name, e.message]); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const cell = k => CELL_BY_KEY.get(k);

/** Assert that an item is rejected, and for the right reason. */
function rejects(k, raw, expectedReason) {
  try {
    validateItem(raw, cell(k));
  } catch (e) {
    assert(e instanceof Rejected, `threw ${e.constructor.name}: ${e.message}`);
    if (expectedReason) {
      assert(e.reason.startsWith(expectedReason),
        `rejected for "${e.reason}", expected "${expectedReason}"`);
    }
    return e.reason;
  }
  throw new Error('item was ACCEPTED but should have been rejected');
}

function accepts(k, raw) {
  try { return validateItem(raw, cell(k)); }
  catch (e) { throw new Error(`rejected a good item for "${e.reason || e.message}"`); }
}

console.log('\nModel-written items — rejection path\n');

/* A well-formed item for strong dative neuter: "Sie kocht mit heißem Wasser." */
const good = {
  sentence: 'Sie kocht mit heißem Wasser.',
  adjective: 'heiß', noun: 'Wasser', article: 'das', number: 'sg', ending: 'em',
};

test('a correct item is accepted and split at the blank', () => {
  const { item, trust } = accepts('none|dat|n', good);
  eq(item.expected, 'em', 'ending comes from the table:');
  eq(item.prompt_before, 'Sie kocht mit heiß');
  eq(item.prompt_after, ' Wasser.');
  eq(item.full_sentence, 'Sie kocht mit heißem Wasser.');
  eq(item.source, 'ai');
  eq(trust, 'verified', 'Wasser is in our own lexicon, so gender is checked properly');
  eq(item.hint, 'das', 'strong cells still carry the gender hint');
});

test('THE important one: a hallucinated gender is caught', () => {
  // The model picks a masculine noun for a neuter slot but states the article
  // honestly. This is the error that would produce a wrong answer key.
  const r = rejects('none|dat|n', {
    ...good, sentence: 'Sie kocht mit heißem Kaffee.', noun: 'Kaffee', article: 'der',
  }, 'gender-contradiction');
  eq(r, 'gender-contradiction:der');
});

test('a gender that contradicts our own lexicon is caught even if self-consistent', () => {
  // Model confidently claims Wasser is masculine, in a masculine slot.
  // Internally consistent, still wrong, and we happen to know it.
  rejects('none|dat|m', {
    sentence: 'Sie kocht mit heißem Wasser.',
    adjective: 'heiß', noun: 'Wasser', article: 'der', number: 'sg', ending: 'em',
  }, 'gender-wrong-vs-lexicon');
});

test('the model disagreeing with the table about the ending is thrown away', () => {
  rejects('none|dat|n', { ...good, ending: 'en' }, 'ending-disagreement');
});

test('the ending is never taken from the model, only compared', () => {
  // No ending claim at all: we still produce the right key.
  const { item } = accepts('none|dat|n', { ...good, ending: undefined });
  eq(item.expected, 'em');
});

test('a two-way preposition is refused — its case is ambiguous', () => {
  rejects('def|dat|m', {
    sentence: 'Das Buch liegt auf dem kleinen Tisch.',
    adjective: 'klein', noun: 'Tisch', article: 'der', number: 'sg',
  }, 'two-way-preposition');
});

test('a preposition elsewhere in the sentence is not held against us', () => {
  // "Gute Weine kommen aus Italien." is a nominative item that happens to
  // contain a dative PP. Rejecting it was a real bug; only the preposition
  // heading our own phrase says anything about our case.
  accepts('none|nom|pl', {
    sentence: 'Gute Weine kommen aus Italien.',
    adjective: 'gut', noun: 'Weine', article: 'der', number: 'pl', ending: 'e',
  });
  accepts('def|acc|m', {
    sentence: 'Ich sehe den alten Mann mit dem Hund.',
    adjective: 'alt', noun: 'Mann', article: 'der', number: 'sg', ending: 'en',
  });
});

test('a one-case preposition governing the wrong case is refused', () => {
  // "ohne" is accusative; this item claims to be dative.
  rejects('def|dat|m', {
    sentence: 'Er geht ohne den alten Hund.',
    adjective: 'alt', noun: 'Hund', article: 'der', number: 'sg',
  }, 'preposition-wrong-case');
});

test('adjectives whose stem is shorter than the lemma are refused', () => {
  for (const adj of ['leise', 'dunkel', 'teuer']) {
    rejects('def|nom|m', {
      sentence: `Der ${adj}e Mann steht dort.`,
      adjective: adj, noun: 'Mann', article: 'der', number: 'sg',
    }, 'adjective-stem-changes');
  }
  rejects('def|nom|m', {
    sentence: 'Der hohe Turm steht dort.',
    adjective: 'hoch', noun: 'Turm', article: 'der', number: 'sg',
  }, 'adjective-hoch');
});

test('a sentence that does not contain the inflected adjective is refused', () => {
  // Model writes the uninflected form in the sentence — common failure.
  rejects('none|dat|n', { ...good, sentence: 'Sie kocht mit heiß Wasser.' },
    'adjective-not-in-sentence');
});

test('the adjective must appear exactly once, or the blank is ambiguous', () => {
  rejects('def|nom|pl', {
    sentence: 'Die alten Bücher und die alten Hefte stehen dort.',
    adjective: 'alt', noun: 'Bücher', article: 'das', number: 'pl', ending: 'en',
  }, 'adjective-twice');
});

test('a dative plural noun that is not in its dative-plural form is refused', () => {
  rejects('def|dat|pl', {
    sentence: 'Ich helfe den alten Kinder.',
    adjective: 'alt', noun: 'Kinder', article: 'das', number: 'pl', ending: 'en',
  }, 'dative-plural-form');
  // ...and the right form passes
  accepts('def|dat|pl', {
    sentence: 'Ich helfe den alten Kindern.',
    adjective: 'alt', noun: 'Kindern', article: 'das', number: 'pl', ending: 'en',
  });
});

test('malformed sentences are refused', () => {
  const base = { adjective: 'heiß', noun: 'Wasser', article: 'das', number: 'sg' };
  rejects('none|dat|n', { ...base, sentence: 'sie kocht mit heißem Wasser.' }, 'no-capital');
  rejects('none|dat|n', { ...base, sentence: 'Sie kocht mit heißem Wasser' }, 'no-final-punctuation');
  rejects('none|dat|n', { ...base, sentence: 'Sie kocht  mit heißem Wasser.' }, 'double-space');
  rejects('none|dat|n', { ...base, sentence: 'Sie kocht mit heißem Wasser .' }, 'space-before-punctuation');
  rejects('none|dat|n', { ...base, sentence: 'Sie kocht mit **heißem** Wasser.' }, 'markup-in-sentence');
});

test('junk input cannot crash the validator', () => {
  for (const junk of [null, undefined, 42, 'a string', {}, { sentence: '' }, []]) {
    try { validateItem(junk, cell('def|nom|m')); throw new Error(`accepted ${JSON.stringify(junk)}`); }
    catch (e) { assert(e instanceof Rejected, `threw ${e.message} for ${JSON.stringify(junk)}`); }
  }
});

test('a realistic mixed batch: the good survive, the bad are counted', () => {
  const c = cell('none|dat|n');
  const batch = [
    good,                                                              // keep
    { ...good, sentence: 'Sie kocht mit frischem Brot.', adjective: 'frisch', noun: 'Brot' },  // keep
    { ...good, sentence: 'Sie kocht mit heißem Kaffee.', noun: 'Kaffee', article: 'der' },     // gender
    { ...good, ending: 'en' },                                         // ending disagreement
    { ...good, sentence: 'Sie steht vor heißem Wasser.' },             // two-way preposition
    { sentence: 'Hm.', adjective: 'gut', noun: 'X', article: 'das' },  // junk
  ];
  const r = validateBatch(batch, c);
  eq(r.kept.length, 2, 'kept:');
  eq(r.rejected.length, 4, 'rejected:');
  const reasons = r.rejected.map(x => x.reason.split(':')[0]).sort();
  eq(reasons.join(','), 'adjective-not-in-sentence,ending-disagreement,gender-contradiction,two-way-preposition');
});

test('every surviving item carries the table ending for its own cell', () => {
  // Sweep all 36 cells with a plausible item and confirm the key is ours.
  const nouns = { m: ['Tisch', 'der'], f: ['Lampe', 'die'], n: ['Buch', 'das'] };
  let checked = 0;
  for (const [key, c] of CELL_BY_KEY) {
    const g = c.gender_num;
    const [noun, art] = g === 'pl' ? ['Kindern', 'das'] : nouns[g];
    if (g === 'pl' && c.kasus !== 'dat') continue;          // keep the fixture simple
    const sentence = `Ich helfe ${'alt' + c.ending} ${noun}.`;
    try {
      const { item } = validateItem(
        { sentence, adjective: 'alt', noun, article: art, number: g === 'pl' ? 'pl' : 'sg' }, c);
      eq(item.expected, c.ending, `${key}:`);
      checked++;
    } catch (e) {
      if (e.reason === 'preposition-wrong-case' || e.reason === 'no-article-claim') continue;
      throw new Error(`${key}: ${e.reason}`);
    }
  }
  assert(checked >= 12, `only ${checked} cells exercised`);
});

test('every one of the 36 cells can be filled by a cooperative model', () => {
  // If a cell were unreachable, the pool would silently never cover it and
  // that cell would quietly fall back to static items forever.
  const N = { m: ['Tisch', 'der'], f: ['Lampe', 'die'], n: ['Buch', 'das'] };
  const PL = { nom: ['Bücher', 'das'], acc: ['Bücher', 'das'], dat: ['Büchern', 'das'] };
  const VERB = { nom: '{np} steht dort.', acc: 'Ich sehe {np}.', dat: 'Ich helfe {np}.' };
  const ART = {
    def: { nom: { m: 'der', f: 'die', n: 'das', pl: 'die' }, acc: { m: 'den', f: 'die', n: 'das', pl: 'die' }, dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' } },
    ein: { nom: { m: 'ein', f: 'eine', n: 'ein', pl: 'keine' }, acc: { m: 'einen', f: 'eine', n: 'ein', pl: 'keine' }, dat: { m: 'einem', f: 'einer', n: 'einem', pl: 'keinen' } },
    none: { nom: {}, acc: {}, dat: {} },
  };
  let filled = 0;
  for (const [key, c] of CELL_BY_KEY) {
    const [noun, art] = c.gender_num === 'pl' ? PL[c.kasus] : N[c.gender_num];
    const a = ART[c.article_class][c.kasus][c.gender_num] || '';
    const np = (a ? a + ' ' : '') + 'gut' + c.ending + ' ' + noun;
    let sentence = VERB[c.kasus].replace('{np}', np);
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    const { item } = validateItem({
      sentence, adjective: 'gut', noun, article: art,
      number: c.gender_num === 'pl' ? 'pl' : 'sg', ending: c.ending,
    }, c);
    eq(item.expected, c.ending, `${key}:`);
    filled++;
  }
  eq(filled, 36, 'cells fillable:');
});

/* ===========================================================================
 * Reading what the model actually sends back.
 * A raw JSON.parse error reaching the user ("Expected ',' or ']' at position
 * 141") was a real bug: models wrap JSON in prose, fences and <think> blocks,
 * and reasoning models get cut off mid-array.
 * ======================================================================== */
const ITEM = '{"sentence":"Ich mag altes Buch.","adjective":"alt","noun":"Buch","article":"das"}';

test('JSON wrapped in prose, fences or think blocks is still read', () => {
  const wrappers = [
    `{"items":[${ITEM}]}`,
    `Here you go:\n\`\`\`json\n{"items":[${ITEM}]}\n\`\`\``,
    `<think>neuter dative needs -es</think>{"items":[${ITEM}]}`,
    `[${ITEM}]`,
    `Sure! {"sentences":[${ITEM}]} Hope that helps.`,
    `{"items":[]} ... actually: {"items":[${ITEM}]}`,
  ];
  for (const w of wrappers) {
    const items = extractItems(w);
    eq(items.length, 1, `wrapper ${w.slice(0, 24)}:`);
    eq(items[0].adjective, 'alt');
  }
});

test('a reply cut off mid-array still yields the complete items', () => {
  const three = [1, 2, 3].map(i =>
    `{"sentence":"Satz ${i}.","adjective":"alt","noun":"Buch","article":"das"}`).join(',');
  const cut = `{"items":[${three},{"sentence":"Ich sehe den klein`;
  const items = extractItems(cut);
  eq(items.length, 3, 'salvaged from a truncated reply:');
  eq(items[2].sentence, 'Satz 3.');
});

test('an unreadable reply raises a sentence, not a parser error', () => {
  for (const junk of ['', '   ', 'I am sorry, I cannot help with that.', '<think>hmm</think>']) {
    try {
      extractItems(junk);
      throw new Error(`accepted junk: ${JSON.stringify(junk)}`);
    } catch (e) {
      assert(!/Expected ',' or|Unexpected token|position \d+/.test(e.message),
        `raw parser error leaked to the user: ${e.message}`);
      assert(/model returned an empty reply|could not read JSON/.test(e.message),
        `unhelpful message: ${e.message}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  for (const [n, m] of failures) console.log(`FAILED: ${n}\n  ${m}`);
  process.exit(1);
}
