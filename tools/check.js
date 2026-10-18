#!/usr/bin/env node
// Vérifie les niveaux et calcule de quoi régler le seau et les étoiles :
//  - sans mur, la mer doit atteindre un château (sinon le niveau est trivial) ;
//  - coupe minimale (flot maximal) : les cellules où un mur sauve tout au moindre coût ;
//  - « meilleur trait » : coût réel de cette coupe tracée au pinceau, et vérification qu'elle sauve bien les châteaux ;
//  - « naïf » : meilleur coût si l'on ne construit qu'autour des châteaux. Un niveau difficile doit le rendre impossible.
// Usage : node tools/check.js [id-du-niveau]
'use strict';
const Sim = require('../src/sim.js');
const LEVELS = require('../src/levels.js');

const INF = 1e9;
const NAIVE_RADIUS = 11; // cellules autour du centre d'un château

// Flot maximal (Edmonds-Karp) sur un graphe à capacités de sommets dédoublés.
// allowed(i) : la cellule peut-elle recevoir un mur ? Sinon sa capacité est infinie.
function minCut(lv, allowed) {
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
    edge(2 * i, 2 * i + 1, sea || castle || !allowed(i) ? INF : 1);
    if (sea) edge(S, 2 * i, INF);
    if (castle) edge(2 * i + 1, T, INF);
    for (const j of Sim.neighbors(lv, i, nb)) if (floodable(j)) edge(2 * i + 1, 2 * j, INF);
  }
  let flow = 0;
  const prevEdge = new Int32Array(N);
  function bfs() {
    prevEdge.fill(-1);
    const seen = new Uint8Array(N);
    seen[S] = 1;
    const queue = [S];
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      for (let e = head[u]; e !== -1; e = next[e]) {
        const v = to[e];
        if (cap[e] > 0 && !seen[v]) { seen[v] = 1; prevEdge[v] = e; queue.push(v); }
      }
    }
    return seen;
  }
  let seen;
  while (true) {
    seen = bfs();
    if (!seen[T]) break;
    let push = INF;
    for (let v = T; v !== S; v = to[prevEdge[v] ^ 1]) push = Math.min(push, cap[prevEdge[v]]);
    for (let v = T; v !== S; v = to[prevEdge[v] ^ 1]) { cap[prevEdge[v]] -= push; cap[prevEdge[v] ^ 1] += push; }
    flow += push;
    if (flow >= INF) return { flow: Infinity, cells: [] };
  }
  const cells = [];
  for (let i = 0; i < n; i++) if (seen[2 * i] && !seen[2 * i + 1]) cells.push(i);
  return { flow, cells };
}

// Trace la coupe au pinceau, cellule par cellule : coût réel en sable, et la digue tient-elle ?
function brushCost(lv, cells) {
  const n = lv.cols * lv.rows;
  const wall = new Uint8Array(n);
  const water = Sim.createWater(lv);
  let cost = 0;
  for (const i of cells) {
    const p = [(i % lv.cols) + 0.5, Math.floor(i / lv.cols) + 0.5];
    cost += Sim.paint(lv, wall, water, p, p, Infinity).length;
  }
  return { cost, holds: Sim.resolve(lv, wall).won };
}

module.exports = { minCut, brushCost };

