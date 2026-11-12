/* tests.js — the nine tests from the spec. Run: node tests.js
 *
 * These are what let you trust the app enough to study from it. They can fail.
 */

import {
  CELLS, CELL_BY_KEY, NOUNS, ADJECTIVES, FRAMES,
  TWO_WAY_PREPOSITIONS, INDECLINABLE, NOUN_BY_ID, ADJ_BY_ID, FRAME_BY_ID,
} from './data.js';
import {
  mulberry32, buildItem, generateItem, generateSession, pairsForCell, tripleCount,
  check, freshState, applyAttempt, rebuildState, nextCell, posteriorMean,
} from './engine.js';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (e) { failed++; failures.push([name, e.message]); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const findN = l => NOUNS.find(n => n.lemma === l);
const findA = l => ADJECTIVES.find(a => a.lemma === l);
const findF = t => FRAMES.find(f => f.template === t);

/* ===========================================================================
 * 1. The golden file — 36 lines, one per cell, verified by hand against a
 *    grammar reference. The only point where a human checks the grammar;
 *    everything downstream inherits this verification.
 *    format: article_class|kasus|gender_num|sentence with ___|ending
 * ======================================================================== */
const GOLDEN = `
def|nom|m|Der alt___ Tisch steht dort.|e
def|nom|f|Die jung___ Frau ist angekommen.|e
def|nom|n|Das klein___ Kind ist angekommen.|e
def|nom|pl|Die alt___ Bücher stehen dort.|en
def|acc|m|Ich sehe den alt___ Lehrer.|en
def|acc|f|Ich sehe die jung___ Frau.|e
def|acc|n|Ich sehe das klein___ Kind.|e
def|acc|pl|Ich sehe die alt___ Bücher.|en
def|dat|m|Ich helfe dem alt___ Lehrer.|en
def|dat|f|Ich helfe der jung___ Frau.|en
def|dat|n|Ich helfe dem klein___ Kind.|en
def|dat|pl|Ich helfe den klein___ Kindern.|en
ein|nom|m|Ein alt___ Lehrer ist angekommen.|er
ein|nom|f|Eine freundlich___ Frau ist angekommen.|e
ein|nom|n|Ein klein___ Kind ist angekommen.|es
ein|nom|pl|Keine alt___ Bücher stehen dort.|en
ein|acc|m|Ich sehe einen alt___ Lehrer.|en
ein|acc|f|Ich sehe eine jung___ Frau.|e
ein|acc|n|Ich sehe ein klein___ Kind.|es
ein|acc|pl|Ich sehe keine alt___ Bücher.|en
ein|dat|m|Ich helfe einem alt___ Lehrer.|en
ein|dat|f|Ich helfe einer jung___ Frau.|en
ein|dat|n|Ich helfe einem klein___ Kind.|en
ein|dat|pl|Ich helfe keinen klein___ Kindern.|en
none|nom|m|Gut___ Wein steht dort.|er
none|nom|f|Kalt___ Milch steht dort.|e
none|nom|n|Frisch___ Brot steht dort.|es
none|nom|pl|Gut___ Weine stehen dort.|e
none|acc|m|Sie kauft gut___ Wein.|en
none|acc|f|Sie kauft kalt___ Milch.|e
none|acc|n|Sie kauft frisch___ Brot.|es
none|acc|pl|Sie kauft gut___ Weine.|e
none|dat|m|Sie kocht mit gut___ Wein.|em
none|dat|f|Sie kocht mit kalt___ Milch.|er
none|dat|n|Sie kocht mit heiß___ Wasser.|em
none|dat|pl|Sie kocht mit frisch___ Eiern.|en
`.trim().split('\n').map(l => l.split('|'));

// The exact (frame, noun, adjective) triple each golden line pins.
const GOLDEN_TRIPLES = {
  'def|nom|m': ['{np} steht dort.', 'Tisch', 'alt', 'der'],
  'def|nom|f': ['{np} ist angekommen.', 'Frau', 'jung', 'die'],
  'def|nom|n': ['{np} ist angekommen.', 'Kind', 'klein', 'das'],
  'def|nom|pl': ['{np} steht dort.', 'Buch', 'alt', 'die'],
  'def|acc|m': ['Ich sehe {np}.', 'Lehrer', 'alt', 'den'],
  'def|acc|f': ['Ich sehe {np}.', 'Frau', 'jung', 'die'],
  'def|acc|n': ['Ich sehe {np}.', 'Kind', 'klein', 'das'],
  'def|acc|pl': ['Ich sehe {np}.', 'Buch', 'alt', 'die'],
  'def|dat|m': ['Ich helfe {np}.', 'Lehrer', 'alt', 'dem'],
  'def|dat|f': ['Ich helfe {np}.', 'Frau', 'jung', 'der'],
  'def|dat|n': ['Ich helfe {np}.', 'Kind', 'klein', 'dem'],
  'def|dat|pl': ['Ich helfe {np}.', 'Kind', 'klein', 'den'],
  'ein|nom|m': ['{np} ist angekommen.', 'Lehrer', 'alt', 'ein'],
  'ein|nom|f': ['{np} ist angekommen.', 'Frau', 'freundlich', 'eine'],
  'ein|nom|n': ['{np} ist angekommen.', 'Kind', 'klein', 'ein'],
  'ein|nom|pl': ['{np} steht dort.', 'Buch', 'alt', 'keine'],
  'ein|acc|m': ['Ich sehe {np}.', 'Lehrer', 'alt', 'einen'],
  'ein|acc|f': ['Ich sehe {np}.', 'Frau', 'jung', 'eine'],
  'ein|acc|n': ['Ich sehe {np}.', 'Kind', 'klein', 'ein'],
  'ein|acc|pl': ['Ich sehe {np}.', 'Buch', 'alt', 'keine'],
  'ein|dat|m': ['Ich helfe {np}.', 'Lehrer', 'alt', 'einem'],
  'ein|dat|f': ['Ich helfe {np}.', 'Frau', 'jung', 'einer'],
  'ein|dat|n': ['Ich helfe {np}.', 'Kind', 'klein', 'einem'],
  'ein|dat|pl': ['Ich helfe {np}.', 'Kind', 'klein', 'keinen'],
  'none|nom|m': ['{np} steht dort.', 'Wein', 'gut', ''],
  'none|nom|f': ['{np} steht dort.', 'Milch', 'kalt', ''],
  'none|nom|n': ['{np} steht dort.', 'Brot', 'frisch', ''],
  'none|nom|pl': ['{np} steht dort.', 'Wein', 'gut', ''],
  'none|acc|m': ['Sie kauft {np}.', 'Wein', 'gut', ''],
  'none|acc|f': ['Sie kauft {np}.', 'Milch', 'kalt', ''],
  'none|acc|n': ['Sie kauft {np}.', 'Brot', 'frisch', ''],
  'none|acc|pl': ['Sie kauft {np}.', 'Wein', 'gut', ''],
  'none|dat|m': ['Sie kocht mit {np}.', 'Wein', 'gut', ''],
  'none|dat|f': ['Sie kocht mit {np}.', 'Milch', 'kalt', ''],
  'none|dat|n': ['Sie kocht mit {np}.', 'Wasser', 'heiß', ''],
  'none|dat|pl': ['Sie kocht mit {np}.', 'Ei', 'frisch', ''],
};

console.log('\nAdjective Endings Trainer — test suite\n');

test('1. Golden file: 36 verified sentences render byte for byte', () => {
  eq(GOLDEN.length, 36, 'golden line count');
  for (const [ac, kasus, gn, sentence, ending] of GOLDEN) {
    const key = `${ac}|${kasus}|${gn}`;
    const cell = CELL_BY_KEY.get(key);
    assert(cell, `no cell ${key}`);
    eq(cell.ending, ending, `${key} ending`);

    const [tmpl, nounLemma, adjLemma, article] = GOLDEN_TRIPLES[key];
    const frame = findF(tmpl), noun = findN(nounLemma), adj = findA(adjLemma);
    assert(frame && noun && adj, `${key}: missing seed row`);
    // The pinned triple must be one the generator would itself accept.
    const legal = pairsForCell(cell)
      .some(p => p.frame.id === frame.id && p.noun.id === noun.id && p.adjs.includes(adj));
    assert(legal, `${key}: pinned triple is not generatable`);

    // Force the article variant the golden line uses.
    const rng = () => 0;
    const item = buildItem(cell, frame, noun, adj, rng, { hints: false });
    const rendered = item.prompt_before + '___' + item.prompt_after;
    eq(rendered, sentence, `${key} sentence:`);
    eq(item.expected, ending, `${key} expected:`);
    if (article) {
      assert(rendered.toLowerCase().includes(article + ' '),
        `${key}: expected article ${article} in "${rendered}"`);
    }
  }
});

test('2. Exhaustive keys: 200 items per cell, every key equals the cell ending', () => {
  const rng = mulberry32(7);
  for (const cell of CELLS) {
    for (let i = 0; i < 200; i++) {
      const item = generateItem(cell, [], [], rng, { hints: true });
      eq(item.expected, cell.ending, `${cell.key} item ${i}:`);
      eq(item.cell_id, cell.id, 'cell id');
      assert(item.full_sentence === item.prompt_before + cell.ending + item.prompt_after,
        'full sentence must be prompt + ending');
    }
  }
});

test('3. No two-way prepositions in any frame template', () => {
  for (const f of FRAMES) {
    for (const prep of TWO_WAY_PREPOSITIONS) {
      const re = new RegExp(`(^|[^\\p{L}])${prep}([^\\p{L}]|$)`, 'iu');
      assert(!re.test(f.template), `"${f.template}" contains ${prep}`);
      assert(!re.test(f.template_pl), `"${f.template_pl}" contains ${prep}`);
    }
    eq((f.template.match(/\{np\}/g) || []).length, 1, 'exactly one {np}');
    eq((f.template_pl.match(/\{np\}/g) || []).length, 1, 'exactly one {np} (pl)');
  }
  const cases = new Set(FRAMES.map(f => f.kasus));
  for (const k of ['nom', 'acc', 'dat']) {
    const n = FRAMES.filter(f => f.kasus === k).length;
    assert(n >= 3, `only ${n} frames for ${k}, need 3`);
  }
  eq(cases.size, 3, 'three cases covered');
});

test('4. Adjective guard: no -el/-er, not hoch, not indeclinable', () => {
  for (const a of ADJECTIVES) {
    assert(!/el$/.test(a.lemma), `${a.lemma} ends in -el`);
    assert(!/er$/.test(a.lemma), `${a.lemma} ends in -er`);
    assert(a.lemma !== 'hoch', 'hoch must be excluded');
    assert(!INDECLINABLE.includes(a.lemma), `${a.lemma} is indeclinable`);
    assert(a.applies_to.length > 0, `${a.lemma} applies to nothing`);
  }
  assert(ADJECTIVES.length >= 40, `only ${ADJECTIVES.length} adjectives`);
});

test('5. Noun integrity: plural and dat_pl present and well formed', () => {
  const seen = new Set();
  for (const n of NOUNS) {
    assert(!seen.has(n.lemma), `duplicate noun ${n.lemma}`);
    seen.add(n.lemma);
    assert(n.plural && n.dat_pl, `${n.lemma} missing plural forms`);
    assert(/[ns]$/.test(n.dat_pl) || n.dat_pl === n.plural,
      `${n.lemma}: dat_pl "${n.dat_pl}" must end in n or s, or equal the plural`);
    assert(['m', 'f', 'n'].includes(n.gender), `${n.lemma} bad gender`);
  }
  for (const g of ['m', 'f', 'n']) {
    const n = NOUNS.filter(x => x.gender === g).length;
    assert(n >= 40, `only ${n} ${g} nouns, need 40`);
  }
  eq(NOUNS.length, 120, 'noun count');
});

test('6. No ein in a plural slot, and no bare singular count noun', () => {
  const rng = mulberry32(11);
  for (const cell of CELLS) {
    for (let i = 0; i < 150; i++) {
      const item = generateItem(cell, [], [], rng, { hints: false });
      const text = item.prompt_before;
      if (cell.gender_num === 'pl' && cell.article_class === 'ein') {
        assert(!/(^|\s)[Ee]ine?n?[ms]?\s/.test(text) || /(kein|mein|dein|sein|ihr|unser)/i.test(text),
          `ein-word in plural: ${text}`);
        assert(!/(^|\s)[Ee]ine\s/.test(text.replace(/(kein|mein|dein|sein|ihr|unser)e\s/gi, '')),
          `bare ein in plural: ${text}`);
      }
      if (cell.article_class === 'none' && cell.gender_num !== 'pl') {
        const noun = NOUN_BY_ID.get(item.noun_id);
        assert(noun.mass === 1, `bare singular count noun ${noun.lemma}`);
      }
      if (cell.gender_num === 'pl') {
        const noun = NOUN_BY_ID.get(item.noun_id);
        assert(noun.countable === 1, `plural of mass noun ${noun.lemma}`);
        if (cell.kasus === 'dat') {
          assert(item.prompt_after.includes(noun.dat_pl), `dative plural must use dat_pl (${noun.lemma})`);
        }
      }
    }
  }
});

test('7. Coverage: every cell has at least 50 valid triples', () => {
  const thin = [];
  for (const cell of CELLS) {
    const n = tripleCount(cell);
    if (n < 50) thin.push(`${cell.key}=${n}`);
  }
  assert(thin.length === 0, `thin cells: ${thin.join(', ')}`);
});

test('8. Round trip: correct raises alpha, wrong raises beta, junk moves neither', () => {
  const r = check('en', 'en'); eq(r.correct, true); eq(r.error_kind, null);
  eq(check('EN ', 'en').correct, true, 'case and space tolerated');
  eq(check('-em', 'em').correct, true, 'leading dash tolerated');
  eq(check('', 'en').error_kind, 'empty');
  eq(check('xyz', 'en').error_kind, 'junk');
  eq(check('schön', 'en').error_kind, 'junk');
  eq(check('er', 'en').error_kind, 'ending');

  const state = freshState();
  const id = CELLS[0].id;
  applyAttempt(state, id, true, '2026-01-01T00:00:00Z');
  assert(state[id].alpha > 1 && state[id].beta < 1, 'correct must raise alpha');
  const s2 = freshState();
  applyAttempt(s2, id, false, '2026-01-01T00:00:00Z');
  assert(s2[id].beta > 1 && s2[id].alpha < 1, 'wrong must raise beta');

  // junk and empty never reach applyAttempt: rebuildState skips them.
  const rebuilt = rebuildState([
    { ts: '2026-01-01T00:00:00Z', cell_id: id, correct: 0, error_kind: 'junk' },
    { ts: '2026-01-01T00:00:01Z', cell_id: id, correct: 0, error_kind: 'empty' },
  ]);
  eq(rebuilt[id].alpha, 1, 'junk must not move alpha');
  eq(rebuilt[id].beta, 1, 'junk must not move beta');
});

test('9. Selection: a weak cell is chosen more than 60% of the time', () => {
  const state = freshState();
  for (const c of CELLS) { state[c.id].alpha = 10; state[c.id].beta = 10; }
  const weak = CELLS[17].id;
  state[weak].alpha = 1; state[weak].beta = 20;

  const rng = mulberry32(2026);
  let hits = 0;
  for (let i = 0; i < 1000; i++) if (nextCell(state, rng).id === weak) hits++;
  assert(hits > 600, `weak cell selected only ${hits}/1000 times`);
});

test('10. State rebuild reproduces cell_state exactly', () => {
  const rng = mulberry32(99);
  const state = freshState();
  const attempts = [];
  for (let i = 0; i < 400; i++) {
    const cell = nextCell(state, rng);
    const item = generateItem(cell, attempts, [], rng, { hints: true });
    const roll = rng();
    const given = roll < 0.6 ? item.expected : (roll < 0.9 ? 'en' : 'zzz');
    const res = check(given, item.expected);
    const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    attempts.push({
      ts, cell_id: item.cell_id, frame_id: item.frame_id, noun_id: item.noun_id,
      adj_id: item.adj_id, prompt: item.full_sentence, expected: item.expected,
      given, correct: res.correct ? 1 : 0, hint_shown: item.hint_shown,
      ms: 1200, error_kind: res.error_kind,
    });
    if (res.error_kind !== 'empty' && res.error_kind !== 'junk') {
      applyAttempt(state, item.cell_id, res.correct, ts);
    }
  }
  const rebuilt = rebuildState(attempts);
  for (const c of CELLS) {
    assert(Math.abs(rebuilt[c.id].alpha - state[c.id].alpha) < 1e-9,
      `${c.key} alpha drift`);
    assert(Math.abs(rebuilt[c.id].beta - state[c.id].beta) < 1e-9,
      `${c.key} beta drift`);
  }
});

test('11. Anti-repetition holds over a 20-item session', () => {
  const rng = mulberry32(5);
  const state = freshState();
  const items = generateSession(state, [], 20, rng, { hints: true });
  eq(items.length, 20);
  const pairs = items.map(i => `${i.frame_id}|${i.noun_id}`);
  eq(new Set(pairs).size, 20, 'no (frame, noun) pair may repeat in a session');
  for (let i = 0; i < items.length; i++) {
    for (let j = Math.max(0, i - 10); j < i; j++) {
      assert(!(items[i].frame_id === items[j].frame_id && items[i].cell_id === items[j].cell_id),
        'a (frame, cell) pair repeated inside 10 items');
    }
  }
});

test('12. Sentences are well formed: capitalisation, spacing, punctuation', () => {
  const rng = mulberry32(31);
  for (const cell of CELLS) {
    for (let i = 0; i < 60; i++) {
      const it = generateItem(cell, [], [], rng, { hints: true });
      const s = it.full_sentence;
      assert(/^[A-ZÄÖÜ]/.test(s), `must start with a capital: ${s}`);
      assert(/[.!?]$/.test(s), `must end with punctuation: ${s}`);
      assert(!/\s{2,}/.test(s), `double space: ${s}`);
      assert(!/\s[.!?]/.test(s), `space before punctuation: ${s}`);
      if (cell.article_class === 'none') {
        eq(it.hint, { m: 'der', f: 'die', n: 'das', pl: 'die' }[cell.gender_num],
          'strong cells show the gender hint');
      } else {
        eq(it.hint, null, 'only strong cells get a hint');
      }
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  for (const [n, m] of failures) console.log(`FAILED: ${n}\n  ${m}`);
  process.exit(1);
}

// A sample of what the generator actually prints, for eyeballing.
console.log('Sample items:\n');
const rng = mulberry32(Date.now() % 1e6);
const st = freshState();
for (const item of generateSession(st, [], 12, rng, { hints: true })) {
  const hint = item.hint ? `  (${item.hint})` : '';
  console.log(`  ${(item.prompt_before + '___' + item.prompt_after).padEnd(48)}${item.expected.padEnd(4)}${hint}`);
}
console.log();
