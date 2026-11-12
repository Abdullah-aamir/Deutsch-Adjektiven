/* data.js — the entire content model.
 *
 * Everything the app knows about German lives here. The three declension
 * tables are typed in once from a grammar reference; the generator never
 * infers an ending, it looks one up. Correctness of every answer key in the
 * app therefore reduces to correctness of CELLS below, which you can verify
 * by eye in about ten minutes.
 */

export const SEM_CLASSES = ['person', 'animal', 'food', 'object', 'place', 'abstract'];

/* ---------------------------------------------------------------------------
 * CELLS — 36 rows. ending is the answer key; explanation is shown on a miss.
 * article_class: def (weak) | ein (mixed) | none (strong)
 * kasus:         nom | acc | dat
 * gender_num:    m | f | n | pl
 * ------------------------------------------------------------------------ */
export const CELLS = [
  // --- Weak: after der/die/das, dieser, jener ------------------------------
  { article_class: 'def', kasus: 'nom', gender_num: 'm', ending: 'e',
    explanation: 'Der already marks masculine nominative, so the adjective adds nothing: weak -e.' },
  { article_class: 'def', kasus: 'nom', gender_num: 'f', ending: 'e',
    explanation: 'Die carries the case and gender. The adjective stays weak: -e.' },
  { article_class: 'def', kasus: 'nom', gender_num: 'n', ending: 'e',
    explanation: 'Das has done the work. Neuter nominative after a definite article is weak -e.' },
  { article_class: 'def', kasus: 'nom', gender_num: 'pl', ending: 'en',
    explanation: 'Every plural slot after a definite article is -en. No exceptions in this table.' },

  { article_class: 'def', kasus: 'acc', gender_num: 'm', ending: 'en',
    explanation: 'Den is the one definite article that changes for the accusative, and the adjective follows it to -en.' },
  { article_class: 'def', kasus: 'acc', gender_num: 'f', ending: 'e',
    explanation: 'Feminine looks identical in nominative and accusative, so this stays weak -e.' },
  { article_class: 'def', kasus: 'acc', gender_num: 'n', ending: 'e',
    explanation: 'Neuter accusative equals neuter nominative: das, and a weak -e.' },
  { article_class: 'def', kasus: 'acc', gender_num: 'pl', ending: 'en',
    explanation: 'Plural after a definite article is -en in every case.' },

  { article_class: 'def', kasus: 'dat', gender_num: 'm', ending: 'en',
    explanation: 'Dem shows the dative clearly, so the adjective is weak. The whole dative row is -en.' },
  { article_class: 'def', kasus: 'dat', gender_num: 'f', ending: 'en',
    explanation: 'Der here is dative feminine, not nominative masculine. The adjective is -en either way.' },
  { article_class: 'def', kasus: 'dat', gender_num: 'n', ending: 'en',
    explanation: 'Dem again. The entire dative row of the weak table is -en.' },
  { article_class: 'def', kasus: 'dat', gender_num: 'pl', ending: 'en',
    explanation: 'Den plus -en, and the noun itself usually takes an extra -n in the dative plural.' },

  // --- Mixed: after ein, kein, mein, dein, sein, ihr, unser ----------------
  { article_class: 'ein', kasus: 'nom', gender_num: 'm', ending: 'er',
    explanation: 'Ein has no ending here, so it cannot show masculine nominative. The adjective borrows the strong -er.' },
  { article_class: 'ein', kasus: 'nom', gender_num: 'f', ending: 'e',
    explanation: 'Eine already marks feminine, so the adjective falls back to weak -e.' },
  { article_class: 'ein', kasus: 'nom', gender_num: 'n', ending: 'es',
    explanation: 'Bare ein cannot distinguish neuter from masculine, so the adjective carries the strong -es.' },
  { article_class: 'ein', kasus: 'nom', gender_num: 'pl', ending: 'en',
    explanation: 'Keine shows the plural, so the adjective is weak -en. (Ein itself has no plural.)' },

  { article_class: 'ein', kasus: 'acc', gender_num: 'm', ending: 'en',
    explanation: 'Einen marks the masculine accusative, so the adjective goes weak: -en.' },
  { article_class: 'ein', kasus: 'acc', gender_num: 'f', ending: 'e',
    explanation: 'Eine, feminine, nominative or accusative alike. Weak -e.' },
  { article_class: 'ein', kasus: 'acc', gender_num: 'n', ending: 'es',
    explanation: 'Neuter accusative equals neuter nominative: bare ein shows nothing, so the adjective takes -es.' },
  { article_class: 'ein', kasus: 'acc', gender_num: 'pl', ending: 'en',
    explanation: 'Plural after an ein-word is -en in every case.' },

  { article_class: 'ein', kasus: 'dat', gender_num: 'm', ending: 'en',
    explanation: 'Einem shows the dative, so the adjective is weak. The mixed dative row is all -en.' },
  { article_class: 'ein', kasus: 'dat', gender_num: 'f', ending: 'en',
    explanation: 'Einer is dative feminine here, and the adjective follows weakly: -en.' },
  { article_class: 'ein', kasus: 'dat', gender_num: 'n', ending: 'en',
    explanation: 'Einem again. Mixed and weak are identical everywhere in the dative.' },
  { article_class: 'ein', kasus: 'dat', gender_num: 'pl', ending: 'en',
    explanation: 'Keinen plus -en, and the noun takes its dative plural form.' },

  // --- Strong: no article at all -------------------------------------------
  { article_class: 'none', kasus: 'nom', gender_num: 'm', ending: 'er',
    explanation: 'Nothing else is there, so the adjective must signal masculine nominative itself: -er, the der-signal.' },
  { article_class: 'none', kasus: 'nom', gender_num: 'f', ending: 'e',
    explanation: 'With no article the adjective carries the feminine signal, which is -e.' },
  { article_class: 'none', kasus: 'nom', gender_num: 'n', ending: 'es',
    explanation: 'No article, so the adjective takes the das-signal: neuter nominative is -es.' },
  { article_class: 'none', kasus: 'nom', gender_num: 'pl', ending: 'e',
    explanation: 'Bare plural is -e, not -en. This is the one plural slot in the whole system that is not -en.' },

  { article_class: 'none', kasus: 'acc', gender_num: 'm', ending: 'en',
    explanation: 'The adjective carries the den-signal: masculine accusative is -en.' },
  { article_class: 'none', kasus: 'acc', gender_num: 'f', ending: 'e',
    explanation: 'Feminine does not change between nominative and accusative, so it is -e again.' },
  { article_class: 'none', kasus: 'acc', gender_num: 'n', ending: 'es',
    explanation: 'Neuter accusative equals neuter nominative: -es, the das-signal.' },
  { article_class: 'none', kasus: 'acc', gender_num: 'pl', ending: 'e',
    explanation: 'Bare plural accusative is -e, matching the bare plural nominative.' },

  { article_class: 'none', kasus: 'dat', gender_num: 'm', ending: 'em',
    explanation: 'No article, so the adjective carries the dative signal itself: masculine dative is -em.' },
  { article_class: 'none', kasus: 'dat', gender_num: 'f', ending: 'er',
    explanation: 'Dative feminine is -er, the der-signal. This is the cell most often confused with masculine nominative.' },
  { article_class: 'none', kasus: 'dat', gender_num: 'n', ending: 'em',
    explanation: 'No article, so the adjective carries the dative signal itself: neuter dative is -em.' },
  { article_class: 'none', kasus: 'dat', gender_num: 'pl', ending: 'en',
    explanation: 'Bare dative plural is -en, and the noun takes its dative plural -n as well.' },
];

