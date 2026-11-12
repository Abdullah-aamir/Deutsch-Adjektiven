/* probe.js — what fraction of a strong model's output survives the validator?
 *
 * The sentences below were written to the same prompt the app sends, by a
 * capable model (Claude Opus 5), without looking at what the validator wants
 * beyond the rules the prompt states. They are then run through the real
 * validate.js. This measures the validator's behaviour against good-faith
 * output: a high rejection rate here would mean the gate is too tight and the
 * feature is expensive for nothing.
 *
 * Run: node probe.js
 */

import { CELL_BY_KEY } from './data.js';
import { validateBatch } from './validate.js';

const S = (sentence, adjective, noun, article, number = 'sg') =>
  ({ sentence, adjective, noun, article, number });

const BATCHES = {
  'def|nom|m': [
    S('Der neue Computer funktioniert gut.', 'neu', 'Computer', 'der'),
    S('Der kleine Hund schläft tief.', 'klein', 'Hund', 'der'),
    S('Der frische Saft schmeckt lecker.', 'frisch', 'Saft', 'der'),
    S('Der junge Arzt arbeitet fleißig.', 'jung', 'Arzt', 'der'),
    S('Der starke Wind weht heute.', 'stark', 'Wind', 'der'),
    S('Der rote Teppich gefällt mir.', 'rot', 'Teppich', 'der'),
  ],
  'def|dat|pl': [
    S('Ich helfe den kranken Kindern.', 'krank', 'Kindern', 'das', 'pl'),
    S('Wir danken den freundlichen Lehrern.', 'freundlich', 'Lehrern', 'der', 'pl'),
    S('Er kommt aus den kalten Ländern.', 'kalt', 'Ländern', 'das', 'pl'),
    S('Sie fährt mit den schnellen Zügen.', 'schnell', 'Zügen', 'der', 'pl'),
    S('Das gehört den jungen Frauen.', 'jung', 'Frauen', 'die', 'pl'),
    S('Ich schreibe den alten Freunden.', 'alt', 'Freunden', 'der', 'pl'),
  ],
  'ein|nom|n': [
    S('Ein kleines Kind spielt draußen.', 'klein', 'Kind', 'das'),
    S('Ein großes Haus steht dort.', 'groß', 'Haus', 'das'),
    S('Ein frisches Brot liegt bereit.', 'frisch', 'Brot', 'das'),
    S('Mein neues Handy funktioniert nicht.', 'neu', 'Handy', 'das'),
    S('Kein gutes Buch bleibt ungelesen.', 'gut', 'Buch', 'das'),
    S('Ein altes Fahrrad gehört ihm.', 'alt', 'Fahrrad', 'das'),
  ],
  'ein|acc|m': [
    S('Ich sehe einen alten Mann.', 'alt', 'Mann', 'der'),
    S('Sie kauft einen neuen Schrank.', 'neu', 'Schrank', 'der'),
    S('Er sucht einen guten Arzt.', 'gut', 'Arzt', 'der'),
    S('Wir brauchen einen starken Motor.', 'stark', 'Motor', 'der'),
    S('Ich habe einen kleinen Garten.', 'klein', 'Garten', 'der'),
    S('Sie trifft einen netten Freund.', 'nett', 'Freund', 'der'),
  ],
  'none|nom|pl': [
    S('Gute Weine kommen aus Italien.', 'gut', 'Weine', 'der', 'pl'),
    S('Alte Bücher kosten wenig.', 'alt', 'Bücher', 'das', 'pl'),
    S('Kleine Kinder spielen gern.', 'klein', 'Kinder', 'das', 'pl'),
    S('Frische Brötchen schmecken wunderbar.', 'frisch', 'Brötchen', 'das', 'pl'),
    S('Junge Hunde lernen schnell.', 'jung', 'Hunde', 'der', 'pl'),
    S('Rote Blumen blühen hier.', 'rot', 'Blumen', 'die', 'pl'),
  ],
  'none|dat|f': [
    S('Sie kocht mit frischer Milch.', 'frisch', 'Milch', 'die'),
    S('Er spricht von alter Musik.', 'alt', 'Musik', 'die'),
    S('Sie arbeitet mit großer Geduld.', 'groß', 'Geduld', 'die'),
    S('Nach langer Zeit kam er zurück.', 'lang', 'Zeit', 'die'),
    S('Sie kocht mit scharfer Soße.', 'scharf', 'Soße', 'die'),
    S('Er schreibt mit roter Tinte.', 'rot', 'Tinte', 'die'),
  ],
  'none|acc|n': [
    S('Sie kauft frisches Brot.', 'frisch', 'Brot', 'das'),
    S('Ich trinke kaltes Wasser.', 'kalt', 'Wasser', 'das'),
    S('Er isst warmes Gemüse.', 'warm', 'Gemüse', 'das'),
    S('Wir brauchen neues Werkzeug.', 'neu', 'Werkzeug', 'das'),
    S('Sie sucht gutes Papier.', 'gut', 'Papier', 'das'),
    S('Ich mag starkes Bier.', 'stark', 'Bier', 'das'),
  ],
  'def|acc|f': [
    S('Ich sehe die junge Frau.', 'jung', 'Frau', 'die'),
    S('Sie öffnet die alte Tür.', 'alt', 'Tür', 'die'),
    S('Er liest die neue Zeitung.', 'neu', 'Zeitung', 'die'),
    S('Wir besuchen die alte Kirche.', 'alt', 'Kirche', 'die'),
    S('Sie nimmt die kleine Tasche.', 'klein', 'Tasche', 'die'),
    S('Ich kaufe die rote Lampe.', 'rot', 'Lampe', 'die'),
  ],
};

let total = 0, kept = 0;
const reasons = {};
const losses = [];

for (const [key, items] of Object.entries(BATCHES)) {
  const cell = CELL_BY_KEY.get(key);
  const r = validateBatch(items, cell);
  total += items.length;
  kept += r.kept.length;
  for (const x of r.rejected) {
    reasons[x.reason] = (reasons[x.reason] || 0) + 1;
    losses.push(`${key.padEnd(13)} ${x.reason.padEnd(32)} ${x.sentence}`);
  }
  console.log(`  ${key.padEnd(13)} kept ${String(r.kept.length).padStart(2)}/${items.length}`);
}

console.log(`\npass rate: ${kept}/${total} = ${Math.round(100 * kept / total)}%`);
if (losses.length) {
  console.log('\nrejected:');
  for (const l of losses) console.log('  ' + l);
  console.log('\nby reason:', reasons);
}
