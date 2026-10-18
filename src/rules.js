// Règles du jeu, sans aucun affichage : utilisées par le navigateur et par le solveur (tools/solve.js).
(function (root) {
  'use strict';

  // Voisins en coordonnées axiales (hexagones « pointe en haut »).
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const ROCK_HEIGHT = 99;

  // Carte : une chaîne par rangée, jetons séparés par des espaces, rangées impaires décalées à droite.
  //   .   mer       1..9   sable de cette hauteur
  //   F2  drapeau sur une case de hauteur 2
  //   R   rocher (ne s'inonde jamais, ni pelle ni dépôt, mais on marche dessus)
  function parseLevel(def) {
    const cells = [];
    def.map.forEach((line, row) => {
      line.trim().split(/\s+/).forEach((tok, col) => {
        if (tok === '.') return;
        const q = col - (row - (row & 1)) / 2;
        const cell = { q, r: row, h: 0, flag: false, rock: false };
        if (tok === 'R') { cell.rock = true; cell.h = ROCK_HEIGHT; }
        else if (tok[0] === 'F') { cell.flag = true; cell.h = parseInt(tok.slice(1), 10); }
        else cell.h = parseInt(tok, 10);
        if (Number.isNaN(cell.h)) throw new Error(`Jeton inconnu « ${tok} » dans ${def.id}`);
        cells.push(cell);
      });
    });
    const index = new Map(cells.map((c, i) => [c.q + ',' + c.r, i]));
    cells.forEach((c) => {
      c.neighbors = [];
      c.coast = false;
      for (const [dq, dr] of DIRS) {
        const j = index.get((c.q + dq) + ',' + (c.r + dr));
        if (j === undefined) c.coast = true;
        else c.neighbors.push(j);
      }
    });
    return {
      id: def.id,
      name: def.name,
      hint: def.hint || '',
      tideEvery: def.tideEvery,
      tideMax: def.tideMax,
      best: def.best || 1,
      cells,
    };
  }

  function initialState(level) {
    return { h: level.cells.map((c) => c.h), tide: 0, actions: 0 };
  }

  // L'eau entre par la côte et se propage de case en case tant que le sable est à hauteur ≤ marée.
  // Une cuvette entourée de cases plus hautes reste donc au sec.
  function computeWet(level, h, tide) {
    const wet = new Array(h.length).fill(false);
    const queue = [];
    level.cells.forEach((c, i) => {
      if (c.coast && !c.rock && h[i] <= tide) { wet[i] = true; queue.push(i); }
    });
    while (queue.length) {
      const i = queue.pop();
      for (const j of level.cells[i].neighbors) {
        if (!wet[j] && !level.cells[j].rock && h[j] <= tide) { wet[j] = true; queue.push(j); }
      }
    }
    return wet;
  }

  function canTake(level, state, wet, i) {
    const c = level.cells[i];
    return !c.rock && !c.flag && !wet[i] && state.h[i] > 0;
  }

  // On porte le sable à pied : la destination doit être reliée à la source par la terre ferme.
  // Une case inondée accepte du sable (remblai) si elle touche cette terre ferme.
  function targetsFrom(level, state, wet, src) {
    const seen = new Array(state.h.length).fill(false);
    const stack = [src];
    seen[src] = true;
    while (stack.length) {
      const i = stack.pop();
      for (const j of level.cells[i].neighbors) {
        if (!seen[j] && !wet[j]) { seen[j] = true; stack.push(j); }
      }
    }
    const targets = [];
    level.cells.forEach((c, j) => {
      if (j === src || c.rock) return;
      if (seen[j]) targets.push(j);
      else if (wet[j] && c.neighbors.some((k) => seen[k])) targets.push(j);
    });
    return targets;
  }

  function legalMoves(level, state) {
    const wet = computeWet(level, state.h, state.tide);
    const moves = [];
    level.cells.forEach((_, i) => {
      if (!canTake(level, state, wet, i)) return;
      for (const j of targetsFrom(level, state, wet, i)) moves.push([i, j]);
    });
    return moves;
  }

  // Une action = un déplacement de sable ou une attente (move = null). La marée suit le compteur.
  function play(level, state, move) {
    const h = state.h.slice();
    if (move) { h[move[0]] -= 1; h[move[1]] += 1; }
    let actions = state.actions + 1;
    let tide = state.tide;
    if (actions >= level.tideEvery) { tide += 1; actions = 0; }
    return { h, tide, actions };
  }

  function status(level, state) {
    const wet = computeWet(level, state.h, state.tide);
    const lost = level.cells.some((c, i) => c.flag && wet[i]);
    if (lost) return { over: true, won: false, wet };
    if (state.tide >= level.tideMax) return { over: true, won: true, wet, dry: dryCount(level, wet) };
    return { over: false, won: false, wet };
  }

  // Score : cases de sable restées au sec quand la marée est au plus haut.
  function dryCount(level, wet) {
    return level.cells.reduce((n, c, i) => n + (!c.rock && !wet[i] ? 1 : 0), 0);
  }

  const api = { DIRS, ROCK_HEIGHT, parseLevel, initialState, computeWet, canTake, targetsFrom, legalMoves, play, status, dryCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof self !== 'undefined' ? self : this);
