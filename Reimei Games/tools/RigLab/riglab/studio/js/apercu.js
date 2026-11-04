/* APERÇU : le symbole seul, en grand, comme dans le jeu. États, enchaînement
   du jeu, voisins sur la grille, ralenti, vidéo. */
import * as PIXI from '../../vendor/pixi.min.mjs';
import { S, bus, api } from './store.js';
import { V, fit } from './viewport.js';
import { el, svg, toast } from './ui.js';

const LABEL = { idle: 'Repos', land: 'Arrivée', win: 'Gain', remove: 'Disparition', eclat: 'Éclat' };
let speed = 1, fond = 'case', current = 'idle', timers = [], neighbors = null, recording = null;

export function initApercu() {
  bus.on('mode', () => { if (S.mode === 'apercu') enter(); else leave(); });
  bus.on('open', () => { if (S.mode === 'apercu') { leave(); enter(); } });
  bus.on('rig', () => { if (S.mode === 'apercu') setTimeout(() => play(current), 0); });
  V.apercuTick = (dms) => { if (V.sym) V.sym.update(dms * speed); };
}

function clear() { timers.forEach(clearTimeout); timers = []; }
function enter() {
  renderBar(); renderSide();
  setTimeout(() => { fit(); drawNeighbors(); play('idle'); }, 30);
}
function leave() { clear(); if (neighbors) { neighbors.destroy({ children: true }); neighbors = null; } }

export function play(name) {
  const sym = V.sym; if (!sym || !S.rig.anims[name]) return;
  clear();
  current = name;
  const a = S.rig.anims[name];
  sym.stop(1, 0);
  if (name === 'eclat' && S.rig.anims.idle) { sym.play('idle', { mix: 0 }); sym.play('eclat', { track: 1 }); }
  else if (a.loop) sym.play(name, { loop: true });
  else if (name === 'remove') {
    sym.play('remove', { then: null });
    timers.push(setTimeout(() => { if (S.rig.anims.land) sym.play('land', { mix: 0, then: 'idle' }); else sym.play('idle', { mix: 0 }); current = 'idle'; renderBar(); }, (a.dur + 700) / speed));
  } else sym.play(name, { then: S.rig.anims.idle ? 'idle' : null });
  if (!a.loop && name !== 'remove') timers.push(setTimeout(() => { current = 'idle'; renderBar(); }, a.dur / speed));
  renderBar();
}
/* l'enchaînement d'un tour : arrivée, repos, gain, repos, disparition */
export function sequence(onEnd) {
  const sym = V.sym; if (!sym) return;
  clear();
  const A = S.rig.anims;
  const steps = [];
  let t = 0;
  if (A.land) { steps.push(['land', t]); t += A.land.dur + 700; } else t += 300;
  if (A.win) { steps.push(['win', t]); t += A.win.dur + 700; }
  if (A.remove) { steps.push(['remove', t]); t += A.remove.dur + 500; }
  if (A.land) steps.push(['land', t]);
  for (const [n, at] of steps) timers.push(setTimeout(() => { current = n; sym.play(n, { then: n === 'remove' ? null : 'idle', mix: n === 'land' ? 0 : undefined }); renderBar(); }, at / speed));
  timers.push(setTimeout(() => { current = 'idle'; renderBar(); onEnd && onEnd(); }, (t + (A.land ? A.land.dur : 0) + 600) / speed));
  if (A.idle) sym.play('idle', { mix: 0 });
  return t + (A.land ? A.land.dur : 0) + 600;
}

