/* Capture d'écran d'une page de Rig Lab dans un Chrome sans fenêtre.
     node riglab/tools/ecran.mjs URL sortie.png [largeur] [hauteur] [attente ms] [script JS]
   Le script JS (optionnel) est exécuté dans la page avant la capture ; il
   peut renvoyer une promesse. Les erreurs de la console sont affichées. */
import { chromium } from 'playwright-core';

const [url, out, w = 1440, h = 900, wait = 1500, script = ''] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(+wait);
if (script) {
  try { const r = await page.evaluate(`(async () => { ${script} })()`); if (r !== undefined) console.log('résultat :', JSON.stringify(r)); } catch (e) { errs.push('script: ' + e.message); }
  await page.waitForTimeout(600);
}
await page.screenshot({ path: out });
if (errs.length) console.log(errs.slice(0, 15).join('\n'));
console.log(out);
await browser.close();
