/* pool.js — the magazine.
 *
 * Model-written items are held in 36 per-cell queues, not one flat list. The
 * selector asks for the cell you are worst at, so a flat pool would starve
 * exactly the cells you need while items for your strong cells go stale: at
 * twenty questions a day on three weak cells, a flat 500 would run those dry
 * in under a week with 400 items left in it.
 *
 * Whatever the pool cannot supply, the static generator supplies, so the app
 * never depends on the network or on a model being reachable.
 */

import { CELLS } from './data.js';

const KEY = 'aet.pool.v1';

export const TARGET_PER_CELL = 14;    // 36 x 14 = 504
export const LOW_WATER = 4;           // refill a cell when it drops to this
export const REFILL_BATCH = 10;       // items requested per cell per call

function emptyPool() {
  return { version: 1, cells: Object.fromEntries(CELLS.map(c => [c.id, []])), log: [] };
}

function read() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (!p || p.version !== 1 || !p.cells) return emptyPool();
    for (const c of CELLS) if (!Array.isArray(p.cells[c.id])) p.cells[c.id] = [];
    return p;
  } catch { return emptyPool(); }
}

function write(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    // Trim the fullest cells and try once more rather than losing the pool.
    for (const id of Object.keys(p.cells)) p.cells[id] = p.cells[id].slice(0, 6);
    p.log = p.log.slice(-20);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* give up quietly */ }
  }
}

export const pool = {
  /** Take one item for a cell, or null if that queue is empty. */
  take(cellId) {
    const p = read();
    const q = p.cells[cellId];
    if (!q || !q.length) return null;
    const item = q.shift();
    write(p);
    return item;
  },

  /** Put validated items in. Duplicates by sentence are dropped. */
  add(cellId, items) {
    const p = read();
    const q = p.cells[cellId] || (p.cells[cellId] = []);
    const seen = new Set(q.map(i => i.full_sentence));
    let added = 0;
    for (const it of items) {
      if (seen.has(it.full_sentence)) continue;
      if (q.length >= TARGET_PER_CELL * 2) break;
      q.push(it); seen.add(it.full_sentence); added++;
    }
    write(p);
    return added;
  },

  /** Remove one item everywhere — used when you flag a bad sentence. */
  remove(sentence) {
    const p = read();
    for (const id of Object.keys(p.cells)) {
      p.cells[id] = p.cells[id].filter(i => i.full_sentence !== sentence);
    }
    write(p);
  },

  /** Cells at or below the low-water mark, emptiest first. */
  lowCells() {
    const p = read();
    return CELLS
      .map(c => ({ cell: c, n: (p.cells[c.id] || []).length }))
      .filter(x => x.n <= LOW_WATER)
      .sort((a, b) => a.n - b.n);
  },

  /** Cells below the target depth, emptiest first — used for a full top-up. */
  hungryCells() {
    const p = read();
    return CELLS
      .map(c => ({ cell: c, n: (p.cells[c.id] || []).length }))
      .filter(x => x.n < TARGET_PER_CELL)
      .sort((a, b) => a.n - b.n);
  },

  status() {
    const p = read();
    const counts = CELLS.map(c => (p.cells[c.id] || []).length);
    const total = counts.reduce((a, b) => a + b, 0);
    return {
      total,
      capacity: TARGET_PER_CELL * CELLS.length,
      empty: counts.filter(n => n === 0).length,
      low: counts.filter(n => n <= LOW_WATER).length,
      log: p.log.slice(-12),
    };
  },

  note(entry) {
    const p = read();
    p.log.push({ at: new Date().toISOString(), ...entry });
    p.log = p.log.slice(-40);
    write(p);
  },

  clear() { write(emptyPool()); },
};
