// Simulation, sans affichage : terrain, murs de sable, montée de l'eau.
// Partagée par le navigateur (app.js) et les outils (tools/*.js).
(function (root) {
  'use strict';

  const CHAR = 6;          // un caractère de la carte = 6 × 6 cellules
  const WALL_H = 3;        // un mur ajoute 3 niveaux au terrain
  const ROCK_H = 6;
  const CASTLE_R = 4.6;    // rayon de l'emprise d'un château, en cellules
  const BRUSH_R = 1.3;     // rayon du pinceau : un trait fait environ 3 cellules de large

  const HEIGHTS = { '~': -1.5, ',': -0.4, '.': 0.4, R: ROCK_H };

  function charHeight(ch) {
    if (ch in HEIGHTS) return HEIGHTS[ch];
    const n = parseInt(ch, 10);
    if (Number.isNaN(n)) throw new Error(`Caractère de carte inconnu « ${ch} »`);
    return n;
  }

  // Petit bruit déterministe pour que les côtes ne soient pas trop régulières.
  function noise(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function buildLevel(def) {
    const mapRows = def.map.length;
    const mapCols = def.map[0].length;
    def.map.forEach((row, r) => {
      if (row.length !== mapCols) throw new Error(`${def.id} : la ligne ${r} fait ${row.length} caractères au lieu de ${mapCols}`);
    });
    const cols = mapCols * CHAR, rows = mapRows * CHAR;
    const n = cols * rows;
    const terrain = new Float32Array(n);
    const rock = new Uint8Array(n);
    const at = (c, r) => charHeight(def.map[Math.max(0, Math.min(mapRows - 1, r))][Math.max(0, Math.min(mapCols - 1, c))]);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const cx = Math.floor(x / CHAR), cy = Math.floor(y / CHAR);
        if (def.map[cy][cx] === 'R') { rock[i] = 1; terrain[i] = ROCK_H; continue; }
        // interpolation bilinéaire entre les centres des caractères (les rochers comptent comme du sable haut)
        const fx = (x + 0.5) / CHAR - 0.5, fy = (y + 0.5) / CHAR - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const h = (c, r) => Math.min(at(c, r), 4);
        const v = h(x0, y0) * (1 - tx) * (1 - ty) + h(x0 + 1, y0) * tx * (1 - ty) +
                  h(x0, y0 + 1) * (1 - tx) * ty + h(x0 + 1, y0 + 1) * tx * ty;
        terrain[i] = v + (noise(x, y) - 0.5) * 0.18;
      }
    }
    const castles = def.castles.map(([mx, my]) => {
      const x = mx * CHAR, y = my * CHAR; // centre en cellules
      const cells = [];
      for (let yy = Math.floor(y - CASTLE_R); yy <= Math.ceil(y + CASTLE_R); yy++) {
        for (let xx = Math.floor(x - CASTLE_R); xx <= Math.ceil(x + CASTLE_R); xx++) {
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) <= CASTLE_R) cells.push(yy * cols + xx);
        }
      }
      return { x, y, cells };
    });
    const castleCell = new Uint8Array(n);
    castles.forEach((c) => c.cells.forEach((i) => { castleCell[i] = 1; }));
    return {
      id: def.id, name: def.name, hint: def.hint || '',
      cols, rows, terrain, rock, castles, castleCell,
      tideMax: def.tideMax, bucket: def.bucket, par: def.par || null,
      guide: def.guide ? def.guide.map(([gx, gy]) => [gx * CHAR, gy * CHAR]) : null,
    };
  }

  function neighbors(lv, i, out) {
    out.length = 0;
    const x = i % lv.cols, y = (i - x) / lv.cols;
    if (x > 0) out.push(i - 1);
    if (x < lv.cols - 1) out.push(i + 1);
    if (y > 0) out.push(i - lv.cols);
    if (y < lv.rows - 1) out.push(i + lv.cols);
    return out;
  }

  function isSea(lv, i) { return lv.terrain[i] < 0 && !lv.rock[i]; }

  function canBuild(lv, wall, water, i) {
    return !lv.rock[i] && !lv.castleCell[i] && !wall[i] && !water.wet[i] && lv.terrain[i] >= 0;
  }

  // Tamponne le pinceau le long d'un segment (coordonnées en cellules). Renvoie les cellules construites.
  function paint(lv, wall, water, from, to, budget) {
    const built = [];
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    const r = Math.ceil(BRUSH_R);
    for (let s = 0; s <= steps && built.length < budget; s++) {
      const px = from[0] + (to[0] - from[0]) * (s / steps);
      const py = from[1] + (to[1] - from[1]) * (s / steps);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(px) + dx, y = Math.floor(py) + dy;
          if (x < 0 || y < 0 || x >= lv.cols || y >= lv.rows) continue;
          if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > BRUSH_R) continue;
          const i = y * lv.cols + x;
          if (built.length >= budget) break;
          if (canBuild(lv, wall, water, i)) { wall[i] = 1; built.push(i); }
        }
      }
    }
    return built;
  }

  function ground(lv, wall, i) { return lv.terrain[i] + (wall[i] ? WALL_H : 0); }

  // L'eau : la mer (terrain < 0) est mouillée dès le départ ; à chaque pas, l'eau gagne
  // les cellules voisines plus basses que le niveau de la mer. parent[] garde le chemin suivi.
  function createWater(lv) {
    const n = lv.cols * lv.rows;
    const water = { wet: new Uint8Array(n), parent: new Int32Array(n).fill(-1) };
    for (let i = 0; i < n; i++) if (isSea(lv, i)) water.wet[i] = 1;
    return water;
  }

  const tmp = [];
  // Avance l'eau d'un anneau de cellules au niveau `level`. Renvoie le nombre de cellules gagnées.
  function stepWater(lv, wall, water, level) {
    const n = lv.cols * lv.rows;
    const fresh = [];
    for (let i = 0; i < n; i++) {
      if (water.wet[i] !== 1) continue; // les cellules gagnées pendant ce pas ne propagent qu'au suivant
      if (!isSea(lv, i) && ground(lv, wall, i) >= level) { water.wet[i] = 0; continue; }
      neighbors(lv, i, tmp);
      for (const j of tmp) {
        if (!water.wet[j] && !lv.rock[j] && ground(lv, wall, j) < level) {
          water.wet[j] = 2; // marquée pour ce pas, pas encore source
          water.parent[j] = i;
          fresh.push(j);
        }
      }
    }
    for (const j of fresh) water.wet[j] = 1;
    return fresh.length;
  }

  function floodedCastle(lv, water) {
    for (let k = 0; k < lv.castles.length; k++) {
      for (const i of lv.castles[k].cells) if (water.wet[i]) return { castle: k, cell: i };
    }
    return null;
  }

  // Chemin de l'eau, de la mer jusqu'à la cellule donnée.
  function pathTo(lv, water, cell) {
    const path = [];
    let i = cell, guard = 0;
    while (i >= 0 && guard++ < lv.cols * lv.rows) {
      path.push(i);
      i = water.parent[i];
    }
    return path.reverse();
  }

  // Résultat sans animation : la mer à son plus haut atteint-elle un château ?
  function resolve(lv, wall) {
    const water = createWater(lv);
    let guard = 0;
    while (stepWater(lv, wall, water, lv.tideMax) > 0 && guard++ < 100000) {
      const hit = floodedCastle(lv, water);
      if (hit) return { won: false, hit, water };
    }
    const hit = floodedCastle(lv, water);
    return { won: !hit, hit, water };
  }

  const api = { CHAR, WALL_H, BRUSH_R, buildLevel, createWater, stepWater, paint, ground, canBuild, isSea, floodedCastle, pathTo, resolve, neighbors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof self !== 'undefined' ? self : this);
