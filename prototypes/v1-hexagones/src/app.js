// Interface : rendu de l'île sur canvas, gestes, marée, écrans de fin et choix des niveaux.
(function () {
  'use strict';
  const R = window.Rules;
  const LEVELS = window.LEVELS;
  const $ = (id) => document.getElementById(id);

  const TILT = 0.8;         // écrasement vertical de la vue
  const LIFT = 0.3;         // hauteur d'un niveau de sable, en taille d'hexagone
  const ROCK_VISUAL = 3.4;  // hauteur affichée d'un rocher
  const SQRT3 = Math.sqrt(3);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = {
    seaDeep: '#0b5466', sea: '#13798c', shallow: '#2fa3a8', foam: '#eef8f4',
    sandTop: '#f0d7a1', sandTopHigh: '#f6e3b8', sandDamp: '#cfae73', sandSide: '#c99d5e', sandSideDark: '#a87c45',
    pit: '#b3905a', rockTop: '#8d9a98', rockSide: '#66726f', rockSideDark: '#525c5a',
    ink: '#10323a', flag: '#e2463a', pole: '#5b4630', select: '#ffffff', target: '#fff4cf',
  };

  // ---------- état ----------
  let levelIdx = 0;
  let level = null;
  let history = [];          // pile des états, le dernier est l'état courant
  let usedUndo = false;
  let selected = -1;
  let targets = [];
  let drag = null;           // { x, y } position du doigt pendant un glisser
  let pointerStart = null;
  let shownTide = 0;         // marée affichée (animée)
  let grains = [];           // grains de sable en vol
  let endShown = false;
  let progress = loadProgress();

  const state = () => history[history.length - 1];

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem('maree-haute.progress') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem('maree-haute.progress', JSON.stringify(progress)); } catch (e) { /* stockage indisponible */ }
  }

  function startLevel(idx, snapshot) {
    levelIdx = idx;
    level = R.parseLevel(LEVELS[idx]);
    history = snapshot && snapshot.history ? snapshot.history : [R.initialState(level)];
    usedUndo = snapshot ? !!snapshot.usedUndo : false;
    selected = -1; targets = []; drag = null; grains = [];
    shownTide = state().tide;
    endShown = false;
    $('end').hidden = true;
    $('level-num').textContent = `Niveau ${idx + 1} sur ${LEVELS.length}`;
    $('level-name').textContent = level.name;
    $('hint').textContent = level.hint;
    layout();
    refreshHud();
  }

  // ---------- actions ----------
  function act(move) {
    if (R.status(level, state()).over) return;
    const before = state();
    const next = R.play(level, before, move);
    history.push(next);
    if (move) launchGrain(move[0], move[1]);
    try { if (navigator.vibrate) navigator.vibrate(move ? 12 : 6); } catch (e) { /* refusé */ }
    selected = -1; targets = [];
    refreshHud();
    const st = R.status(level, next);
    if (st.over) setTimeout(() => showEnd(st), next.tide !== before.tide ? 900 : 400);
  }

  function undo() {
    if (history.length <= 1) return;
    history.pop();
    usedUndo = true;
    selected = -1; targets = [];
    endShown = false;
    $('end').hidden = true;
    shownTide = Math.min(shownTide, state().tide + 0.0001);
    refreshHud();
  }

  function restart() { startLevel(levelIdx); }

  // ---------- affichage du haut ----------
  function refreshHud() {
    const s = state();
    const gauge = $('gauge');
    gauge.querySelectorAll('.step').forEach((n) => n.remove());
    for (let t = 0; t <= level.tideMax; t++) {
      const el = document.createElement('span');
      el.className = 'step' + (t <= s.tide ? ' on' : '') + (t === level.tideMax ? ' max' : '');
      el.textContent = t === level.tideMax ? `${t} haute` : String(t);
      gauge.appendChild(el);
    }
    const dots = $('dots');
    dots.innerHTML = '';
    const over = R.status(level, s).over;
    const left = level.tideEvery - s.actions;
    if (over) {
      $('next-text').textContent = 'Marée haute';
    } else {
      $('next-text').textContent = left === 1 ? 'La mer monte au prochain coup' : `La mer monte dans ${left} coups`;
      for (let i = 0; i < level.tideEvery; i++) {
        const d = document.createElement('span');
        d.className = 'dot' + (i < s.actions ? ' used' : '');
        dots.appendChild(d);
      }
    }
    $('btn-undo').disabled = history.length <= 1;
    $('btn-wait').disabled = over;
  }

  // ---------- écran de fin ----------
  function showEnd(st) {
    if (endShown || !R.status(level, state()).over) return;
    endShown = true;
    const checks = $('end-checks');
    const actions = $('end-actions');
    checks.innerHTML = ''; actions.innerHTML = '';
    if (st.won) {
      const items = [
        [true, level.cells.filter((c) => c.flag).length > 1 ? 'Drapeaux sauvés' : 'Drapeau sauvé'],
        [!usedUndo, 'Sans annuler'],
        [st.dry >= level.best, `${st.dry} case${st.dry > 1 ? 's' : ''} au sec sur ${level.best} possible${level.best > 1 ? 's' : ''}`],
      ];
      const stars = items.filter((i) => i[0]).length;
      const prev = progress[level.id] || 0;
      if (stars > prev) { progress[level.id] = stars; saveProgress(); }
      $('end-title').textContent = stars === 3 ? 'Parfait !' : (level.cells.filter((c) => c.flag).length > 1 ? 'Drapeaux sauvés !' : 'Drapeau sauvé !');
      $('end-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
      $('end-stars').hidden = false;
      items.forEach(([ok, label]) => {
        const li = document.createElement('li');
        li.className = ok ? 'ok' : 'ko';
        li.innerHTML = `<span class="mark">${ok ? '✓' : '·'}</span><span></span>`;
        li.lastChild.textContent = label;
        checks.appendChild(li);
      });
      $('end-text').textContent = '';
      addButton(actions, 'Rejouer', 'ghost', restart);
      if (levelIdx < LEVELS.length - 1) addButton(actions, 'Niveau suivant', 'primary', () => startLevel(levelIdx + 1));
      else addButton(actions, 'Tous les niveaux', 'primary', openMenu);
    } else {
      $('end-title').textContent = 'Le drapeau est sous l’eau';
      $('end-stars').hidden = true;
      $('end-text').textContent = 'La mer a trouvé un passage jusqu’au drapeau. Annule ton dernier coup ou recommence le niveau.';
      addButton(actions, 'Annuler le coup', 'ghost', undo);
      addButton(actions, 'Recommencer', 'primary', restart);
    }
    $('end').hidden = false;
    actions.querySelector('.primary').focus();
  }

  function addButton(parent, label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', fn);
    parent.appendChild(b);
  }

  // ---------- menu des niveaux ----------
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
    $('end').hidden = true;
    $('menu').hidden = false;
  }

  // ---------- géométrie ----------
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let view = { s: 40, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  function layout() {
    const box = $('board').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    view.w = box.width; view.h = box.height; view.dpr = dpr;
    if (!level) return;
    const maxH = Math.max(level.tideMax + 2, ...level.cells.filter((c) => !c.rock).map((c) => c.h + 1));
    const hasRock = level.cells.some((c) => c.rock);
    const top = Math.max(maxH, hasRock ? ROCK_VISUAL : 0) * LIFT + 0.9; // + place pour le drapeau
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    level.cells.forEach((c) => {
      const x = SQRT3 * (c.q + c.r / 2), y = 1.5 * c.r * TILT;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const wUnits = (maxX - minX) + SQRT3 + 0.6;
    const hUnits = (maxY - minY) + 2 * TILT + top + 0.4;
    const s = Math.min(view.w / wUnits, view.h / hUnits, 70);
    view.s = s;
    view.ox = view.w / 2 - s * (minX + maxX) / 2;
    view.oy = view.h / 2 - s * (minY + maxY) / 2 + s * (top - 0.4) / 2;
  }

  function center(c) {
    return { x: view.ox + view.s * SQRT3 * (c.q + c.r / 2), y: view.oy + view.s * 1.5 * c.r * TILT };
  }

  // Sommets d'un hexagone « pointe en haut » vu en perspective, à la hauteur lift (en niveaux).
  function hexPoints(cx, cy, lift, scale = 1) {
    const s = view.s * scale;
    const y0 = cy - lift * LIFT * view.s;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 90);
      pts.push([cx + s * Math.cos(a), y0 + s * Math.sin(a) * TILT]);
    }
    return pts; // 0 haut, 1 haut-droit, 2 bas-droit, 3 bas, 4 bas-gauche, 5 haut-gauche
  }

  function pathPoly(pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }

  function visualHeight(c, h) { return c.rock ? ROCK_VISUAL : h; }

  // ---------- dessin ----------
  function draw(time) {
    const s = state();
    // la marée affichée rejoint doucement la vraie
    const target = s.tide;
    if (reduceMotion) shownTide = target;
    else shownTide += (target - shownTide) * 0.08;
    if (Math.abs(target - shownTide) < 0.002) shownTide = target;

    const st = R.status(level, s);
    const wet = st.wet;
    const t = reduceMotion ? 0 : time / 1000;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawSea(t);

    const order = level.cells.map((c, i) => i).sort((a, b) => {
      const ca = level.cells[a], cb = level.cells[b];
      return ca.r - cb.r || (ca.q + ca.r / 2) - (cb.q + cb.r / 2);
    });

    hitShapes = [];
    for (const i of order) drawCell(i, s, wet, t);

    drawGrains(time);
    drawDragLine();
    requestAnimationFrame(draw);
  }

  function drawSea(t) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, COLORS.seaDeep);
    g.addColorStop(1, COLORS.sea);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    // petites vagues
    ctx.strokeStyle = 'rgba(238, 248, 244, 0.10)';
    ctx.lineWidth = 2;
    const gap = Math.max(26, view.s * 0.9);
    for (let y = gap / 2; y < view.h; y += gap) {
      ctx.beginPath();
      for (let x = -20; x <= view.w + 20; x += 8) {
        const yy = y + Math.sin(x / 38 + t * 1.3 + y) * 3;
        x === -20 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  let hitShapes = []; // { i, poly } dans l'ordre de dessin

  function drawCell(i, s, wet, t) {
    const c = level.cells[i];
    const h = s.h[i];
    const { x, y } = center(c);
    const base = shownTide;
    const vh = visualHeight(c, h);
    const underWater = wet[i] && shownTide >= h - 0.001;
    const isTarget = targets.includes(i);

    if (underWater) {
      // sable sous l'eau : on devine la case, plus sombre quand elle est profonde
      const top = hexPoints(x, y, base);
      const depth = Math.max(0, shownTide - h);
      pathPoly(hexPoints(x, y, base, 0.94));
      ctx.fillStyle = depth < 0.5 ? 'rgba(120, 205, 200, 0.55)' : depth < 1.5 ? 'rgba(70, 170, 175, 0.45)' : 'rgba(40, 130, 145, 0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(238, 248, 244, ' + (0.25 + 0.1 * Math.sin(t * 2 + i)) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      label(x, top, String(h), 'rgba(238, 248, 244, 0.85)', 0.34);
      hitShapes.push({ i, poly: top });
      return;
    }

    const pitDry = !c.rock && h <= shownTide; // cuvette au sec, sous le niveau de la mer
    const bottom = pitDry ? h : base;
    const topLift = pitDry ? h : Math.max(vh, base);
    const top = hexPoints(x, y, topLift);
    const bot = hexPoints(x, y, bottom);

    // côtés visibles : bas-gauche, bas, bas-droit
    if (topLift > bottom + 0.001) {
      const sides = [[4, 3, c.rock ? COLORS.rockSideDark : COLORS.sandSideDark], [3, 2, c.rock ? COLORS.rockSide : COLORS.sandSide]];
      sides.push([5, 4, c.rock ? COLORS.rockSideDark : COLORS.sandSideDark]);
      sides.push([2, 1, c.rock ? COLORS.rockSide : COLORS.sandSide]);
      for (const [a, b, col] of sides) {
        pathPoly([top[a], top[b], bot[b], bot[a]]);
        ctx.fillStyle = col;
        ctx.fill();
      }
      // strates de sable
      if (!c.rock) {
        ctx.strokeStyle = 'rgba(90, 60, 25, 0.18)';
        ctx.lineWidth = 1;
        for (let k = Math.ceil(bottom + 0.01); k < topLift - 0.01; k++) {
          const p = hexPoints(x, y, k);
          ctx.beginPath();
          ctx.moveTo(p[5][0], p[5][1]); ctx.lineTo(p[4][0], p[4][1]); ctx.lineTo(p[3][0], p[3][1]);
          ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[1][0], p[1][1]);
          ctx.stroke();
        }
      }
      // écume au pied de la case
      if (!pitDry) {
        ctx.strokeStyle = 'rgba(238, 248, 244, ' + (0.55 + 0.25 * Math.sin(t * 2.2 + i * 1.7)) + ')';
        ctx.lineWidth = Math.max(2, view.s * 0.06);
        ctx.beginPath();
        ctx.moveTo(bot[5][0], bot[5][1]); ctx.lineTo(bot[4][0], bot[4][1]); ctx.lineTo(bot[3][0], bot[3][1]);
        ctx.lineTo(bot[2][0], bot[2][1]); ctx.lineTo(bot[1][0], bot[1][1]);
        ctx.stroke();
      }
    }

    // dessus
    pathPoly(top);
    if (c.rock) ctx.fillStyle = COLORS.rockTop;
    else if (pitDry) ctx.fillStyle = COLORS.pit;
    else if (h <= s.tide + 1) ctx.fillStyle = COLORS.sandDamp;      // sera noyée à la prochaine marée si l'eau l'atteint
    else if (h >= s.tide + 3) ctx.fillStyle = COLORS.sandTopHigh;
    else ctx.fillStyle = COLORS.sandTop;
    ctx.fill();
    ctx.strokeStyle = c.rock ? 'rgba(40, 50, 50, 0.35)' : 'rgba(120, 85, 40, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (i === selected) {
      pathPoly(hexPoints(x, y, topLift, 0.9));
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = Math.max(3, view.s * 0.09);
      ctx.stroke();
    } else if (isTarget) {
      pathPoly(hexPoints(x, y, topLift, 0.82));
      ctx.setLineDash([view.s * 0.16, view.s * 0.12]);
      ctx.strokeStyle = COLORS.target;
      ctx.lineWidth = Math.max(2, view.s * 0.06);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (c.flag) drawFlag(x, top, t);
    if (!c.rock) label(c.flag ? x - view.s * 0.36 : x, top, String(h), COLORS.ink, c.flag ? 0.3 : 0.4, c.flag ? -0.22 : 0);

    hitShapes.push({ i, poly: topLift > bottom ? [top[5], top[0], top[1], bot[2], bot[3], bot[4]] : top });
  }

  function label(x, top, text, color, size, dy = 0) {
    const cy = (top[0][1] + top[3][1]) / 2 + dy * view.s * TILT;
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(view.s * size)}px 'Atkinson Hyperlegible', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, cy + 1);
  }

  function drawFlag(x, top, t) {
    const cy = (top[0][1] + top[3][1]) / 2;
    const s = view.s;
    const px = x + s * 0.12, py = cy + s * 0.08;
    const poleTop = py - s * 0.95;
    ctx.strokeStyle = COLORS.pole;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, poleTop); ctx.stroke();
    const wave = Math.sin(t * 4) * s * 0.05;
    ctx.fillStyle = COLORS.flag;
    ctx.beginPath();
    ctx.moveTo(px, poleTop);
    ctx.quadraticCurveTo(px + s * 0.28, poleTop + s * 0.05 + wave, px + s * 0.55, poleTop + s * 0.17 + wave);
    ctx.quadraticCurveTo(px + s * 0.28, poleTop + s * 0.3 - wave, px, poleTop + s * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(16, 50, 58, 0.18)';
    ctx.beginPath(); ctx.ellipse(px, py, s * 0.12, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  }

  function topCenter(i) {
    const c = level.cells[i];
    const s = state();
    const { x, y } = center(c);
    const wet = R.computeWet(level, s.h, s.tide)[i];
    const lift = wet ? shownTide : (s.h[i] <= shownTide ? s.h[i] : Math.max(visualHeight(c, s.h[i]), shownTide));
    return { x, y: y - lift * LIFT * view.s };
  }

  function drawDragLine() {
    if (selected < 0 || !drag) return;
    const a = topCenter(selected);
    ctx.strokeStyle = 'rgba(255, 244, 207, 0.85)';
    ctx.lineWidth = Math.max(3, view.s * 0.08);
    ctx.setLineDash([2, view.s * 0.18]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + drag.x) / 2, my = Math.min(a.y, drag.y) - view.s * 0.8;
    ctx.quadraticCurveTo(mx, my, drag.x, drag.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.sandTop;
    ctx.beginPath(); ctx.arc(drag.x, drag.y, view.s * 0.16, 0, Math.PI * 2); ctx.fill();
  }

  function launchGrain(from, to) {
    const a = topCenter(from), b = topCenter(to);
    grains.push({ a, b, start: performance.now(), dur: reduceMotion ? 1 : 320 });
  }

  function drawGrains(now) {
    grains = grains.filter((g) => now - g.start < g.dur);
    for (const g of grains) {
      const k = Math.min(1, (now - g.start) / g.dur);
      const x = g.a.x + (g.b.x - g.a.x) * k;
      const arc = Math.sin(Math.PI * k) * view.s * 0.9;
      const y = g.a.y + (g.b.y - g.a.y) * k - arc;
      ctx.fillStyle = COLORS.sandTop;
      ctx.strokeStyle = COLORS.sandSideDark;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, view.s * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // ---------- gestes ----------
  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
  }

  function cellAt(px, py) {
    for (let k = hitShapes.length - 1; k >= 0; k--) {
      if (pointInPoly(px, py, hitShapes[k].poly)) return hitShapes[k].i;
    }
    return -1;
  }

  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function select(i) {
    const s = state();
    const wet = R.computeWet(level, s.h, s.tide);
    if (i >= 0 && R.canTake(level, s, wet, i)) {
      selected = i;
      targets = R.targetsFrom(level, s, wet, i);
      return true;
    }
    selected = -1; targets = [];
    return false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (R.status(level, state()).over) return;
    const p = localPoint(e);
    const i = cellAt(p.x, p.y);
    pointerStart = { ...p, i };
    if (selected >= 0 && targets.includes(i)) { act([selected, i]); pointerStart = null; return; }
    if (i === selected && i >= 0) { drag = p; canvas.setPointerCapture(e.pointerId); return; }
    if (select(i)) { drag = p; canvas.setPointerCapture(e.pointerId); }
    else flashHint(i);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag = localPoint(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const p = localPoint(e);
    const i = cellAt(p.x, p.y);
    drag = null;
    const moved = pointerStart && Math.hypot(p.x - pointerStart.x, p.y - pointerStart.y) > 10;
    if (selected >= 0 && i !== selected && targets.includes(i)) act([selected, i]);
    else if (moved && i !== selected) { selected = -1; targets = []; }
    // sinon : simple toucher, la case reste choisie pour un deuxième toucher sur la destination
  });

  canvas.addEventListener('pointercancel', () => { drag = null; });

  let hintTimer = null;
  function flashHint(i) {
    if (i < 0) return;
    const c = level.cells[i];
    const s = state();
    const wet = R.computeWet(level, s.h, s.tide);
    let msg = '';
    if (c.rock) msg = 'Un rocher : impossible d’y creuser, mais on peut marcher dessus.';
    else if (c.flag) msg = 'On ne creuse pas sous le drapeau. Apporte-lui du sable.';
    else if (wet[i]) msg = 'Cette case est sous l’eau. Choisis d’abord du sable au sec, puis verse-le ici.';
    else if (s.h[i] === 0) msg = 'Il n’y a plus de sable ici.';
    if (!msg) return;
    $('hint').textContent = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('hint').textContent = level.hint; }, 2600);
  }

  // ---------- boutons ----------
  $('btn-undo').addEventListener('click', undo);
  $('btn-wait').addEventListener('click', () => act(null));
  $('btn-restart').addEventListener('click', restart);
  $('btn-menu').addEventListener('click', openMenu);
  $('btn-close-menu').addEventListener('click', () => { $('menu').hidden = true; });
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('board'));

  // ---------- démarrage (avec reprise si la page est mise à jour pendant une partie) ----------
  function start(data) {
    const snap = data && data.levelIdx !== undefined && LEVELS[data.levelIdx] ? data : null;
    startLevel(snap ? snap.levelIdx : firstUnfinished(), snap);
    requestAnimationFrame(draw);
  }
  function firstUnfinished() {
    const i = LEVELS.findIndex((d) => !progress[d.id]);
    return i < 0 ? 0 : i;
  }
  // Accès pour les tests automatisés (tools/smoke.js).
  window.MareeHaute = {
    get level() { return level; },
    get state() { return state(); },
    cellPoint: (i) => topCenter(i),
    startLevel: (i) => startLevel(i),
  };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ levelIdx, history, usedUndo }));
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
