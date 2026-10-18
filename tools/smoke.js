#!/usr/bin/env node
// Test de fumée dans Chromium.
//  1. Niveau 1 : on trace le mur montré par le tutoriel, on lance la marée → victoire.
//  2. Niveau 2 sans mur → défaite, le chemin de l'eau s'affiche, « Réparer » garde les murs.
//  3. Niveau très difficile : la solution calculée, tracée au doigt, tient dans le seau et gagne.
// Usage : NODE_PATH=$(npm root -g) node tools/smoke.js [dossier-captures]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const shots = process.argv[2];
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForTimeout(600);
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name) }); };
  await shot('d1-depart.png');

  async function stroke(points) {
    const pts = [];
    for (const [x, y] of points) pts.push(await page.evaluate(([cx, cy]) => window.MareeHaute.cellToClient(cx, cy), [x, y]));
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (let k = 1; k < pts.length; k++) await page.mouse.move(pts[k].x, pts[k].y, { steps: 12 });
    await page.mouse.up();
  }
  async function waitPhase(want, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const p = await page.evaluate(() => window.MareeHaute.phase);
      if (p === want) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`phase « ${want} » jamais atteinte (actuelle : ${await page.evaluate(() => window.MareeHaute.phase)})`);
  }

  // 1. Niveau 1 : le mur du tutoriel, un peu plus long de chaque côté.
  const guide = await page.evaluate(() => window.MareeHaute.level.guide);
  const [[ax, ay], [bx, by]] = guide;
  await stroke([[ax - 2, ay], [bx + 2, by]]);
  const left1 = await page.evaluate(() => window.MareeHaute.left);
  await shot('d2-mur.png');
  await page.click('#btn-tide');
  await page.waitForTimeout(2500);
  await shot('d3-maree.png');
  await waitPhase('won');
  await page.waitForTimeout(1500);
  await shot('d4-victoire.png');
  const title = await page.textContent('#result-title');
  if (!/sauvé|Parfait/.test(title)) throw new Error('pas d’écran de victoire : ' + title);
  const bucket1 = await page.evaluate(() => window.MareeHaute.level.bucket);
  console.log(`niveau 1 gagné avec ${bucket1 - left1} sable (${title.trim()})`);

  // 2. Niveau 2 sans mur : défaite et chemin de l'eau.
  await page.click('#result-actions .primary');
  await page.waitForTimeout(400);
  await page.click('#btn-tide');
  await waitPhase('lost');
  await page.waitForTimeout(1800);
  await shot('d5-defaite.png');
  await page.click('#result-actions .primary'); // Réparer
  await page.waitForTimeout(600);
  const phase = await page.evaluate(() => window.MareeHaute.phase);
  if (phase !== 'build') throw new Error('« Réparer » devrait revenir à la construction');
  await shot('d6-reparer.png');

  // 3. Niveau très difficile : on trace la solution au doigt, trait par trait, et elle doit tenir dans le seau.
  const { solutionStrokes } = require('./check.js');
  const Sim = require('../src/sim.js');
  const LEVELS = require('../src/levels.js');
  const hardIdx = LEVELS.findIndex((d) => d.hard);
  await page.evaluate((k) => window.MareeHaute.startLevel(k), hardIdx);
  await page.waitForTimeout(300);
  await shot('h1-difficile.png');
  for (const s of solutionStrokes(Sim.buildLevel(LEVELS[hardIdx]))) await stroke(s.length > 1 ? s : [s[0], s[0]]);
  const hardLeft = await page.evaluate(() => window.MareeHaute.left);
  await shot('h2-solution.png');
  const fps = await page.evaluate(() => new Promise((done) => {
    let n = 0; const t0 = performance.now();
    (function tick() { if (++n < 60) requestAnimationFrame(tick); else done(Math.round(60000 / (performance.now() - t0))); })();
  }));
  await page.click('#btn-tide');
  await page.waitForTimeout(3000);
  await shot('h3-maree.png');
  await waitPhase('won', 20000);
  await page.waitForTimeout(1300);
  await shot('h4-victoire.png');
  console.log(`niveau difficile gagné au doigt avec ${LEVELS[hardIdx].bucket - hardLeft} sable sur ${LEVELS[hardIdx].bucket} (≈ ${fps} images/s sans GPU)`);

  for (const i of [2, 3, 4, 5, 6, 7]) {
    await page.evaluate((k) => window.MareeHaute.startLevel(k), i);
    await page.waitForTimeout(250);
    await shot(`n${i + 1}.png`);
  }

  await browser.close();
  if (errors.length) throw new Error('erreurs JS : ' + errors.join(' | '));
  console.log('OK : victoire au niveau 1, défaite expliquée et réparation au niveau 2, niveau très difficile résolu, aucune erreur JS');
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
