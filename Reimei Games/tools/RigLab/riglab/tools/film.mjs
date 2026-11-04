/* Filme une page de Rig Lab (Chrome sans fenêtre) en WebM.
     node riglab/tools/film.mjs URL sortie.webm [durée ms] [script JS lancé après chargement] [largeur] [hauteur] */
import { chromium } from 'playwright-core';
import { renameSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
const [url, out, duree = 6000, script = '', w = 1100, h = 760] = process.argv.slice(2);
const dir = join(dirname(out), '_film');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, recordVideo: { dir, size: { width: +w, height: +h } } });
const page = await ctx.newPage();
await page.goto(url);
await page.waitForTimeout(2200);
if (script) await page.evaluate(`(async () => { ${script} })()`);
await page.waitForTimeout(+duree);
const v = page.video();
await ctx.close();
renameSync(await v.path(), out);
await browser.close();
console.log(out);
