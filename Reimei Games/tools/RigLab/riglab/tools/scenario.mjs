/* Joue un scénario souris / clavier dans Rig Lab (Chrome sans fenêtre) et
   prend des captures. Sert à tester l'éditeur comme un vrai utilisateur.
     node riglab/tools/scenario.mjs scenario.json
   scenario.json = { "url": "...", "w": 1440, "h": 900, "etapes": [
     { "attendre": 800 },
     { "clic": [x, y] }, { "clic": [x, y], "maj": true },
     { "double": [x, y] }, { "droit": [x, y] },
     { "glisser": [[x0, y0], [x1, y1]], "pas": 12, "alt": false, "maj": false },
     { "touche": "r" }, { "touche": "Meta+z" },
     { "bouton": "Détacher", "dans": "#decoupeBar" }, { "remplir": ["#modalBox input", "valeur"] },
     { "ecrire": "texte" },
     { "js": "return window.riglab.S.sel" },
     { "capture": "nom.png" } ] } */
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const sc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: sc.w || 1440, height: sc.h || 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(sc.url);
await page.waitForTimeout(sc.attente ?? 2200);
const mods = (s) => [s.maj && 'Shift', s.alt && 'Alt', s.cmd && 'Meta'].filter(Boolean);
for (const s of sc.etapes) {
  try {
    for (const m of mods(s)) await page.keyboard.down(m);
    if (s.attendre) await page.waitForTimeout(s.attendre);
    if (s.clic) await page.mouse.click(...s.clic);
    if (s.double) await page.mouse.dblclick(...s.double);
    if (s.droit) await page.mouse.click(...s.droit, { button: 'right' });
    if (s.glisser) {
      const [[x0, y0], [x1, y1]] = s.glisser, n = s.pas || 12;
      await page.mouse.move(x0, y0); await page.mouse.down();
      for (let i = 1; i <= n; i++) { await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await page.waitForTimeout(16); }
      await page.mouse.up();
    }
    if (s.survol) await page.mouse.move(...s.survol);
    if (s.molette) { await page.mouse.move(s.molette[0], s.molette[1]); await page.mouse.wheel(s.molette[2] || 0, s.molette[3] || 0); }
    if (s.bouton) await page.locator(s.dans ? `${s.dans} button:visible` : 'button:visible', { hasText: s.bouton }).first().click();
    if (s.remplir) await page.fill(s.remplir[0], String(s.remplir[1]));
    if (s.fichier) await page.setInputFiles(s.fichier[0], s.fichier[1]);
    if (s.texte) await page.locator(s.dans || 'body').getByText(s.texte, { exact: true }).first().click();
    if (s.touche) await page.keyboard.press(s.touche);
    if (s.ecrire) await page.keyboard.type(s.ecrire);
    if (s.js) { const r = await page.evaluate(`(async () => { ${s.js} })()`); console.log('js :', JSON.stringify(r)); }
    for (const m of mods(s).reverse()) await page.keyboard.up(m);
    if (s.capture) { await page.waitForTimeout(s.delai ?? 350); const p = join(here, '..', 'captures', s.capture); await page.screenshot({ path: p }); console.log('capture :', p); }
  } catch (e) { errs.push('étape ' + JSON.stringify(s).slice(0, 80) + ' : ' + e.message); }
}
if (errs.length) console.log('ERREURS :\n' + errs.slice(0, 20).join('\n'));
await browser.close();