/* ---------------------------------------------------------------------------
 * ARTICLES — surface forms, seeded once.
 * def  : the definite article, plus dies- which declines identically and also
 *        triggers the weak pattern.
 * ein  : stem + ein-word ending. ein has no plural, so it is listed sg-only.
 * none : empty string.
 * ------------------------------------------------------------------------ */
export const DEF_ARTICLES = {
  nom: { m: 'der', f: 'die', n: 'das', pl: 'die' },
  acc: { m: 'den', f: 'die', n: 'das', pl: 'die' },
  dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
};

// dies- takes exactly the endings of the definite article.
export const DER_WORD_ENDINGS = {
  nom: { m: 'er', f: 'e', n: 'es', pl: 'e' },
  acc: { m: 'en', f: 'e', n: 'es', pl: 'e' },
  dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
};
export const DER_WORD_STEMS = ['dies'];

// ein-word endings. Note the three empty cells: that is exactly where the
// adjective has to take over and the mixed pattern borrows a strong ending.
export const EIN_WORD_ENDINGS = {
  nom: { m: '', f: 'e', n: '', pl: 'e' },
  acc: { m: 'en', f: 'e', n: '', pl: 'e' },
  dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
};
// 'ein' is singular only — the generator must never reach for it in a plural slot.
export const EIN_WORD_STEMS = [
  { stem: 'ein', plural: false },
  { stem: 'kein', plural: true },
  { stem: 'mein', plural: true },
  { stem: 'dein', plural: true },
  { stem: 'sein', plural: true },
  { stem: 'ihr', plural: true },
  { stem: 'unser', plural: true },
];

