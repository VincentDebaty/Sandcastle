#!/usr/bin/env node
// Vérifie les niveaux : sans mur, la mer doit atteindre un château ; une digue doit pouvoir le protéger.
// Calcule aussi la coupe minimale (nombre minimal de cellules de mur, trait de 1 cellule de large)
// pour régler le seau et l'objectif des 3 étoiles.
// Usage : node tools/check.js [id-du-niveau]
'use strict';
const Sim = require('../src/sim.js');
const LEVELS = require('../src/levels.js');

const INF = 1e9;

// Flot maximal par chemins augmentants (Edmonds-Karp) sur un graphe à capacités de sommets dédoublés.
function minCut(lv) {
  const n = lv.cols * lv.rows;
  const floodable = (i) => !lv.rock[i] && lv.terrain[i] < lv.tideMax;
  const N = 2 * n + 2, S = 2 * n, T = 2 * n + 1;
  const head = new Int32Array(N).fill(-1);
  const to = [], cap = [], next = [];
  function edge(a, b, c) {
    to.push(b); cap.push(c); next.push(head[a]); head[a] = to.length - 1;
    to.push(a); cap.push(0); next.push(head[b]); head[b] = to.length - 1;
  }
  const nb = [];
  for (let i = 0; i < n; i++) {
    if (!floodable(i)) continue;
    const sea = Sim.isSea(lv, i), castle = lv.castleCell[i];
    edge(2 * i, 2 * i + 1, sea || castle ? INF : 1);
    if (sea) edge(S, 2 * i, INF);
    if (castle) edge(2 * i + 1, T, INF);
    for (const j of Sim.neighbors(lv, i, nb)) if (floodable(j)) edge(2 * i + 1, 2 * j, INF);
  }
  let flow = 0;
  const prevEdge = new Int32Array(N);
  while (true) {
    prevEdge.fill(-1);
    const queue = [S];
    let found = false;
    for (let q = 0; q < queue.length && !found; q++) {
      const u = queue[q];
      for (let e = head[u]; e !== -1; e = next[e]) {
        const v = to[e];
        if (cap[e] > 0 && prevEdge[v] === -1 && v !== S) {
          prevEdge[v] = e;
          if (v === T) { found = true; break; }
          queue.push(v);
        }
      }
    }
    if (!found) break;
    let push = INF;
    for (let v = T; v !== S; v = to[prevEdge[v] ^ 1]) push = Math.min(push, cap[prevEdge[v]]);
    for (let v = T; v !== S; v = to[prevEdge[v] ^ 1]) { cap[prevEdge[v]] -= push; cap[prevEdge[v] ^ 1] += push; }
    flow += push;
    if (flow >= INF) return Infinity;
  }
  return flow;
}

const only = process.argv[2];
let failed = false;
LEVELS.forEach((def, k) => {
  if (only && def.id !== only) return;
  const lv = Sim.buildLevel(def);
  const problems = [];
  lv.castles.forEach((c, n) => {
    const hs = c.cells.map((i) => lv.terrain[i]);
    if (Math.min(...hs) < 0) problems.push(`château ${n + 1} en partie dans la mer`);
  });
  const open = Sim.resolve(lv, new Uint8Array(lv.cols * lv.rows));
  if (open.won) problems.push('trop facile : sans mur, la mer n’atteint aucun château');
  const cut = minCut(lv);
  if (!Number.isFinite(cut)) problems.push('impossible : la mer touche directement un château');
  // Un trait du pinceau fait environ 3 cellules de large : la coupe minimale coûte donc environ 3 × coupe.
  const suggestedPar = Math.round(cut * 3 * 1.4);
  const parInfo = `par=${lv.par} (conseillé ≈ ${suggestedPar})`;
  const bucketInfo = `seau=${lv.bucket}`;
  if (!(lv.par >= cut * 3)) problems.push(`par trop serré (minimum ${cut * 3})`);
  if (lv.bucket < lv.par * 1.6) problems.push(`seau trop petit (conseillé ≥ ${Math.ceil(lv.par * 1.6)})`);
  if (problems.length) failed = true;
  console.log(`${String(k + 1).padStart(2)}. ${def.id.padEnd(10)} ${lv.cols}×${lv.rows}  coupe=${cut}  ${parInfo}  ${bucketInfo}${problems.length ? '  ✗ ' + problems.join(' ; ') : ''}`);
});
process.exit(failed ? 1 : 0);