function renderBar() {
  const bar = document.getElementById('apercuBar');
  bar.innerHTML = '';
  const names = Object.keys(S.rig?.anims || {});
  const order = ['idle', 'land', 'win', 'remove', 'eclat'];
  names.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  for (const n of names) bar.append(el('button', { class: 'st' + (current === n ? ' on' : ''), text: LABEL[n] || n, onclick: () => play(n) }));
  bar.append(el('span', { class: 'vsep' }));
  bar.append(el('button', { class: 'st', html: `<span style="display:inline-flex;gap:7px;align-items:center"><span class="ic">${svg('film')}</span>Comme dans le jeu</span>`, onclick: () => sequence() }));
}
function renderSide() {
  const s = document.getElementById('apercuSide');
  s.innerHTML = '';
  const seg = (opts, cur, fn) => { const g = el('div', { class: 'seg sm' }); for (const [v, l] of opts) g.append(el('button', { class: cur === v ? 'on' : '', text: l, onclick: () => fn(v) })); return g; };
  s.append(el('h5', { text: 'Fond' }), seg([['case', 'Case'], ['grille', 'Grille'], ['vide', 'Vide']], fond, (v) => { fond = v; S.cell = v !== 'vide'; bus.emit('rig', { structure: true }); drawNeighbors(); renderSide(); }));
  s.append(el('h5', { text: 'Vitesse' }), seg([[.25, '×¼'], [.5, '×½'], [1, '×1']], speed, (v) => { speed = v; renderSide(); }));
  s.append(el('h5', { text: 'Vidéo' }));
  s.append(el('button', { class: 'btn sm wide' + (recording ? ' danger' : ''), html: svg('video') + (recording ? 'Enregistrement…' : 'Filmer l\'enchaînement'), onclick: filmer }));
  s.append(el('p', { class: 'note-p', text: 'Vidéo WebM 60 i/s du tour complet, à partager ou à comparer.' }));
}

async function drawNeighbors() {
  V.fitMargin = fond === 'grille' ? .3 : .56;
  fit();
  if (neighbors) { neighbors.destroy({ children: true }); neighbors = null; }
  if (fond !== 'grille' || !V.sym) return;
  const world = V.sym.parent.parent;
  neighbors = new PIXI.Container();
  world.addChildAt(neighbors, 1);
  if (!S.projets.length) S.projets = await api('/api/projets').catch(() => []);
  const p = S.projets.find((x) => x.id === S.p);
  const autres = (p ? p.symboles : []).filter((x) => x.nom !== S.s && x.vignette);
  const [W, H] = S.rig.size;
  let i = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    const g = new PIXI.Graphics();
    g.roundRect(-W / 2 + dx * W * 1.04, -H / 2 + dy * H * 1.04, W, H, Math.min(W, H) * .045).fill({ color: 0x1c1f29 }).stroke({ color: 0x2f3442, width: 2 });
    neighbors.addChild(g);
    const s = autres[i++ % Math.max(1, autres.length)];
    if (!s) continue;
    try {
      const t = await PIXI.Assets.load(s.vignette);
      const sp = new PIXI.Sprite(t); sp.anchor.set(.5);
      const k = Math.min(W / t.width, H / t.height) * .92;
      sp.scale.set(k); sp.position.set(dx * W * 1.04, dy * H * 1.04); sp.alpha = .9;
      if (neighbors) neighbors.addChild(sp);
    } catch (e) { /* vignette indisponible */ }
  }
}

async function filmer() {
  if (recording || !V.app) return;
  const cv = V.app.canvas;
  if (!cv.captureStream || !window.MediaRecorder) return toast('Ce navigateur ne sait pas filmer', 'err');
  const r = V.app.renderer;
  const oldA = r.background.alpha;
  r.background.color = 0x111217; r.background.alpha = 1;
  const stream = cv.captureStream(60);
  const mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    r.background.alpha = oldA;
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const a = document.createElement('a'); a.href = url; a.download = `${S.s}-apercu.webm`; a.click();
    recording = null; renderSide(); toast('Vidéo téléchargée', 'ok');
  };
  recording = rec; renderSide();
  rec.start();
  const d = sequence(() => setTimeout(() => rec.state === 'recording' && rec.stop(), 200));
  void d;
}