// The dictionary article, shown in grey as the gender hint on strong cells.
export const HINT_ARTICLE = { m: 'der', f: 'die', n: 'das', pl: 'die' };

/* ---------------------------------------------------------------------------
 * NOUNS — 120, forty per gender.
 *
 * countable : may appear in a plural frame.
 * mass      : may appear bare in the singular. German does not allow a bare
 *             singular count noun ("*Guter Lehrer ist angekommen"), so strong
 *             singular cells draw only from mass and abstract nouns. Some
 *             nouns are both (Wein: der Wein / guter Wein / gute Weine).
 *
 * Deliberately absent: weak masculine nouns (Student, Junge, Kollege, Mensch,
 * Bär, Name...), whose stem changes outside the nominative and would print a
 * wrong sentence around a right ending.
 * ------------------------------------------------------------------------ */
const N = (lemma, gender, plural, dat_pl, sem_class, countable, mass) =>
  ({ lemma, gender, plural, dat_pl, sem_class, countable, mass });

export const NOUNS = [
  // ---- masculine (40) ----
  N('Garten', 'm', 'Gärten', 'Gärten', 'place', 1, 0),
  N('Berg', 'm', 'Berge', 'Bergen', 'place', 1, 0),
  N('Wald', 'm', 'Wälder', 'Wäldern', 'place', 1, 0),
  N('Fluss', 'm', 'Flüsse', 'Flüssen', 'place', 1, 0),
  N('Platz', 'm', 'Plätze', 'Plätzen', 'place', 1, 0),
  N('Markt', 'm', 'Märkte', 'Märkten', 'place', 1, 0),
  N('Bahnhof', 'm', 'Bahnhöfe', 'Bahnhöfen', 'place', 1, 0),
  N('Turm', 'm', 'Türme', 'Türmen', 'place', 1, 0),
  N('Weg', 'm', 'Wege', 'Wegen', 'place', 1, 0),
  N('Lehrer', 'm', 'Lehrer', 'Lehrern', 'person', 1, 0),
  N('Schüler', 'm', 'Schüler', 'Schülern', 'person', 1, 0),
  N('Arzt', 'm', 'Ärzte', 'Ärzten', 'person', 1, 0),
  N('Mann', 'm', 'Männer', 'Männern', 'person', 1, 0),
  N('Freund', 'm', 'Freunde', 'Freunden', 'person', 1, 0),
  N('Bruder', 'm', 'Brüder', 'Brüdern', 'person', 1, 0),
  N('Vater', 'm', 'Väter', 'Vätern', 'person', 1, 0),
  N('Sohn', 'm', 'Söhne', 'Söhnen', 'person', 1, 0),
  N('Onkel', 'm', 'Onkel', 'Onkeln', 'person', 1, 0),
  N('Hund', 'm', 'Hunde', 'Hunden', 'animal', 1, 0),
  N('Vogel', 'm', 'Vögel', 'Vögeln', 'animal', 1, 0),
  N('Fisch', 'm', 'Fische', 'Fischen', 'animal', 1, 0),
  N('Tisch', 'm', 'Tische', 'Tischen', 'object', 1, 0),
  N('Stuhl', 'm', 'Stühle', 'Stühlen', 'object', 1, 0),
  N('Schrank', 'm', 'Schränke', 'Schränken', 'object', 1, 0),
  N('Schlüssel', 'm', 'Schlüssel', 'Schlüsseln', 'object', 1, 0),
  N('Teller', 'm', 'Teller', 'Tellern', 'object', 1, 0),
  N('Löffel', 'm', 'Löffel', 'Löffeln', 'object', 1, 0),
  N('Brief', 'm', 'Briefe', 'Briefen', 'object', 1, 0),
  N('Computer', 'm', 'Computer', 'Computern', 'object', 1, 0),
  N('Stein', 'm', 'Steine', 'Steinen', 'object', 1, 0),
  N('Wein', 'm', 'Weine', 'Weinen', 'food', 1, 1),
  N('Kaffee', 'm', 'Kaffees', 'Kaffees', 'food', 1, 1),
  N('Tee', 'm', 'Tees', 'Tees', 'food', 1, 1),
  N('Saft', 'm', 'Säfte', 'Säften', 'food', 1, 1),
  N('Kuchen', 'm', 'Kuchen', 'Kuchen', 'food', 1, 1),
  N('Salat', 'm', 'Salate', 'Salaten', 'food', 1, 1),
  N('Käse', 'm', 'Käse', 'Käsen', 'food', 0, 1),
  N('Zucker', 'm', 'Zucker', 'Zuckern', 'food', 0, 1),
  N('Reis', 'm', 'Reis', 'Reis', 'food', 0, 1),
  N('Mut', 'm', 'Mut', 'Mut', 'abstract', 0, 1),

  // ---- feminine (40) ----
  N('Frau', 'f', 'Frauen', 'Frauen', 'person', 1, 0),
  N('Lehrerin', 'f', 'Lehrerinnen', 'Lehrerinnen', 'person', 1, 0),
  N('Ärztin', 'f', 'Ärztinnen', 'Ärztinnen', 'person', 1, 0),
  N('Freundin', 'f', 'Freundinnen', 'Freundinnen', 'person', 1, 0),
  N('Schwester', 'f', 'Schwestern', 'Schwestern', 'person', 1, 0),
  N('Tochter', 'f', 'Töchter', 'Töchtern', 'person', 1, 0),
  N('Mutter', 'f', 'Mütter', 'Müttern', 'person', 1, 0),
  N('Nachbarin', 'f', 'Nachbarinnen', 'Nachbarinnen', 'person', 1, 0),
  N('Katze', 'f', 'Katzen', 'Katzen', 'animal', 1, 0),
  N('Maus', 'f', 'Mäuse', 'Mäusen', 'animal', 1, 0),
  N('Kuh', 'f', 'Kühe', 'Kühen', 'animal', 1, 0),
  N('Ente', 'f', 'Enten', 'Enten', 'animal', 1, 0),
  N('Stadt', 'f', 'Städte', 'Städten', 'place', 1, 0),
  N('Straße', 'f', 'Straßen', 'Straßen', 'place', 1, 0),
  N('Kirche', 'f', 'Kirchen', 'Kirchen', 'place', 1, 0),
  N('Schule', 'f', 'Schulen', 'Schulen', 'place', 1, 0),
  N('Wohnung', 'f', 'Wohnungen', 'Wohnungen', 'place', 1, 0),
  N('Brücke', 'f', 'Brücken', 'Brücken', 'place', 1, 0),
  N('Insel', 'f', 'Inseln', 'Inseln', 'place', 1, 0),
  N('Küche', 'f', 'Küchen', 'Küchen', 'place', 1, 0),
  N('Tasche', 'f', 'Taschen', 'Taschen', 'object', 1, 0),
  N('Lampe', 'f', 'Lampen', 'Lampen', 'object', 1, 0),
  N('Uhr', 'f', 'Uhren', 'Uhren', 'object', 1, 0),
  N('Tür', 'f', 'Türen', 'Türen', 'object', 1, 0),
  N('Brille', 'f', 'Brillen', 'Brillen', 'object', 1, 0),
  N('Zeitung', 'f', 'Zeitungen', 'Zeitungen', 'object', 1, 0),
  N('Karte', 'f', 'Karten', 'Karten', 'object', 1, 0),
  N('Flasche', 'f', 'Flaschen', 'Flaschen', 'object', 1, 0),
  N('Suppe', 'f', 'Suppen', 'Suppen', 'food', 1, 1),
  N('Torte', 'f', 'Torten', 'Torten', 'food', 1, 0),
  N('Birne', 'f', 'Birnen', 'Birnen', 'food', 1, 0),
  N('Kartoffel', 'f', 'Kartoffeln', 'Kartoffeln', 'food', 1, 0),
  N('Milch', 'f', 'Milch', 'Milch', 'food', 0, 1),
  N('Butter', 'f', 'Butter', 'Butter', 'food', 0, 1),
  N('Musik', 'f', 'Musik', 'Musik', 'abstract', 0, 1),
  N('Liebe', 'f', 'Liebe', 'Liebe', 'abstract', 0, 1),
  N('Geduld', 'f', 'Geduld', 'Geduld', 'abstract', 0, 1),
  N('Ruhe', 'f', 'Ruhe', 'Ruhe', 'abstract', 0, 1),
  N('Angst', 'f', 'Ängste', 'Ängsten', 'abstract', 1, 1),
  N('Hoffnung', 'f', 'Hoffnungen', 'Hoffnungen', 'abstract', 1, 1),

  // ---- neuter (40) ----
  N('Kind', 'n', 'Kinder', 'Kindern', 'person', 1, 0),
  N('Mädchen', 'n', 'Mädchen', 'Mädchen', 'person', 1, 0),
  N('Baby', 'n', 'Babys', 'Babys', 'person', 1, 0),
  N('Haus', 'n', 'Häuser', 'Häusern', 'place', 1, 0),
  N('Dorf', 'n', 'Dörfer', 'Dörfern', 'place', 1, 0),
  N('Zimmer', 'n', 'Zimmer', 'Zimmern', 'place', 1, 0),
  N('Hotel', 'n', 'Hotels', 'Hotels', 'place', 1, 0),
  N('Museum', 'n', 'Museen', 'Museen', 'place', 1, 0),
  N('Land', 'n', 'Länder', 'Ländern', 'place', 1, 0),
  N('Büro', 'n', 'Büros', 'Büros', 'place', 1, 0),
  N('Café', 'n', 'Cafés', 'Cafés', 'place', 1, 0),
  N('Pferd', 'n', 'Pferde', 'Pferden', 'animal', 1, 0),
  N('Schwein', 'n', 'Schweine', 'Schweinen', 'animal', 1, 0),
  N('Huhn', 'n', 'Hühner', 'Hühnern', 'animal', 1, 0),
  N('Buch', 'n', 'Bücher', 'Büchern', 'object', 1, 0),
  N('Bild', 'n', 'Bilder', 'Bildern', 'object', 1, 0),
  N('Fenster', 'n', 'Fenster', 'Fenstern', 'object', 1, 0),
  N('Auto', 'n', 'Autos', 'Autos', 'object', 1, 0),
  N('Fahrrad', 'n', 'Fahrräder', 'Fahrrädern', 'object', 1, 0),
  N('Handy', 'n', 'Handys', 'Handys', 'object', 1, 0),
  N('Hemd', 'n', 'Hemden', 'Hemden', 'object', 1, 0),
  N('Kleid', 'n', 'Kleider', 'Kleidern', 'object', 1, 0),
  N('Messer', 'n', 'Messer', 'Messern', 'object', 1, 0),
  N('Werkzeug', 'n', 'Werkzeuge', 'Werkzeugen', 'object', 1, 1),
  N('Papier', 'n', 'Papiere', 'Papieren', 'object', 1, 1),
  N('Gold', 'n', 'Gold', 'Gold', 'object', 0, 1),
  N('Holz', 'n', 'Hölzer', 'Hölzern', 'object', 0, 1),
  N('Wasser', 'n', 'Wasser', 'Wassern', 'food', 0, 1),
  N('Brot', 'n', 'Brote', 'Broten', 'food', 1, 1),
  N('Bier', 'n', 'Biere', 'Bieren', 'food', 1, 1),
  N('Ei', 'n', 'Eier', 'Eiern', 'food', 1, 0),
  N('Fleisch', 'n', 'Fleisch', 'Fleisch', 'food', 0, 1),
  N('Gemüse', 'n', 'Gemüse', 'Gemüsen', 'food', 0, 1),
  N('Obst', 'n', 'Obst', 'Obst', 'food', 0, 1),
  N('Salz', 'n', 'Salze', 'Salzen', 'food', 0, 1),
  N('Öl', 'n', 'Öle', 'Ölen', 'food', 0, 1),
  N('Geld', 'n', 'Gelder', 'Geldern', 'abstract', 0, 1),
  N('Glück', 'n', 'Glück', 'Glück', 'abstract', 0, 1),
  N('Wetter', 'n', 'Wetter', 'Wettern', 'abstract', 0, 1),
  N('Lied', 'n', 'Lieder', 'Liedern', 'abstract', 1, 0),
];

