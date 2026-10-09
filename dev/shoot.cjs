// Screenshot tool for the harness / game (headless Chromium + SwiftShader WebGL).
//
//   node dev/shoot.cjs "<url>" --plan "step:30;shot:out.png;eval:__h.character.react('bigWin');step:20;shot:out2.png" [--w 1280 --h 720 --dpr 1]
//
// Plan actions (separated by ';;' or ';'):
//   step:N[@ms]   advance N frames of ms (default 33) via window.__step (needs &manual=1)
//   wait:MS       real-time wait
//   eval:JS       evaluate JS in the page (await-able expressions are awaited)
//   shot:PATH     screenshot to PATH
//   click:SEL     click a CSS selector
// Prints console errors / page errors at the end. Exit code 1 if the page reported __error.
const PW = '/opt/node-tools/node_modules/playwright';
const { chromium } = require(PW);
const args = process.argv.slice(2);
const url = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const plan = (opt('plan', 'step:20;shot:shot.png')).split(/;;|;(?=(?:step|wait|eval|shot|click):)/).map((s) => s.trim()).filter(Boolean);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +opt('w', 1280), height: +opt('h', 720) }, deviceScaleFactor: +opt('dpr', 1) });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|GL Driver|swiftshader|GroupMarker/i.test(m.text())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) { console.log('PAGE ERROR:', err); await browser.close(); process.exit(1); }
  for (const a of plan) {
    const i = a.indexOf(':');
    const k = a.slice(0, i), v = a.slice(i + 1);
    if (k === 'step') { const [n, ms] = v.split('@'); await page.evaluate(([n, ms]) => window.__step(ms, n), [+n, +(ms || 33)]); }
    else if (k === 'wait') await page.waitForTimeout(+v);
    else if (k === 'eval') await page.evaluate(`(async () => { ${v} })()`);
    else if (k === 'shot') { await page.screenshot({ path: v }); console.log('saved', v); }
    else if (k === 'click') await page.click(v);
  }
  console.log(logs.length ? logs.join('\n') : 'no console errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
