/* Ouvre une page de Rig Lab dans un Chrome sans fenêtre et attend
   window.RL_FINI, puis l'affiche en JSON. Utilisé par rl.py.

     node riglab/tools/rendu.mjs "http://127.0.0.1:4390/claude/?p=atelier&s=roi&faire=planche&anim=win"
*/
import { chromium } from 'playwright-core';

const url = process.argv[2];
const delai = +(process.argv[3] || 120000);
const essais = [
  {},
  { channel: 'chrome' },
  { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
];
let browser, derniere;
for (const opt of essais) {
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...opt });
    break;
  } catch (e) { derniere = e; }
}
if (!browser) { console.log(JSON.stringify({ ok: false, erreur: 'navigateur introuvable : ' + derniere })); process.exit(1); }
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
try {
  await page.goto(url);
  await page.waitForFunction(() => window.RL_FINI, null, { timeout: delai });
  const res = await page.evaluate(() => window.RL_FINI);
  if (erreurs.length) res.console = erreurs.slice(0, 10);
  console.log(JSON.stringify(res));
} catch (e) {
  console.log(JSON.stringify({ ok: false, erreur: String(e), console: erreurs.slice(0, 10) }));
}
await browser.close();
