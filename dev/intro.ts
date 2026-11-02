// Preview page for the Reimei Games studio intro.
//   ?introAt=2.4  freeze on a frame (screenshots)
import { playStudioIntro } from '../Reimei Games/intro/studio-intro';

const at = new URLSearchParams(location.search).get('introAt');

const css = document.createElement('style');
css.textContent = `
  :root { color-scheme: dark; --bg:#040306; --fg:#f6e7c9; --gold:#ffc93c; --line:rgba(255,201,60,.35) }
  html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:600 14px/1.2 system-ui,sans-serif}
  .rm-bar{position:fixed;left:0;right:0;bottom:0;z-index:2000;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;
    padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px))}
  .rm-bar button{font:inherit;letter-spacing:.14em;text-transform:uppercase;color:var(--fg);background:rgba(20,10,12,.7);
    border:1px solid var(--line);border-radius:999px;padding:10px 18px;cursor:pointer}
  .rm-bar button:hover{border-color:var(--gold);color:#fff}
  .rm-bar button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
  .rm-bar[hidden]{display:none}
`;
document.head.appendChild(css);

const bar = document.createElement('div');
bar.className = 'rm-bar';
bar.hidden = true;
bar.innerHTML = '<button id="rm-play" type="button">Rejouer</button><button id="rm-sound" type="button">Rejouer avec le son</button>';
document.body.appendChild(bar);

let running = false;
async function run(sound: boolean) {
  if (running) return;
  running = true;
  bar.hidden = true;
  document.querySelectorAll('.rm-intro').forEach((n) => n.remove());
  await playStudioIntro({ sound, keep: true });
  running = false;
  bar.hidden = false;
}

if (at !== null) {
  void playStudioIntro({ freezeAt: Number(at) });
  (window as unknown as { __ready: boolean }).__ready = true;
} else {
  document.getElementById('rm-play')!.addEventListener('click', () => run(false));
  document.getElementById('rm-sound')!.addEventListener('click', () => run(true));
  void run(false);
  (window as unknown as { __ready: boolean }).__ready = true;
}