if (require.main === module) {
  const only = process.argv[2];
  let failed = false;
  LEVELS.forEach((def, k) => {
    if (only && def.id !== only) return;
    const lv = Sim.buildLevel(def);
    const problems = [];
    lv.castles.forEach((c, n) => {
      if (Math.min(...c.cells.map((i) => lv.terrain[i])) < 0) problems.push(`château ${n + 1} en partie dans la mer`);
    });
    if (Sim.resolve(lv, new Uint8Array(lv.cols * lv.rows)).won) problems.push('trop facile : sans mur, la mer n’atteint aucun château');

    const best = minCut(lv, () => true);
    if (!Number.isFinite(best.flow)) problems.push('impossible : la mer touche directement un château');
    const bestBrush = brushCost(lv, best.cells);
    if (!bestBrush.holds) problems.push('la coupe minimale tracée au pinceau ne tient pas');

    const near = (i) => {
      const x = (i % lv.cols) + 0.5, y = Math.floor(i / lv.cols) + 0.5;
      return lv.castles.some((c) => Math.hypot(x - c.x, y - c.y) <= NAIVE_RADIUS);
    };
    const naive = minCut(lv, near);
    const naiveBrush = Number.isFinite(naive.flow) ? brushCost(lv, naive.cells).cost : Infinity;

    const suggestedPar = Math.round(bestBrush.cost * 1.25);
    if (def.hard) {
      if (lv.bucket < bestBrush.cost * 1.1) problems.push(`seau trop serré : il faut au moins ${Math.ceil(bestBrush.cost * 1.1)}`);
      if (lv.par < bestBrush.cost || lv.par > lv.bucket) problems.push(`par hors de [${bestBrush.cost}, ${lv.bucket}]`);
      if (naiveBrush <= lv.bucket) problems.push(`entourer les châteaux suffit (${naiveBrush} ≤ seau ${lv.bucket})`);
    } else {
      if (lv.par < bestBrush.cost) problems.push(`par trop serré (minimum ${bestBrush.cost})`);
      if (lv.bucket < lv.par * 1.6) problems.push(`seau trop petit (conseillé ≥ ${Math.ceil(lv.par * 1.6)})`);
    }
    if (problems.length) failed = true;
    console.log(`${String(k + 1).padStart(2)}. ${def.id.padEnd(10)} coupe=${best.flow}  meilleur trait=${bestBrush.cost}  naïf=${naiveBrush}  ` +
      `par=${lv.par} (conseillé ${suggestedPar})  seau=${lv.bucket}${def.hard ? '  [difficile]' : ''}` +
      (problems.length ? '\n    ✗ ' + problems.join(' ; ') : ''));
  });
  process.exit(failed ? 1 : 0);
}

// Solution tracée comme le ferait un joueur : la coupe optimale découpée en traits continus
// (groupes de cellules voisines, parcourus de proche en proche). Coordonnées en cellules.
function solutionStrokes(lv) {
  const { cells } = minCut(lv, () => true);
  const left = new Set(cells);
  const xy = (i) => [(i % lv.cols) + 0.5, Math.floor(i / lv.cols) + 0.5];
  const strokes = [];
  while (left.size) {
    // un groupe = cellules reliées par un coin ou un côté
    const seed = left.values().next().value;
    const group = [seed];
    left.delete(seed);
    for (let g = 0; g < group.length; g++) {
      const [x, y] = xy(group[g]);
      for (const i of [...left]) {
        const [u, v] = xy(i);
        if (Math.abs(u - x) <= 1.5 && Math.abs(v - y) <= 1.5) { group.push(i); left.delete(i); }
      }
    }
    // partir d'une extrémité, puis avancer vers la cellule la plus proche
    const far = (from, pool) => pool.reduce((best, i) => {
      const d = Math.hypot(xy(i)[0] - xy(from)[0], xy(i)[1] - xy(from)[1]);
      return d > best.d ? { i, d } : best;
    }, { i: from, d: -1 }).i;
    let cur = far(group[0], group);
    const pool = new Set(group);
    pool.delete(cur);
    const path = [xy(cur)];
    while (pool.size) {
      let next = null, nd = Infinity;
      for (const i of pool) {
        const d = Math.hypot(xy(i)[0] - xy(cur)[0], xy(i)[1] - xy(cur)[1]);
        if (d < nd) { nd = d; next = i; }
      }
      pool.delete(next);
      cur = next;
      path.push(xy(cur));
    }
    strokes.push(path.filter((_, k) => k % 3 === 0 || k === path.length - 1));
  }
  return strokes;
}
module.exports.solutionStrokes = solutionStrokes;
