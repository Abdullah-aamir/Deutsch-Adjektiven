# Adjektivendungen — German attributive adjective endings

One topic, 36 cells, no server and no model in the correctness path. The app
generates its own items and proves every answer key by looking it up in the
three declension tables, which are typed into `data.js` once.

Installable as a PWA: own icon, no browser bar, fully usable offline.

---

## Deploy to GitHub Pages

Pages serves over HTTPS, which is what Chrome requires before it will offer
"Install app".

```bash
# in this folder
git init -b main
git add .
git commit -m "Adjective endings trainer"
gh repo create adjektiv-trainer --public --source=. --push
# or: create the repo on github.com, then
#   git remote add origin https://github.com/YOU/adjektiv-trainer.git
#   git push -u origin main
```

Then: **repo → Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save.**

A minute later the app is at `https://YOU.github.io/adjektiv-trainer/`.
Every path in the app is relative, so the subfolder is fine — no config needed.

### Installing it

Open that URL in Chrome. Either press the **Install** button in the top right
of the app, or use the install icon in the address bar (⊕), or ⋮ → *Cast, save
and share* → *Install page as app*. It then launches from the app drawer in its
own window, with no address bar, and works with the network off.

On an iPhone, Safari → Share → *Add to Home Screen*.

### Updating it

Edit, commit, push. Bump `CACHE` in `sw.js` (`adjektivendungen-v1` → `-v2`)
whenever you change a file, so the old cache is thrown away and the new worker
takes over on the next launch.

---

## Run it locally

A service worker needs a real origin, so `file://` will not do:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

`localhost` counts as a secure context, so install and offline both work there.

## Tests

```bash
node tests.js
```

Twelve tests, all cheap, all able to fail:

| # | Assertion |
|---|---|
| 1 | **Golden file** — 36 hand-verified sentences, one per cell, render byte for byte |
| 2 | Exhaustive keys — 200 items per cell, every key equals that cell's ending |
| 3 | No two-way preposition in any frame; at least 3 frames per case |
| 4 | Adjective guard — no `-el`/`-er`, not `hoch`, nothing indeclinable |
| 5 | Noun integrity — every plural and `dat_pl` present and well formed |
| 6 | No `ein` in a plural slot; no bare singular count noun; dative plural uses `dat_pl` |
| 7 | Coverage — every cell has ≥ 50 valid (frame, noun, adjective) triples |
| 8 | Round trip — correct raises α, a wrong ending raises β, junk moves neither |
| 9 | Selection — a weak cell is drawn > 60% of the time over 1,000 draws |
| 10 | State rebuild — replaying the log reproduces `cell_state` exactly |
| 11 | Anti-repetition holds across a 20-item session |
| 12 | Sentences are well formed — capitalisation, spacing, punctuation, hints |
| 13 | No adjective whose lemma ends in `-e` (its stem is shorter: `leise` → `leis-`) |

And in `tests-ai.js`, the one that matters most: a preposition elsewhere in the
sentence must **not** be held against the item, or correct German gets thrown
away.

Current coverage runs from 201 triples (strong dative feminine, the thinnest)
to 10,633 (weak accusative plural), against a floor of 50.

---

## How it works

**The generator never decides an answer.** The selector hands over a cell —
`(article_class, kasus, gender_num)` — and everything else follows: pick a
frame whose case matches, a noun whose gender and semantic class fit, an
adjective that may modify that noun, look up the article surface form, look up
the ending. Step six is a dictionary access against 36 rows you can check by
eye, so correctness of every key in the app reduces to correctness of those
rows.

**Only the ending is blank.** `Sie kocht mit heiß___ Wasser` isolates the one
thing being measured. Blanking the whole word would mix four failure modes —
not knowing the rule, not knowing the word, mistyping, missing an umlaut —
into a single wrong answer. The answer space is five ASCII strings, so the
checker is six lines and you never fight your keyboard.

**Strong cells show the gender in grey.** With no article, nothing reveals that
`Wasser` is neuter, so a gender gap would be recorded as an ending gap. Each
attempt stores whether the hint was shown, so the two populations never mix.
The hint is a checkbox in Settings.

**Mastery is a Beta posterior per cell**, updated as `α ← λα + c`,
`β ← λβ + (1 − c)` with `λ = 0.98`, which caps memory at roughly the last 50
attempts on that cell and lets a cell you learned in week one drift back into
the queue. Items with `error_kind` of `empty` or `junk` are recorded but never
scored, so a mis-key never becomes evidence of a knowledge gap.

**Selection is Thompson sampling, inverted.** One draw from each of the 36
posteriors, take the lowest. It favours cells you are bad at, still revisits
strong ones through the tails, and explores thin evidence because those
posteriors are wide. No thresholds, no exploration rate to tune.

**The grid has the same shape as the grammar**, so you read weaknesses
structurally: a red column is a gender problem, a red row is a case problem,
a red table is a pattern problem.

### Differences from the spec

The spec assumed FastAPI, SQLite and `localhost`. A PWA has no server, so:

