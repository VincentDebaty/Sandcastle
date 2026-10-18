// Interface : dessin des murs, rendu de la plage, marée animée, écrans de fin.
(function () {
  'use strict';
  const Sim = window.Sim;
  const LEVELS = window.LEVELS;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const K = 3;                 // pixels de rendu par cellule (avant mise à l'échelle)
  const RISE = 5;              // secondes de montée de la marée
  const FLOW = 45;             // anneaux d'eau par seconde
  const HOLD_MIN = 1.2;        // secondes minimales à marée haute
  const STAR2 = 1.5;           // 2 étoiles jusqu'à 1,5 × l'objectif

  // ---------- état ----------
  let levelIdx = 0;
  let lv = null;
  let wall, wallVis, wetVis, water;
  let strokes = [];            // chaque trait = liste des cellules construites
  let current = null;          // trait en cours
  let lastPoint = null;
  let left = 0;                // sable restant
  let phase = 'build';         // build | tide | won | lost
  let tideTime = 0, seaLevel = 0, flowAcc = 0, quietTime = 0;
  let lostPath = null, lostCastle = -1, lostAt = 0;
  let wonAt = 0;
  let particles = [];
  let contour = [];
  let progress = loadProgress();
  let finger = null;

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem('maree-haute.digue') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem('maree-haute.digue', JSON.stringify(progress)); } catch (e) { /* stockage indisponible */ }
  }

  function startLevel(idx, savedStrokes) {
    levelIdx = idx;
    lv = Sim.buildLevel(LEVELS[idx]);
    const n = lv.cols * lv.rows;
    wall = new Uint8Array(n);
    wallVis = new Float32Array(n);
    water = Sim.createWater(lv);
    wetVis = new Float32Array(n);
    for (let i = 0; i < n; i++) wetVis[i] = water.wet[i];
    strokes = []; current = null; left = lv.bucket;
    if (savedStrokes) {
      for (const s of savedStrokes) {
        const kept = s.filter((i) => Sim.canBuild(lv, wall, water, i)).slice(0, left);
        kept.forEach((i) => { wall[i] = 1; wallVis[i] = 1; });
        left -= kept.length;
        if (kept.length) strokes.push(kept);
      }
    }
    phase = 'build'; tideTime = 0; seaLevel = 0; lostPath = null; lostCastle = -1;
    particles = [];
    contour = buildContour();
    $('result').hidden = true;
    $('level-num').textContent = `Niveau ${idx + 1} sur ${LEVELS.length}`;
    $('level-name').textContent = lv.name;
    setHint(lv.hint);
    layout();
    refreshHud();
  }

  // Ligne de marée haute : bords entre cellules sous et au-dessus de tideMax (terrain seul).
  function buildContour() {
    const pts = [];
    const low = (i) => !lv.rock[i] && lv.terrain[i] < lv.tideMax;
    for (let y = 0; y < lv.rows; y++) {
      for (let x = 0; x < lv.cols; x++) {
        const i = y * lv.cols + x;
        if (x < lv.cols - 1 && low(i) !== low(i + 1)) pts.push([x + 1, y + 0.5]);
        if (y < lv.rows - 1 && low(i) !== low(i + lv.cols)) pts.push([x + 0.5, y + 1]);
      }
    }
    return pts;
  }

  // ---------- haut de l'écran ----------
  function refreshHud() {
    const used = lv.bucket - left;
    $('bucket-label').textContent = `Sable ${left}`;
    $('bar-fill').style.width = `${(left / lv.bucket) * 100}%`;
    const bar = $('bar');
    bar.querySelectorAll('.mark').forEach((m) => m.remove());
    if (lv.par) {
      [[lv.par, '★★★'], [Math.round(lv.par * STAR2), '★★']].forEach(([p, label]) => {
        const keep = lv.bucket - p;
        if (keep <= 0) return;
        const m = document.createElement('div');
        m.className = 'mark';
        m.style.left = `${(keep / lv.bucket) * 100}%`;
        m.innerHTML = `<span>${label}</span>`;
        bar.appendChild(m);
      });
    }
    $('btn-undo').disabled = phase !== 'build' || strokes.length === 0;
    $('btn-clear').disabled = phase !== 'build' || used === 0;
    $('btn-tide').disabled = phase !== 'build';
  }

  let hintTimer = null;
  function setHint(text, temporary) {
    $('hint').textContent = text;
    clearTimeout(hintTimer);
    if (temporary) hintTimer = setTimeout(() => { if (phase === 'build') $('hint').textContent = lv.hint; }, 2600);
  }

  // ---------- actions ----------
  function undoStroke() {
    if (phase !== 'build' || !strokes.length) return;
    const s = strokes.pop();
    s.forEach((i) => { wall[i] = 0; });
    left += s.length;
    refreshHud();
  }

  function clearAll() {
    if (phase !== 'build') return;
    while (strokes.length) undoStroke();
    lostPath = null;
  }

  function launchTide() {
    if (phase !== 'build') return;
    phase = 'tide';
    tideTime = 0; seaLevel = 0; flowAcc = 0; quietTime = 0;
    water = Sim.createWater(lv);
    lostPath = null;
    setHint('La mer monte…');
    buzz(20);
    refreshHud();
  }

  function repair() {
    // on garde les murs, la mer redescend, on peut boucher la brèche
    phase = 'build';
    water = Sim.createWater(lv);
    seaLevel = 0;
    $('result').hidden = true;
    setHint('Le chemin de l’eau reste affiché. Bouche la brèche, puis relance la marée.');
    refreshHud();
  }

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* refusé */ } }

  // ---------- simulation de la marée ----------
  function updateTide(dt) {
    if (phase === 'tide') {
      tideTime += dt;
      const k = Math.min(1, tideTime / RISE);
      seaLevel = lv.tideMax * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      flowAcc += dt * FLOW;
      while (flowAcc >= 1) {
        flowAcc -= 1;
        const gained = Sim.stepWater(lv, wall, water, seaLevel);
        quietTime = gained ? 0 : quietTime + 1 / FLOW;
        const hit = Sim.floodedCastle(lv, water);
        if (hit) { lose(hit); return; }
      }
      if (tideTime >= RISE + HOLD_MIN && quietTime > 0.5) win();
    } else if (phase === 'won' || phase === 'lost') {
      // la mer redescend doucement après une victoire ; elle reste haute après une défaite
      if (phase === 'won') {
        seaLevel = Math.max(0, seaLevel - dt * 1.2);
        flowAcc += dt * FLOW;
        while (flowAcc >= 1) { flowAcc -= 1; Sim.stepWater(lv, wall, water, seaLevel); }
      }
    }
  }

  function lose(hit) {
    phase = 'lost';
    lostCastle = hit.castle;
    lostPath = Sim.pathTo(lv, water, hit.cell);
    lostAt = performance.now();
    buzz([40, 60, 40]);
    setHint('La mer est passée par là.');
    refreshHud();
    setTimeout(() => showResult(false), reduceMotion ? 300 : 1300);
  }

  function win() {
    phase = 'won';
    wonAt = performance.now();
    buzz(30);
    const used = lv.bucket - left;
    const stars = used <= lv.par ? 3 : used <= lv.par * STAR2 ? 2 : 1;
    if (stars > (progress[lv.id] || 0)) { progress[lv.id] = stars; saveProgress(); }
    setHint(lv.castles.length > 1 ? 'Les châteaux ont tenu !' : 'Le château a tenu !');
    refreshHud();
    setTimeout(() => showResult(true, stars, used), reduceMotion ? 300 : 1100);
  }

  function showResult(won, stars, used) {
    const actions = $('result-actions');
    actions.innerHTML = '';
    if (won) {
      $('result-title').textContent = stars === 3 ? 'Parfait !' : (lv.castles.length > 1 ? 'Châteaux sauvés !' : 'Château sauvé !');
      $('result-stars').hidden = false;
      $('result-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
      $('result-text').textContent = stars === 3
        ? `${used} sable utilisé. Digue construite au plus juste.`
        : `${used} sable utilisé. Pour 3 étoiles, fais aussi bien avec ${lv.par} au plus.`;
      addButton(actions, 'Rejouer', 'ghost', () => startLevel(levelIdx));
      if (levelIdx < LEVELS.length - 1) addButton(actions, 'Niveau suivant', 'primary', () => startLevel(levelIdx + 1));
      else addButton(actions, 'Tous les niveaux', 'primary', openMenu);
    } else {
      $('result-title').textContent = 'La mer est passée';
      $('result-stars').hidden = true;
      $('result-text').textContent = 'Les pointillés montrent le chemin de l’eau. Tes murs restent en place : bouche la brèche.';
      addButton(actions, 'Tout effacer', 'ghost', () => { repair(); clearAll(); lostPath = null; setHint(lv.hint); });
      addButton(actions, 'Réparer', 'primary', repair);
    }
    $('result').hidden = false;
    actions.querySelector('.primary').focus({ preventScroll: true });
  }

  function addButton(parent, label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', fn);
    parent.appendChild(b);
  }

  function openMenu() {
    const list = $('levels');
    list.innerHTML = '';
    LEVELS.forEach((def, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (i === levelIdx) b.className = 'current';
      const st = progress[def.id] || 0;
      b.innerHTML = `<span class="num">${i + 1}</span><span class="nm"></span><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
      b.querySelector('.nm').textContent = def.name;
      b.addEventListener('click', () => { $('menu').hidden = true; startLevel(i); });
      list.appendChild(b);
    });
    $('menu').hidden = false;
  }

  // ---------- géométrie ----------
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  let img = null;
  const view = { cs: 6, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  function layout() {
    const box = $('board').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    view.w = box.width; view.h = box.height; view.dpr = dpr;
    if (!lv) return;
    view.cs = Math.min(box.width / lv.cols, box.height / lv.rows);
    view.ox = (box.width - view.cs * lv.cols) / 2;
    view.oy = (box.height - view.cs * lv.rows) / 2;
    if (off.width !== lv.cols * K || off.height !== lv.rows * K) {
      off.width = lv.cols * K; off.height = lv.rows * K;
      img = offCtx.createImageData(off.width, off.height);
    }
  }

  const toCell = (p) => [(p.x - view.ox) / view.cs, (p.y - view.oy) / view.cs];
  const toScreen = (cx, cy) => ({ x: view.ox + cx * view.cs, y: view.oy + cy * view.cs });

  // ---------- rendu de la plage (pixel par pixel, en basse résolution puis agrandi) ----------
  let G = null, SH = null;
  function computeFields() {
    const n = lv.cols * lv.rows;
    if (!G || G.length !== n) { G = new Float32Array(n); SH = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const target = wall[i] ? 1 : 0;
      wallVis[i] += (target - wallVis[i]) * 0.35;
      wetVis[i] += (water.wet[i] - wetVis[i]) * 0.3;
      G[i] = lv.terrain[i] + wallVis[i] * Sim.WALL_H;
    }
    const { cols, rows } = lv;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const gx = G[y * cols + Math.min(cols - 1, x + 1)] - G[y * cols + Math.max(0, x - 1)];
        const gy = G[Math.min(rows - 1, y + 1) * cols + x] - G[Math.max(0, y - 1) * cols + x];
        SH[i] = Math.max(0.62, Math.min(1.3, 1 + (gx * 0.8 + gy * 1.0) * 0.16));
      }
    }
  }

  // Couleur du sol selon sa hauteur par rapport à la marée haute :
  // sable sous la ligne (la mer peut y aller), dune herbue au-dessus (à l'abri).
  function groundRGB(rel, grass, out) {
    if (rel < 0) {
      const k = Math.max(0, Math.min(1, (rel + 3) / 3)); // de « très bas » à « juste sous la ligne »
      out[0] = 196 + 40 * k; out[1] = 160 + 48 * k; out[2] = 104 + 50 * k;
    } else {
      const k = Math.min(1, rel / 2);
      out[0] = 226 - 22 * k; out[1] = 224 - 6 * k; out[2] = 170 - 12 * k;
      if (grass) { out[0] = 150; out[1] = 172; out[2] = 96; }
    }
  }

  function hash(x, y) {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  function renderBeach(time) {
    computeFields();
    const { cols, rows } = lv;
    const W = cols * K, H = rows * K;
    const d = img.data;
    const rgb = [0, 0, 0];
    const t = reduceMotion ? 0 : time / 1000;
    const lap = phase === 'build' ? 0.5 + 0.5 * Math.sin(t * 1.6) : 0.5;
    const level = Math.max(seaLevel, 0.05);
    for (let py = 0; py < H; py++) {
      const fy = (py + 0.5) / K - 0.5;
      const y0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
      const y1 = Math.min(rows - 1, y0 + 1);
      const ty = Math.max(0, Math.min(1, fy - y0));
      for (let px = 0; px < W; px++) {
        const fx = (px + 0.5) / K - 0.5;
        const x0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
        const x1 = Math.min(cols - 1, x0 + 1);
        const tx = Math.max(0, Math.min(1, fx - x0));
        const a = y0 * cols + x0, b = y0 * cols + x1, c = y1 * cols + x0, e = y1 * cols + x1;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const g = G[a] * w00 + G[b] * w10 + G[c] * w01 + G[e] * w11;
        const sh = SH[a] * w00 + SH[b] * w10 + SH[c] * w01 + SH[e] * w11;
        const wv = wetVis[a] * w00 + wetVis[b] * w10 + wetVis[c] * w01 + wetVis[e] * w11;
        const wl = wallVis[a] * w00 + wallVis[b] * w10 + wallVis[c] * w01 + wallVis[e] * w11;
        const ci = Math.round(fy) * cols + Math.round(fx);
        let r, gr, bl;
        if (lv.rock[Math.max(0, Math.min(cols * rows - 1, ci))] && wl < 0.5) {
          const nz = ((px * 7 + py * 13) % 5) * 3;
          r = 126 + nz; gr = 134 + nz; bl = 132 + nz;
        } else {
          const rel = g - wl * Sim.WALL_H - lv.tideMax;
          const n = hash(px, py);
          groundRGB(rel, rel > 0.25 && n < 0.07 && wl < 0.3, rgb);
          r = rgb[0]; gr = rgb[1]; bl = rgb[2];
          if (wl > 0.01) { // sable tassé du mur, plus chaud et plus clair
            r += (244 - r) * wl * 0.75; gr += (206 - gr) * wl * 0.75; bl += (136 - bl) * wl * 0.75;
          }
          const grain = (n - 0.5) * 10;
          r += grain; gr += grain; bl += grain;
        }
        r *= sh; gr *= sh; bl *= sh;
        if (wv > 0.02) {
          const depth = Math.max(0, level - g);
          const k = Math.min(1, depth / 2.6);
          const wr = 88 + (14 - 88) * k, wg = 196 + (98 - 196) * k, wb = 192 + (118 - 192) * k;
          const ripple = Math.sin(px * 0.21 + t * 1.8 + Math.sin(py * 0.13 + t * 0.9) * 2) * 8;
          const alpha = Math.min(0.93, 0.5 + depth * 0.22) * Math.min(1, wv * 1.4);
          r += (wr + ripple - r) * alpha; gr += (wg + ripple - gr) * alpha; bl += (wb + ripple - bl) * alpha;
          const edge = 1 - Math.abs(wv - 0.5) * 2;
          if (edge > 0) {
            const foam = edge * (0.55 + 0.35 * lap);
            r += (250 - r) * foam; gr += (252 - gr) * foam; bl += (248 - bl) * foam;
          }
        }
        const o = (py * W + px) * 4;
        d[o] = r; d[o + 1] = gr; d[o + 2] = bl; d[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
  }

  // ---------- dessin d'une image ----------
  let lastTime = 0;
  function frame(time) {
    const dt = Math.min(0.05, (time - (lastTime || time)) / 1000);
    lastTime = time;
    updateTide(dt);
    renderBeach(time);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b5466';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, view.ox, view.oy, lv.cols * view.cs, lv.rows * view.cs);

    if (phase === 'build') drawContour(time);
    drawGuide(time);
    lv.castles.forEach((c, k) => drawCastle(c, k, time));
    if (lostPath) drawPath(time);
    drawParticles(time);
    if (finger && phase === 'build') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(finger.x, finger.y, view.cs * Sim.BRUSH_R * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  function drawContour(time) {
    const pulse = reduceMotion ? 0.8 : 0.65 + 0.25 * Math.sin(time / 500);
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse + 0.1})`;
    const r = Math.max(1.2, view.cs * 0.2);
    for (let k = 0; k < contour.length; k += 2) {
      const p = toScreen(contour[k][0], contour[k][1]);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Tutoriel du premier niveau : un doigt fantôme montre le geste tant que rien n'est dessiné.
  function drawGuide(time) {
    if (!lv.guide || strokes.length || current || phase !== 'build') return;
    const [a, b] = lv.guide.map(([x, y]) => toScreen(x, y));
    ctx.setLineDash([view.cs * 1.2, view.cs * 0.9]);
    ctx.strokeStyle = 'rgba(255, 244, 207, 0.9)';
    ctx.lineWidth = view.cs * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    const k = reduceMotion ? 0.5 : ((time / 1600) % 1.3) / 1.3 * 1.3;
    const kk = Math.min(1, k);
    const x = a.x + (b.x - a.x) * kk, y = a.y + (b.y - a.y) * kk;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath(); ctx.arc(x, y + view.cs * 0.2, view.cs * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(16, 50, 58, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCastle(c, k, time) {
    const p = toScreen(c.x, c.y);
    const s = view.cs * 7.6;
    const t = reduceMotion ? 0 : time / 1000;
    const drowned = phase === 'lost' && k === lostCastle;
    const sink = drowned ? Math.min(1, (performance.now() - lostAt) / 900) : 0;
    const jump = phase === 'won' && !reduceMotion ? Math.abs(Math.sin((performance.now() - wonAt) / 180)) * Math.max(0, 1 - (performance.now() - wonAt) / 1200) * s * 0.08 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + s * 0.18 * sink - jump);
    ctx.globalAlpha = 1 - sink * 0.45;
    // ombre
    ctx.fillStyle = 'rgba(60, 40, 15, 0.25)';
    ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.3, s * 0.5, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    const body = '#ecc98a', dark = '#b98a4c', light = '#f7e1b0';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.strokeStyle = dark;
    const block = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); };
    const crenel = (x, y, w, n) => {
      const cw = w / (n * 2 - 1);
      for (let j = 0; j < n; j++) block(x + j * cw * 2, y - cw, cw, cw, body);
    };
    // tours
    block(-s * 0.46, -s * 0.18, s * 0.22, s * 0.46, body);
    crenel(-s * 0.46, -s * 0.18, s * 0.22, 2);
    block(s * 0.24, -s * 0.18, s * 0.22, s * 0.46, body);
    crenel(s * 0.24, -s * 0.18, s * 0.22, 2);
    // mur
    block(-s * 0.26, -s * 0.02, s * 0.52, s * 0.3, body);
    crenel(-s * 0.26, -s * 0.02, s * 0.52, 4);
    // donjon
    block(-s * 0.14, -s * 0.32, s * 0.28, s * 0.6, light);
    crenel(-s * 0.14, -s * 0.32, s * 0.28, 2);
    ctx.fillStyle = '#7a5530';
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, s * 0.28); ctx.lineTo(-s * 0.06, s * 0.16);
    ctx.arc(0, s * 0.16, s * 0.06, Math.PI, 0); ctx.lineTo(s * 0.06, s * 0.28); ctx.closePath(); ctx.fill();
    // drapeau
    const poleTop = -s * 0.78;
    ctx.strokeStyle = '#5b4630';
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(0, poleTop); ctx.stroke();
    const wave = drowned ? 0 : Math.sin(t * 5) * s * 0.03;
    const droop = drowned ? s * 0.18 : 0;
    ctx.fillStyle = '#e2463a';
    ctx.beginPath();
    ctx.moveTo(0, poleTop);
    ctx.quadraticCurveTo(s * 0.16, poleTop + s * 0.02 + wave + droop * 0.5, s * 0.32 - droop, poleTop + s * 0.09 + wave + droop);
    ctx.quadraticCurveTo(s * 0.16, poleTop + s * 0.16 - wave + droop * 0.5, 0, poleTop + s * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Défaite : on montre le chemin exact pris par l'eau, de la mer jusqu'au château.
  function drawPath(time) {
    const pts = [];
    for (let k = 0; k < lostPath.length; k += 2) {
      const i = lostPath[k];
      pts.push(toScreen((i % lv.cols) + 0.5, Math.floor(i / lv.cols) + 0.5));
    }
    if (pts.length < 2) return;
    const shown = phase === 'lost' && !reduceMotion ? Math.min(pts.length, Math.floor((performance.now() - lostAt) / 12)) : pts.length;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16, 50, 58, 0.45)';
    ctx.lineWidth = view.cs * 1.4;
    ctx.beginPath(); pts.slice(0, shown).forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.setLineDash([view.cs * 0.9, view.cs * 1.1]);
    ctx.lineDashOffset = reduceMotion ? 0 : -time / 40;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = view.cs * 0.7;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- grains de sable ----------
  function spawnGrains(cx, cy, count) {
    if (reduceMotion) return;
    const p = toScreen(cx, cy);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, born: performance.now(), life: 350 + Math.random() * 250 });
    }
  }
  function drawParticles(now) {
    particles = particles.filter((q) => now - q.born < q.life);
    for (const q of particles) {
      const s = (now - q.born) / 1000;
      const k = 1 - (now - q.born) / q.life;
      ctx.fillStyle = `rgba(222, 184, 120, ${k})`;
      ctx.fillRect(q.x + q.vx * s, q.y + q.vy * s + 120 * s * s, 2.5, 2.5);
    }
  }

  // ---------- gestes ----------
  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  let lastBuzz = 0;
  function paintTo(cell) {
    if (left <= 0) {
      const b = $('bucket');
      b.classList.remove('empty'); void b.offsetWidth; b.classList.add('empty');
      setHint('Plus de sable ! Annule un trait pour en récupérer.', true);
      return;
    }
    const built = Sim.paint(lv, wall, water, lastPoint || cell, cell, left);
    lastPoint = cell;
    if (!built.length) return;
    current.push(...built);
    left -= built.length;
    spawnGrains(cell[0], cell[1], Math.min(6, built.length + 1));
    const now = performance.now();
    if (now - lastBuzz > 70) { buzz(4); lastBuzz = now; }
    refreshHud();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'build' || !$('menu').hidden) return;
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    finger = p;
    current = [];
    lastPoint = null;
    const cell = toCell(p);
    const ci = Math.floor(cell[1]) * lv.cols + Math.floor(cell[0]);
    if (lv.castleCell[ci]) setHint('Trace ton mur autour du château, pas dessus.', true);
    else if (water.wet[ci]) setHint('Impossible de construire dans l’eau : trace sur le sable.', true);
    paintTo(cell);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = localPoint(e);
    finger = p;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) paintTo(toCell(localPoint(ev)));
  });
  function endStroke() {
    if (current && current.length) strokes.push(current);
    current = null; finger = null; lastPoint = null;
    refreshHud();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  $('btn-undo').addEventListener('click', undoStroke);
  $('btn-clear').addEventListener('click', () => { clearAll(); setHint(lv.hint); });
  $('btn-tide').addEventListener('click', launchTide);
  $('btn-menu').addEventListener('click', openMenu);
  $('btn-close-menu').addEventListener('click', () => { $('menu').hidden = true; });
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('board'));

  // Accès pour les tests automatisés (tools/smoke.js).
  window.MareeHaute = {
    get level() { return lv; },
    get phase() { return phase; },
    get left() { return left; },
    cellToClient(cx, cy) {
      const r = canvas.getBoundingClientRect();
      const p = toScreen(cx, cy);
      return { x: r.left + p.x, y: r.top + p.y };
    },
    startLevel: (i) => startLevel(i),
  };

  // ---------- démarrage (avec reprise si la page est mise à jour pendant une partie) ----------
  function start(data) {
    const ok = data && data.levelIdx !== undefined && LEVELS[data.levelIdx];
    if (ok) startLevel(data.levelIdx, data.strokes);
    else {
      const i = LEVELS.findIndex((d) => !progress[d.id]);
      startLevel(i < 0 ? 0 : i);
    }
    requestAnimationFrame(frame);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ levelIdx, strokes }));
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
