#!/usr/bin/env node
// Vérifie chaque niveau : solvable ? meilleur score possible ? difficulté (taux de victoire en jouant au hasard) ?
// Usage : node tools/solve.js [id-du-niveau]
'use strict';
const Rules = require('../src/rules.js');
const LEVELS = require('../src/levels.js');

function key(s) { return s.h.join(',') + '|' + s.tide + '|' + s.actions; }

// Meilleur nombre de cases au sec atteignable depuis cet état, -1 si le drapeau est perdu quoi qu'on fasse.
function solve(level) {
  const memo = new Map();
  function best(state) {
    const k = key(state);
    if (memo.has(k)) return memo.get(k).score;
    const st = Rules.status(level, state);
    let result;
    if (st.over) result = { score: st.won ? st.dry : -1, move: null };
    else {
      result = { score: -1, move: undefined };
      const options = [...Rules.legalMoves(level, state), null];
      for (const m of options) {
        const sc = best(Rules.play(level, state, m));
        if (sc > result.score) result = { score: sc, move: m };
      }
    }
    memo.set(k, result);
    return result.score;
  }
  const start = Rules.initialState(level);
  const score = best(start);
  const path = [];
  let s = start;
  while (score >= 0 && !Rules.status(level, s).over) {
    const m = memo.get(key(s)).move;
    path.push(m ? `${label(level, m[0])}→${label(level, m[1])}` : 'attendre');
    s = Rules.play(level, s, m);
  }
  return { score, states: memo.size, path };
}

function label(level, i) {
  const c = level.cells[i];
  return `(${c.q},${c.r})`;
}

// Joueur aléatoire qui ne fait que des déplacements (pas d'attente) : mesure grossière de difficulté.
function randomWinRate(level, runs = 3000) {
  let wins = 0;
  for (let n = 0; n < runs; n++) {
    let s = Rules.initialState(level);
    let st = Rules.status(level, s);
    while (!st.over) {
      const moves = Rules.legalMoves(level, s);
      const m = moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
      s = Rules.play(level, s, m);
      st = Rules.status(level, s);
    }
    if (st.won) wins++;
  }
  return wins / runs;
}

const only = process.argv[2];
let failed = false;
LEVELS.forEach((def, n) => {
  if (only && def.id !== only) return;
  const level = Rules.parseLevel(def);
  const t0 = Date.now();
  const { score, states, path } = solve(level);
  const ms = Date.now() - t0;
  const rate = randomWinRate(level);
  const flag = score < 0 ? '  ✗ IMPOSSIBLE' : (def.best !== score ? `  ⚠ best devrait être ${score}` : '');
  if (score < 0 || flag) failed = true;
  console.log(`${String(n + 1).padStart(2)}. ${def.id.padEnd(12)} meilleur=${score}  hasard=${(rate * 100).toFixed(0)}%  états=${states} (${ms} ms)${flag}`);
  if (only) console.log('   solution : ' + path.join(', '));
});
process.exit(failed ? 1 : 0);