| Spec | Here |
|---|---|
| SQLite, seven tables | `data.js` for the seeded tables; `localStorage` for `attempts` and settings |
| `cell_state` table | derived in memory by `rebuildState()` on every load — the spec's "keep a rebuild function from the start", taken all the way |
| Four FastAPI endpoints | the same four operations as function calls; the session is still generated in one go, so there is no loading state anywhere |
| `rebuild_state()` optional | the only way state exists, so the scoring formula can change without losing history |

Three grammar guards were added after watching what the generator printed:

- **No bare singular count noun.** German does not allow `*Guter Lehrer ist
  angekommen`, so strong singular cells draw only from mass and abstract nouns.
  Nouns carry a `mass` flag alongside `countable`; `Wein` is both.
- **No ein-word on an uncountable noun** — `*ein Obst`.
- **Possessives only where there is an owner.** `mein Fluss` is odd in a way no
  grammar table catches, so `mein/dein/sein/ihr/unser` are used with people,
  animals and objects; places, food and abstractions get `ein`/`kein`.

`leise` and `müde` were in the first build and printed *"der leisee Fluss"* —
their stem is shorter than their lemma. Test 13 exists so that class of word
cannot come back.

Weak masculine nouns (`Student`, `Junge`, `Kollege`, `Mensch`, `Name`…) are
absent from the seed data: their stem changes outside the nominative, which
would print a wrong sentence around a right ending.

## Model-written sentences (optional)

Off by default. The app works completely without it — everything below is an
add-on to the static generator, never a replacement for it.

Open **Settings** (the gear, top right). The provider, endpoint and model are
already filled in for Mistral Large 4 — paste your API key into the last field
and the feature switches itself on. Then press **Refill pool**.

Settings also shows a build marker (`Build v6 — cached offline`). If that does
not match the build you just deployed, the installed app is still serving a
cached older copy: close it and reopen, or bump `CACHE` in `sw.js`.

Pick a provider (Groq, Together,
OpenRouter, DeepInfra, or any OpenAI-compatible endpoint), paste your own API
key, press **Refill pool**. The key is stored in this browser profile and is
sent only to the endpoint you chose.

### How it is kept honest

The model writes sentences. It never supplies an answer key — the ending is
always computed from the 36-cell table, the same lookup the static generator
uses. On top of that, every returned item must survive `validate.js` before it
can reach you:

| Check | Catches |
|---|---|
| **Gender contradiction** | the item that would produce a *wrong key*: the model is asked for the noun's dictionary article independently, and `Kaffee / der` in a neuter slot is discarded |
| Gender vs our own lexicon | a wrong gender on one of the 120 nouns we verified by hand |
| Ending disagreement | the model's own ending differing from the table — cheap evidence the item was reasoned badly |
| Two-way preposition | `auf`, `in`, `vor`… where the case is ambiguous and the slot is therefore not fixed |
| One-case preposition vs claimed case | `ohne` in something labelled dative |
| Adjective stem | `leise`, `dunkel`, `teuer`, `hoch` — lemmas that change before the ending |
| Dative plural form | a plural dative noun not in its `-n`/`-s` form |
| Shape | capitalisation, punctuation, double spaces, markup, length, the adjective appearing twice |

What this does **not** catch: a confidently wrong gender on a noun outside our
120. There is no honest fix for that without a verified dictionary, and
hand-writing one from memory would just be model output checked against model
output. So such items are kept but labelled `trust: 'self-consistent'`, and
when you get one wrong the feedback says the gender is the model's claim —
with a **Flag this sentence** button that removes it from the pool.

### The pool

500 sentences, held as **36 per-cell queues** rather than one flat list. That
matters: the selector asks for the cell you are worst at, so a flat pool would
run your three weak cells dry in under a week while 400 items for your strong
cells sat unused. A cell is topped up when it drops to 4 items left.

At twenty questions a day that is roughly **25 days offline** and a refill
about once a month. If the pool is empty, you are offline, the key is wrong,
or the model is down, the static generator answers instead — so the app cannot
fail to give you an item.

The refill log in Settings reports what was kept and why the rest was rejected
(`gender-contradiction x6, ending-disagreement x3…`). That is your read on
whether the model you picked is good enough; a model throwing 80% rejections is
telling you to switch.

### Which model

Defaults to **OpenRouter's free tier** — no card, no credits:

| Field | Value |
|---|---|
| Provider | OpenRouter (free tier) |
| Endpoint | `https://openrouter.ai/api/v1` |
| Model | `nvidia/nemotron-3-ultra-550b-a55b:free` |

Get a key at openrouter.ai, paste it into Settings, press **Refill pool**.

#### The free-tier limits shape how this works

Any OpenRouter ID ending in `:free` costs nothing and allows **20 requests a
minute and 50 a day** — 1,000 a day once you have bought at least $10 of
credits. A full pool is roughly 50 calls, so:

- **Filling an empty pool costs about one day's free allowance.** If you run
  out, the app stops cleanly, keeps what it got, and says so. Press Refill
  again tomorrow.
- **Topping up costs a few calls a month**, because only the cells you have
  drained get refilled.
