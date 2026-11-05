// Film long du scénario de démonstration (demo_force=film), image par image avec l'horloge virtuelle de Playwright.
// Relance un spin dès que le jeu est au repos depuis PAUSE ms, jusqu'à SPINS tours, puis filme encore FIN ms.
const { chromium } = require('playwright');
(async () => {
  const [url, dir] = [process.argv[2], process.argv[3]];
  const SPINS = +(process.env.SPINS || 11), PAUSE = 1600, FIN = +(process.env.FIN || 4000), MAX = +(process.env.MAX || 200), FPS = 30;
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => { const c = document.querySelector('#splash .cta'); return c && !c.disabled; }, null, { timeout: 90000 });
  await p.click('#splash .cta');
  await p.waitForTimeout(1500);
  await p.clock.install();
  await p.clock.pauseAt(new Date(Date.now() + 2000));
  await p.clock.runFor(800);
  let spins = 0, idle = 0, after = 0;
  for (let i = 0; i < MAX * FPS; i++) {
    const busy = await p.evaluate(() => document.getElementById('hud').classList.contains('busy'));
    idle = busy ? 0 : idle + 1000 / FPS;
    if (spins < SPINS && idle >= (spins === 0 ? 600 : PAUSE)) {
      await p.evaluate(() => document.querySelector('[data-a="spin"]').click());
      spins++;
      idle = 0;
      console.log('spin', spins, 'à', (i / FPS).toFixed(1), 's');
    }
    if (spins >= SPINS && !busy && idle > 0) after += 1000 / FPS;
    if (after > FIN) break;
    // fond vidéo : on le cale nous-mêmes sur l'image suivante et on attend qu'il soit décodé avant de rendre
    await p.evaluate(async (t) => {
      const f = window.__fond; if (!f) return;
      f.manual = true;
      f.video.currentTime = t % f.video.duration;
      if (f.video.seeking) await new Promise((r) => f.video.addEventListener('seeked', r, { once: true }));
      f.source.update();
    }, (i + 1) / FPS);
    await p.clock.runFor(1000 / FPS);
    await p.screenshot({ path: `${dir}/f${String(i).padStart(5, '0')}.png` });
  }
  console.log(errs.join('\n') || 'aucune erreur');
  await b.close();
})();
