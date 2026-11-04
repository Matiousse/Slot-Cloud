/* Filme une page de démo image par image (60 i/s) dans le Chrome de test MUET du studio (chrome.sh <port> <profil>).
     node film-demo.mjs <port-chrome> <url> <dossier-images> <nb-images> <x,y,l,h> "<js de départ>"
   La page expose DEMO.film() (arrête son horloge) et DEMO.pas(ms) (avance d'une image et redessine). */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [, , port, url, dossier, n, zone, depart = ''] = process.argv;
const [x, y, w, h] = zone.split(',').map(Number);
fs.mkdirSync(dossier, { recursive: true });
const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = b.contexts()[0] || await b.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: +(process.env.VW || 1600), height: +(process.env.VH || 900) });
await page.goto(url);
await page.waitForFunction(() => window.DEMO_PRET, null, { timeout: 60000 });
await page.waitForTimeout(300);
await page.evaluate(`DEMO.film(); ${depart}`);
for (let i = 0; i < +n; i++) {
  await page.evaluate('DEMO.pas(1000 / 60)');
  await page.screenshot({ path: `${dossier}/${String(i).padStart(5, '0')}.png`, clip: { x, y, width: w, height: h } });
}
console.log(JSON.stringify({ ok: true, images: +n }));
await page.close(); await b.close();