- The refill button budgets 40 calls on a free model, staying short of the cap
  rather than running into it, and backs off once on a 429 before giving up.

Nothing breaks when the quota runs out: the pool keeps serving, and the static
generator covers whatever the pool cannot.

#### Free model IDs rotate — check before trusting a guide

Free endpoints exist only while some provider subsidises them, and IDs that
older guides still recommend (`openai/gpt-oss-120b:free`,
`qwen/qwen3-coder:free`, `meta-llama/llama-3.3-70b-instruct:free`) now return
404. As of early November 2026 these were answering:

| Free ID | Why you might pick it |
|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 550B, the largest free model — the default here |
| `google/gemma-4-31b-it:free` | Google's models tend to be strong on European languages |
| `nvidia/nemotron-3.5-super-vl:free` | 120B MoE, 12B active |
| `nvidia/nemotron-3.5-lightning:free` | fastest of the group |
| `openrouter/free` | OpenRouter's router, picks a free model at random |

If one 404s, swap the ID — nothing else changes. And since free endpoints may
log prompts or use them for training, note that what is sent is a German
grammar instruction and nothing about you.

**Which is actually best for German? Run the experiment.** I do not know, and
neither does a leaderboard — German adjective endings are a narrow skill. Put
one ID in, refill, read the rejection log; swap, refill, compare. A model that
throws mostly `gender-contradiction` is telling you to use a different one.
Size is the one reliable prior: small models get German endings wrong.

#### Paid alternatives

Mistral Large 4 (`mistral-large-4` at `https://api.mistral.ai/v1`) is in the
provider list if you ever want it — Mistral is repeatedly reported as the
strongest open-weight family for German, and Large 4 is open-weight under the
Mistral Ecosystem Open Weight License. It is not free. The same model is on
OpenRouter as `mistralai/mistral-large-4-0`, billed per token.

If an endpoint rejects `response_format`, the client retries once without it
and salvages JSON out of prose, so a provider that does not support JSON mode
still works.

### Tests

```bash
node tests.js       # 12 — the generator and the grammar tables
node tests-ai.js    # 17 — the rejection path
node probe.js       # pass rate of good-faith output through the validator
```

`probe.js` is a batch of 48 hand-written sentences across 8 cells, run through
the real validator. It exists to catch the opposite failure from `tests-ai.js`:
a gate so tight that it rejects correct German. It currently passes 48/48. The
first run passed 47/48, and the one rejection was a validator bug —
*"Gute Weine kommen aus Italien"* was thrown out because `aus` is a dative
preposition, even though it governs a different phrase entirely. The case
check now looks only at the preposition heading the blank's own noun phrase.

`tests-ai.js` is the important one here. It does not ask whether a model writes
good German; it feeds the validator the things real models get wrong —
hallucinated genders, wrong endings, two-way prepositions, uninflected
adjectives, malformed output, junk — and asserts that none of it reaches you.
It also proves all 36 cells are fillable by a cooperative model, so no cell can
silently fall back to static items forever.

## Files

```
index.html     three screens
styles.css     no web fonts, so nothing to fetch offline
data.js        36 cells, article forms, 120 nouns, 68 adjectives, 16 frames
engine.js      generator, checker, Beta update, Thompson selection, storage
validate.js    the gate every model-written item must pass
pool.js        36 per-cell queues, low-water refill, static fallback
ai.js          BYO-key client for any OpenAI-compatible endpoint
app.js         screens, keyboard and touch flow, settings, install prompt
tests.js       12 tests — the generator and the tables
tests-ai.js    16 tests — the rejection path
sw.js          offline cache; bump CACHE when you change a file
manifest.json  name, icons, standalone display
icons/         192, 512, maskable 512, apple-touch 180
```

## Your data

Everything stays in this browser profile. Settings has **Export** (a JSON file
of every attempt) and **Import**, which is also how you move your history to
another machine — the grid rebuilds from the log, so nothing is lost.

## After three weeks

The two queries that decide whether any of this was worth it. Open DevTools on
the app and run:

```js
const a = JSON.parse(localStorage['aet.attempts.v1'])
  .map(r => ({ts: r[0], cell: r[1], correct: r[8], kind: r[11]}));

// days used out of 21
new Set(a.filter(x => Date.parse(x.ts) > Date.now() - 21*864e5)
         .map(x => x.ts.slice(0,10))).size;

// accuracy week 1 vs week 3, strong cells only (cell ids 25-36)
['wk1','wk3'].map(p => {
  const s = a.filter(x => x.cell >= 25 && x.kind !== 'junk' && x.kind !== 'empty' &&
    (p === 'wk1' ? Date.parse(x.ts) < Date.now()-14*864e5
                 : Date.parse(x.ts) >= Date.now()-7*864e5));
  return [p, s.length, s.filter(x => x.correct).length / (s.length || 1)];
});
```

14+ days and accuracy moved: extend it — genitive first, then verb position in
subordinate clauses through the same generator. Under 7 days: that is the
honest answer, found for a weekend instead of six months.