/* ---------------------------------------------------------------------------
 * ADJECTIVES.
 * Every lemma must survive the exclusion test: no -el or -er ending, not hoch,
 * not indeclinable. applies_to is the only hand-judgement in the build and it
 * is what stops "der grüne Gedanke".
 * ------------------------------------------------------------------------ */
const A = (lemma, applies_to) => ({ lemma, applies_to: applies_to.split('|') });

export const ADJECTIVES = [
  A('gut', 'person|animal|food|object|place|abstract'),
  A('schlecht', 'food|object|place|abstract'),
  A('alt', 'person|animal|object|place'),
  A('neu', 'object|place|abstract'),
  A('groß', 'person|animal|object|place'),
  A('klein', 'person|animal|object|place'),
  A('jung', 'person|animal'),
  A('schön', 'person|animal|object|place|abstract'),
  A('heiß', 'food|object'),
  A('kalt', 'food|object|place|abstract'),
  A('warm', 'food|object|place|abstract'),
  A('frisch', 'food|object'),
  A('süß', 'food|animal'),
  A('scharf', 'food|object'),
  A('stark', 'person|animal|abstract'),
  A('schnell', 'person|animal|object'),
  A('langsam', 'person|animal|object'),
  A('laut', 'person|animal|object|place'),
  A('still', 'person|animal|place'),
  A('freundlich', 'person|animal|place'),
  A('nett', 'person|animal'),
  A('klug', 'person|animal'),
  A('fleißig', 'person|animal'),
  A('krank', 'person|animal'),
  A('wach', 'person|animal'),
  A('gesund', 'person|animal|food'),
  A('glücklich', 'person|animal|abstract'),
  A('traurig', 'person|animal|abstract'),
  A('ruhig', 'person|animal|place|abstract'),
  A('wild', 'animal|place'),
  A('weich', 'food|object'),
  A('hart', 'food|object'),
  A('schmutzig', 'animal|object|place'),
  A('schmal', 'object|place'),
  A('voll', 'object|place'),
  A('bunt', 'animal|object|place'),
  A('hell', 'object|place'),
  A('lang', 'object|place|abstract'),
  A('kurz', 'object|place|abstract'),
  A('rund', 'object'),
  A('wichtig', 'person|object|abstract'),
  A('berühmt', 'person|place'),
  A('modern', 'object|place|abstract'),
  A('billig', 'food|object'),
  A('nützlich', 'object|abstract'),
  A('gefährlich', 'animal|place|object|abstract'),
  A('lustig', 'person|animal|abstract'),
  A('mutig', 'person|animal'),
  A('tief', 'place|abstract'),
  A('dick', 'person|animal|object'),
  A('dünn', 'person|animal|object'),
  A('leicht', 'food|object|abstract'),
  A('frei', 'person|place|abstract'),
  A('bequem', 'object'),
  A('hungrig', 'person|animal'),
  A('durstig', 'person|animal'),
  A('köstlich', 'food'),
  A('saftig', 'food'),
  A('mild', 'food|abstract'),
  A('trocken', 'food|object'),
  A('grün', 'food|object|place'),
  A('rot', 'food|object|place'),
  A('blau', 'object|place'),
  A('schwarz', 'animal|object'),
  A('weiß', 'animal|food|object'),
  A('braun', 'animal|food|object'),
  A('grau', 'animal|object|place'),
  A('interessant', 'person|object|place|abstract'),
];

