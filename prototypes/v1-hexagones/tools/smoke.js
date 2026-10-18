#!/usr/bin/env node
// Test de fumée dans Chromium : joue le niveau 1 au doigt (glisser) et vérifie la victoire,
// puis vérifie qu'une mauvaise première action perd le niveau 2.
// Usage : NODE_PATH=$(npm root -g) node tools/smoke.js [dossier-captures]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const shots = process.argv[2];
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: path.join(shots, '1-depart.png') });

  const canvasBox = await page.locator('#canvas').boundingBox();
  async function dragCell(from, to) {
    const a = await page.evaluate((i) => window.MareeHaute.cellPoint(i), from);
    const b = await page.evaluate((i) => window.MareeHaute.cellPoint(i), to);
    await page.mouse.move(canvasBox.x + a.x, canvasBox.y + a.y);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + (a.x + b.x) / 2, canvasBox.y + (a.y + b.y) / 2 - 20, { steps: 4 });
    if (shots && from === -99) await page.screenshot({ path: path.join(shots, 'drag.png') });
    await page.mouse.move(canvasBox.x + b.x, canvasBox.y + b.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  async function wait(n) {
    for (let k = 0; k < n; k++) { await page.click('#btn-wait'); await page.waitForTimeout(60); }
  }
  const cells = await page.evaluate(() => window.MareeHaute.level.cells.map((c) => ({ q: c.q, r: c.r, flag: c.flag })));
  const flag = cells.findIndex((c) => c.flag);
  const others = cells.map((_, i) => i).filter((i) => i !== flag);

  // Niveau 1 : deux pelletées sur le drapeau, puis on laisse monter la mer.
  await dragCell(others[0], flag);
  await dragCell(others[1], flag);
  if (shots) await page.screenshot({ path: path.join(shots, '2-apres-deux-coups.png') });
  let h = await page.evaluate((f) => window.MareeHaute.state.h[f], flag);
  if (h !== 3) throw new Error(`drapeau à ${h}, attendu 3`);
  await wait(1);
  await page.waitForTimeout(1200);
  if (shots) await page.screenshot({ path: path.join(shots, '3-maree-1.png') });
  await wait(3);
  await page.waitForTimeout(1500);
  const won = await page.isVisible('#end') && (await page.textContent('#end-title'));
  if (shots) await page.screenshot({ path: path.join(shots, '4-victoire.png') });
  if (!won || !/Parfait|sauvé/.test(won)) throw new Error('pas de victoire au niveau 1 : ' + won);

  // Niveau 2 : creuser la case voisine du drapeau en premier coupe le chemin.
  await page.click('#end-actions .primary');
  await page.waitForTimeout(300);
  const l2 = await page.evaluate(() => window.MareeHaute.level.cells.map((c) => ({ q: c.q, flag: c.flag })));
  const f2 = l2.findIndex((c) => c.flag);
  const near = l2.findIndex((c) => !c.flag && Math.abs(c.q - l2[f2].q) === 1);
  await dragCell(near, f2);
  if (shots) await page.screenshot({ path: path.join(shots, '5-sentier-coupe.png') });
  const reachable = await page.evaluate(() => {
    const { level, state } = window.MareeHaute;
    return window.Rules.legalMoves(level, state).some(([, j]) => level.cells[j].flag);
  });
  if (reachable) throw new Error('le sentier devrait être coupé');

  await page.evaluate(() => window.MareeHaute.startLevel(6));
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: path.join(shots, '6-cuvette.png') });
  await page.evaluate(() => window.MareeHaute.startLevel(9));
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: path.join(shots, '7-port.png') });
  await page.click('#btn-menu');
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: path.join(shots, '8-menu.png') });

  await browser.close();
  if (errors.length) throw new Error('erreurs JS : ' + errors.join(' | '));
  console.log('OK : niveau 1 gagné au glisser, sentier coupé au niveau 2, aucune erreur JS');
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