/* ---------------------------------------------------------------------------
 * FRAMES. {np} expands to article + adjective-with-blank + noun.
 *
 * Only prepositions that govern exactly one case appear here — mit, aus, bei,
 * nach, seit, von, zu for the dative; für, ohne, durch, gegen, um for the
 * accusative. None of the nine two-way prepositions may appear, because with
 * those the case depends on motion and the frame would no longer fix it.
 *
 * article_sg / article_pl are kept honest per frame: "aus einem alten Haus" is
 * fine, "aus altem Haus" is not, so that frame drops the bare singular.
 * ------------------------------------------------------------------------ */
const F = (template, template_pl, kasus, allowed_sem, allowed_number, article_sg, article_pl) =>
  ({ template, template_pl, kasus,
     allowed_sem: allowed_sem.split('|'),
     allowed_number: allowed_number.split('|'),
     article_sg: article_sg.split('|'),
     article_pl: article_pl.split('|') });

export const FRAMES = [
  // nominative
  F('{np} steht dort.', '{np} stehen dort.', 'nom',
    'food|object|place', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('{np} ist angekommen.', '{np} sind angekommen.', 'nom',
    'person|animal', 'sg|pl', 'def|ein', 'def|ein|none'),
  F('{np} gefällt mir.', '{np} gefallen mir.', 'nom',
    'person|animal|object|place|abstract', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Hier ist {np}.', 'Hier sind {np}.', 'nom',
    'person|animal|food|object', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('{np} kostet viel.', '{np} kosten viel.', 'nom',
    'food|object', 'sg|pl', 'def|ein|none', 'def|ein|none'),

  // accusative
  F('Ich sehe {np}.', 'Ich sehe {np}.', 'acc',
    'person|animal|object|place', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Sie kauft {np}.', 'Sie kauft {np}.', 'acc',
    'food|object', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Wir suchen {np}.', 'Wir suchen {np}.', 'acc',
    'person|object|place', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Ich brauche {np}.', 'Ich brauche {np}.', 'acc',
    'food|object|abstract', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Er hat {np} gefunden.', 'Er hat {np} gefunden.', 'acc',
    'animal|object|food', 'sg|pl', 'def|ein|none', 'def|ein|none'),

  // dative
  F('Ich helfe {np}.', 'Ich helfe {np}.', 'dat',
    'person|animal', 'sg|pl', 'def|ein', 'def|ein|none'),
  F('Sie kocht mit {np}.', 'Sie kocht mit {np}.', 'dat',
    'food|object', 'sg|pl', 'def|ein|none', 'def|ein|none'),
  F('Er kommt aus {np}.', 'Er kommt aus {np}.', 'dat',
    'place', 'sg|pl', 'def|ein', 'def|ein|none'),
  F('Das gehört {np}.', 'Das gehört {np}.', 'dat',
    'person|animal', 'sg|pl', 'def|ein', 'def|ein|none'),
  F('Er arbeitet bei {np}.', 'Er arbeitet bei {np}.', 'dat',
    'person', 'sg|pl', 'def|ein', 'def|ein|none'),
  F('Sie spricht von {np}.', 'Sie spricht von {np}.', 'dat',
    'person|place|abstract|object', 'sg|pl', 'def|ein|none', 'def|ein|none'),
];

/* The nine two-way prepositions, asserted absent from every template. */
export const TWO_WAY_PREPOSITIONS =
  ['in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen'];

/* Adjectives that must never enter the seed data. */
export const INDECLINABLE = ['rosa', 'lila', 'beige', 'prima', 'super', 'orange', 'extra'];

/* Give every record a stable id, the way the SQLite PRIMARY KEYs would. */
NOUNS.forEach((n, i) => { n.id = i + 1; });
ADJECTIVES.forEach((a, i) => { a.id = i + 1; });
FRAMES.forEach((f, i) => { f.id = i + 1; });
CELLS.forEach((c, i) => { c.id = i + 1; c.key = `${c.article_class}|${c.kasus}|${c.gender_num}`; });

export const CELL_BY_KEY = new Map(CELLS.map(c => [c.key, c]));
export const CELL_BY_ID = new Map(CELLS.map(c => [c.id, c]));
export const NOUN_BY_ID = new Map(NOUNS.map(n => [n.id, n]));
export const ADJ_BY_ID = new Map(ADJECTIVES.map(a => [a.id, a]));
export const FRAME_BY_ID = new Map(FRAMES.map(f => [f.id, f]));
