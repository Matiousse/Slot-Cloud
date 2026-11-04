/* SCÈNE : affiche le symbole, les os, la sélection et les poignées ;
   manipulation directe (déplacer, tourner, échelle, pivot, déformer). */
import * as PIXI from '../../vendor/pixi.min.mjs';
import { buildSymbol, MAT } from '../../engine/symbol-rig.js';
import { S, bus, part, anim, dur, edit, setKeys, valueAt, keyAt, track, descendants, kind, breakMerge } from './store.js';

const DT = 1000 / 60;
export const V = { app: null, sym: null, zoom: 1, pan: [0, 0], custom: null, handlers: null };
let world, bg, ghostLayer, overlay, ghosts = [], symLayer;
let hover = null, drag = null, spaceDown = false, mouse = [0, 0];
const alphaCache = new Map();

/* ---------------- initialisation ---------------- */
export async function initViewport() {
  const host = document.getElementById('view');
  const app = new PIXI.Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio, autoDensity: true, preference: 'webgl' });
  host.appendChild(app.canvas);
  V.app = app;
  world = new PIXI.Container();
  bg = new PIXI.Graphics();
  ghostLayer = new PIXI.Container();
  symLayer = new PIXI.Container();
  V.customLayer = new PIXI.Container();
  world.addChild(bg, ghostLayer, symLayer, V.customLayer);
  overlay = new PIXI.Graphics();
  V.overlayText = new PIXI.Container();
  app.stage.addChild(world, overlay, V.overlayText);
  app.ticker.add((tk) => tick(tk.deltaMS));
  bindPointer(app.canvas);
  new ResizeObserver(() => { layoutWorld(); }).observe(host);
  bus.on('rig', () => rebuild());
  bus.on('time', () => { if (!S.playing) showAt(S.t); });
  bus.on('sel', () => {});
  bus.on('mode', () => { rebuild(); fit(); });
  bus.on('open', () => setTimeout(fit, 30));
}

/* ---------------- symbole ---------------- */
export function rebuild() {
  if (!S.rig) return;
  const keepPlaying = S.playing;
  for (const g of ghosts) g.destroy({ children: true });
  ghosts = [];
  if (V.sym) { V.sym.destroy({ children: true }); V.sym = null; }
  try {
    V.sym = buildSymbol(PIXI, S.rig, S.tex);
  } catch (e) { console.error(e); bus.emit('toast', { msg: 'Rig invalide : ' + e.message, kind: 'err' }); return; }
  V.sym.onEvent = onEvent;
  symLayer.addChild(V.sym);
  for (const n of Object.values(V.sym.nodes)) if (S.hidden.has(n.part.name)) n.renderable = false;
  if (S.onion && S.mode === 'animer') {
    for (const [i, tint] of [[-2, 0xff6b7a], [-1, 0xff6b7a], [1, 0x5ee39a], [2, 0x5ee39a]]) {
      const g = buildSymbol(PIXI, S.rig, S.tex); g.dt = i; g.paused = true;
      g.alpha = Math.abs(i) === 1 ? .28 : .14;
      for (const n of Object.values(g.nodes)) if (n.sprite && n.part.blend !== 'add') n.sprite.tint = tint;
      ghosts.push(g); ghostLayer.addChild(g);
    }
  }
  V.sym.visible = S.mode !== 'decoupe';
  drawBg();
  if (S.mode === 'apercu') return;
  if (keepPlaying && S.mode === 'animer') startPlay(); else showAt(S.t);
}
const hasPhysics = () => S.rig.parts.some((p) => p.spring || p.jiggle || p.wiggle);

/* pose exacte à t : ressorts rejoués depuis 0 s'il y en a */
export function showAt(t) {
  const sym = V.sym; if (!sym || S.mode === 'apercu') return;
  if (S.mode !== 'animer' || !anim()) { sym.stop(0); sym.stop(1, 0); sym.update(0); drawOverlay(); return; }
  const a = anim();
  sym.clearParticles();
  if (hasPhysics()) {
    sym.resetPhysics();
    sym.play(S.anim, { mix: 0, loop: false, then: null });
    if (S.layer) sym.play(S.layer, { track: 1, loop: true, mix: 0 });
    sym.update(0);
    let c = 0;
    while (c + DT <= t) { sym.update(DT); c += DT; }
    if (t - c > .01) sym.update(t - c);
    sym.seek(t); sym.update(0);
  } else {
    sym.play(S.anim, { mix: 0, loop: false, then: null });
    if (S.layer) sym.play(S.layer, { track: 1, loop: true, mix: 0 });
    sym.seek(Math.min(t, a.dur)); sym.update(0);
  }
  for (const g of ghosts) {
    g.visible = !S.playing;
    if (!g.visible) continue;
    const tt = t + g.dt * 50;
    g.visible = tt >= 0 && tt <= a.dur;
    g.play(S.anim, { mix: 0, loop: false, then: null }); g.seek(Math.max(0, Math.min(a.dur, tt))); g.update(0);
  }
  drawOverlay();
}
export function startPlay() {
  const sym = V.sym; if (!sym || !anim()) return;
  if (S.t >= dur() - 1 && !S.loop) S.t = 0;
  sym.resetPhysics();
  sym.play(S.anim, { mix: 0, loop: S.loop, then: null });
  if (S.layer) sym.play(S.layer, { track: 1, loop: true, mix: 0 });
  sym.seek(S.t);
  ghosts.forEach((g) => (g.visible = false));
}
function tick(dms) {
  if (!V.sym) return;
  if (S.mode === 'apercu') { V.apercuTick && V.apercuTick(dms); return; }
  if (S.playing && S.mode === 'animer') {
    V.sym.update(dms * S.speed);
    S.t = V.sym.time();
    if (!S.loop && V.sym.time() >= dur() - .01) { S.t = dur(); bus.emit('stop'); }
    bus.emit('tick');
  }
  drawOverlay();
}

/* ---------------- sons des événements ---------------- */
const sonCache = {};
let actx;
async function onEvent(ev) {
  if (!S.playing && S.mode !== 'apercu') return;
  bus.emit('event', ev);
  const nom = ev.name;
  if (!nom || !S.sons.includes(nom)) return;
  try {
    actx ||= new AudioContext();
    if (!sonCache[nom]) sonCache[nom] = fetch(`/son/${S.p}/${nom}`).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b));
    const buf = await sonCache[nom];
    const src = actx.createBufferSource(); src.buffer = buf;
    const g = actx.createGain(); g.gain.value = ev.volume ?? .8;
    src.connect(g).connect(actx.destination); src.start();
  } catch (e) { /* son indisponible */ }
}

/* ---------------- caméra ---------------- */
function layoutWorld() {
  if (!V.app) return;
  const w = V.app.screen.width, h = V.app.screen.height;
  world.position.set(w / 2 + V.pan[0], h / 2 + V.pan[1]);
  world.scale.set(V.zoom);
  bus.emit('zoom', V.zoom);
  drawOverlay();
}
export function fit() {
  if (!S.rig || !V.app) return;
  const w = V.app.screen.width, h = V.app.screen.height;
  const m = S.mode === 'apercu' ? (V.fitMargin || .56) : .66;
  V.zoom = Math.min(w / S.rig.size[0], h / S.rig.size[1]) * m;
  V.pan = [S.mode === 'animer' || S.mode === 'rig' ? 20 : 0, S.mode === 'apercu' ? -30 : 0];
  layoutWorld();
}
export function zoomBy(f, cx, cy) {
  const w = V.app.screen.width, h = V.app.screen.height;
  cx ??= w / 2; cy ??= h / 2;
  const nz = Math.max(.05, Math.min(20, V.zoom * f));
  const ox = world.x, oy = world.y;
  const lx = (cx - ox) / V.zoom, ly = (cy - oy) / V.zoom;
  V.zoom = nz;
  V.pan[0] = cx - lx * nz - w / 2; V.pan[1] = cy - ly * nz - h / 2;
  layoutWorld();
}
export const toLocal = (x, y) => [(x - world.x) / V.zoom, (y - world.y) / V.zoom];
export const toScreen = (x, y) => [world.x + x * V.zoom, world.y + y * V.zoom];
export const toImage = (x, y) => { const [lx, ly] = toLocal(x, y); return [lx + S.rig.size[0] / 2, ly + S.rig.size[1] / 2]; };
export const imageToScreen = (x, y) => toScreen(x - S.rig.size[0] / 2, y - S.rig.size[1] / 2);

function drawBg() {
  bg.clear();
  if (!S.rig) return;
  const [W, H] = S.rig.size;
  if (S.mode === 'decoupe') return;
  if (S.cell) {
    const r = Math.min(W, H) * .045;
    if (S.mode !== 'apercu') {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) bg.roundRect(-W / 2 + dx * W * 1.04, -H / 2 + dy * H * 1.04, W, H, r).fill({ color: 0x191c24, alpha: .55 });
    }
    bg.roundRect(-W / 2, -H / 2, W, H, r).fill({ color: 0x1c1f29 }).stroke({ color: 0x2f3442, width: 2 / V.zoom });
  }
}

/* ---------------- dessin des os, de la sélection, des poignées ---------------- */
const M4 = (nm) => V.sym && V.sym.worldOf[nm];
function pivotScreen(nm) { const M = M4(nm); return M ? toScreen(M[4], M[5]) : [0, 0]; }
function partQuad(nm) {
  const n = V.sym.nodes[nm], M = M4(nm); if (!n || !n.sprite || !M) return null;
  const sp = n.sprite;
  if (n.rest) {
    // contour du maillage déformé : les sommets du bord
    const p = sp.geometry.positions, [cols, rows] = n.part.mesh.grid || [8, 8], vx = cols + 1;
    const idx = [];
    for (let i = 0; i < vx; i++) idx.push(i);
    for (let j = 1; j <= rows; j++) idx.push(j * vx + cols);
    for (let i = cols - 1; i >= 0; i--) idx.push(rows * vx + i);
    for (let j = rows - 1; j >= 1; j--) idx.push(j * vx);
    return idx.map((i) => { const x = p[i * 2] + sp.x, y = p[i * 2 + 1] + sp.y; return toScreen(M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]); });
  }
  const b = opaqueRect(sp.texture);
  const x0 = sp.x + b[0], y0 = sp.y + b[1], x1 = sp.x + b[2], y1 = sp.y + b[3];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toScreen(M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]));
}
/* boîte des pixels visibles d'une image (les pièces partagent le cadrage du
   symbole : l'image entière serait bien plus grande que la pièce) */
const rectCache = new Map();
function opaqueRect(tex) {
  if (rectCache.has(tex.uid)) return rectCache.get(tex.uid);
  const w = tex.frame.width, h = tex.frame.height;
  let r = [0, 0, w, h];
  if (alphaAt(tex, 0, 0) !== undefined) {
    const c = alphaCache.get(tex.uid);
    if (c) {
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (c.d[((tex.frame.y + y) * c.w + tex.frame.x + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0) r = [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
    }
  }
  rectCache.set(tex.uid, r);
  return r;
}
export function meshVerts(nm) {
  const n = V.sym.nodes[nm], M = M4(nm); if (!n || !n.rest) return [];
  const p = n.sprite.geometry.positions, sp = n.sprite, out = [];
  for (let i = 0; i < p.length; i += 2) { const x = p[i] + sp.x, y = p[i + 1] + sp.y; out.push(toScreen(M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5])); }
  return out;
}

const COL = { bone: 0x7fd4f5, img: 0xf5b942, sel: 0x56c7f0, white: 0xffffff, key: 0xf5b942 };
function drawOverlay() {
  overlay.clear();
  if (!V.sym || !S.rig || S.mode === 'apercu' || S.mode === 'decoupe') { if (S.mode === 'decoupe' && V.drawCustom) V.drawCustom(overlay); return; }
  const sel = new Set(S.sel);
  // trajectoire
  if (S.path && S.sel.length && S.mode === 'animer' && V.pathPts) {
    const pts = V.pathPts.map(([x, y]) => toScreen(x, y));
    overlay.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => overlay.lineTo(p[0], p[1]));
    overlay.stroke({ color: 0xffd27a, width: 1.5, alpha: .5 });
    pts.forEach((p, i) => overlay.circle(p[0], p[1], i % 6 ? 1.6 : 2.6).fill({ color: 0xffd27a, alpha: i % 6 ? .6 : 1 }));
  }
  // contour des pièces choisies (et survolée)
  for (const nm of [...sel, hover].filter(Boolean)) {
    const q = partQuad(nm); if (!q) continue;
    overlay.poly(q.flat(), true).stroke({ color: sel.has(nm) ? COL.sel : COL.white, width: sel.has(nm) ? 1.6 : 1, alpha: sel.has(nm) ? .9 : .35 });
  }
  // maillage en mode déformation
  if (S.tool === 'ffd' && S.sel.length) {
    const nm = S.sel[0], n = V.sym.nodes[nm];
    if (n && n.rest) {
      const vs = meshVerts(nm), [cols, rows] = n.part.mesh.grid || [8, 8], vx = cols + 1;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const a = vs[j * vx + i];
        if (i < cols) { const b = vs[j * vx + i + 1]; overlay.moveTo(a[0], a[1]).lineTo(b[0], b[1]); }
        if (j < rows) { const b = vs[(j + 1) * vx + i]; overlay.moveTo(a[0], a[1]).lineTo(b[0], b[1]); }
      }
      overlay.stroke({ color: COL.sel, width: 1, alpha: .35 });
      const hot = drag && drag.kind === 'ffd' ? drag.w : null;
      vs.forEach((v, i) => overlay.circle(v[0], v[1], 3.2).fill({ color: hot && hot[i] > .01 ? 0xffd27a : COL.white, alpha: hot && hot[i] > .01 ? .4 + hot[i] * .6 : .85 }).stroke({ color: 0x0d0e12, width: 1 }));
      const r = S.ffdRadius * V.zoom;
      overlay.circle(mouse[0], mouse[1], Math.max(4, r)).stroke({ color: 0xffd27a, width: 1, alpha: .5 });
    }
  }
  // os
  if (S.showBones || S.mode === 'rig') {
    for (const p of S.rig.parts) {
      if (!p.parent || !M4(p.parent)) continue;
      const [x0, y0] = pivotScreen(p.parent), [x1, y1] = pivotScreen(p.name);
      const L = Math.hypot(x1 - x0, y1 - y0); if (L < 4) continue;
      const nx = -(y1 - y0) / L, ny = (x1 - x0) / L, w = Math.min(7, L * .12);
      const on = sel.has(p.parent) || sel.has(p.name);
      overlay.poly([x0 + nx * w, y0 + ny * w, x1, y1, x0 - nx * w, y0 - ny * w], true)
        .fill({ color: on ? COL.sel : 0xdfe6f0, alpha: on ? .35 : .12 })
        .stroke({ color: on ? COL.sel : 0xdfe6f0, width: 1.1, alpha: on ? .9 : .45 });
    }
    // IK : trait vers la cible
    for (const c of S.rig.ik || []) {
      if (!M4(c.target) || !M4(c.bones?.[0])) continue;
      const [a, b] = pivotScreen(c.bones[0]), [tx, ty] = pivotScreen(c.target);
      overlay.moveTo(a, b).lineTo(tx, ty).stroke({ color: 0xff8ad8, width: 1, alpha: .5 });
    }
    for (const p of S.rig.parts) {
      const [x, y] = pivotScreen(p.name), on = sel.has(p.name), k = kind(p);
      const c = on ? COL.sel : k === 'bone' ? COL.bone : k === 'glow' ? 0xffe28a : COL.img;
      const r = on ? 6 : 4.5;
      overlay.circle(x, y, r + 2.5).fill({ color: 0x0d0e12, alpha: .6 });
      overlay.circle(x, y, r).fill({ color: c, alpha: on ? 1 : .9 });
      if (k === 'bone') overlay.circle(x, y, r * .45).fill({ color: 0x0d0e12 });
    }
  }
  drawGizmo();
}

/* poignées de l'outil actif autour de la première pièce choisie */
function gizmoGeom() {
  if (!S.sel.length || !M4(S.sel[0])) return null;
  const M = M4(S.sel[0]);
  const [x, y] = toScreen(M[4], M[5]);
  const ax = Math.atan2(M[1], M[0]), ay = Math.atan2(M[3], M[2]);
  return { x, y, ax, ay, M };
}
function drawGizmo() {
  const g = gizmoGeom(); if (!g) return;
  const { x, y, ax, ay } = g;
  const hot = (h) => (drag && drag.handle === h) || (!drag && hoverHandle === h);
  if (S.tool === 'rotate') {
    overlay.circle(x, y, 64).stroke({ color: hot('ring') ? 0xffd27a : COL.sel, width: hot('ring') ? 3 : 2, alpha: .9 });
    const hx = x + Math.cos(ax) * 64, hy = y + Math.sin(ax) * 64;
    overlay.moveTo(x, y).lineTo(hx, hy).stroke({ color: COL.sel, width: 1, alpha: .6 });
    overlay.circle(hx, hy, 6).fill({ color: hot('ring') ? 0xffd27a : COL.sel });
    if (drag && drag.kind === 'rotate') {
      const a0 = drag.a0v;
      overlay.moveTo(x, y).arc(x, y, 64, a0, a0 + drag.da, drag.da < 0).lineTo(x, y).fill({ color: 0xffd27a, alpha: .12 });
    }
  } else if (S.tool === 'scale') {
    for (const [a, h, c] of [[ax, 'sx', 0xff6b7a], [ay, 'sy', 0x5ee39a]]) {
      const hx = x + Math.cos(a) * 70, hy = y + Math.sin(a) * 70;
      overlay.moveTo(x, y).lineTo(hx, hy).stroke({ color: c, width: hot(h) ? 3 : 2 });
      overlay.rect(hx - 6, hy - 6, 12, 12).fill({ color: hot(h) ? 0xffd27a : c });
    }
    overlay.rect(x - 7, y - 7, 14, 14).fill({ color: hot('su') ? 0xffd27a : 0xffffff, alpha: .95 });
  } else if (S.tool === 'select' || S.tool === 'pivot') {
    const px = S.mode === 'animer' ? 1 : 0;
    const c = S.tool === 'pivot' ? 0xffd27a : COL.sel;
    if (px || S.tool === 'pivot') {
      overlay.moveTo(x - 14, y).lineTo(x + 14, y).moveTo(x, y - 14).lineTo(x, y + 14).stroke({ color: c, width: 1.5, alpha: .9 });
      overlay.circle(x, y, 9).stroke({ color: c, width: 1.5 });
    }
  }
}

/* ---------------- sélection au clic ---------------- */
function alphaAt(tex, x, y) {
  if (!tex || !tex.source) return 0;
  let c = alphaCache.get(tex.uid);
  if (!c) {
    const res = tex.source.resource; if (!res) return 1;
    const cv = document.createElement('canvas'); cv.width = tex.source.width; cv.height = tex.source.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(res, 0, 0);
    c = { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    alphaCache.set(tex.uid, c);
  }
  const fx = tex.frame.x + x, fy = tex.frame.y + y;
  if (x < 0 || y < 0 || x >= tex.frame.width || y >= tex.frame.height) return 0;
  return c.d[(Math.floor(fy) * c.w + Math.floor(fx)) * 4 + 3];
}
export function pickAt(sx, sy) {
  if (!V.sym) return null;
  // 1. les pivots (os compris)
  let best = null, bd = 10;
  for (const p of S.rig.parts) { const [x, y] = pivotScreen(p.name), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = p.name; } }
  if (best) return best;
  // 2. les images, de l'avant vers l'arrière (ordre de dessin courant)
  const [lx, ly] = toLocal(sx, sy);
  const nodes = Object.values(V.sym.nodes).filter((n) => n.sprite && n.visible && n.renderable && n.alpha > .05).sort((a, b) => b.zIndex - a.zIndex);
  for (const n of nodes) {
    if (n.part.blend === 'add') continue;
    const M = M4(n.part.name), I = MAT.inv(M);
    const [px, py] = MAT.apply(I, lx, ly);
    const tx = px - n.sprite.x, ty = py - n.sprite.y;
    if (alphaAt(n.sprite.texture, tx, ty) > 40) return n.part.name;
  }
  return null;
}

/* ---------------- manipulation ---------------- */
let hoverHandle = null;
function handleAt(sx, sy) {
  const g = gizmoGeom(); if (!g) return null;
  const { x, y, ax, ay } = g;
  if (S.tool === 'rotate') { const d = Math.hypot(sx - x, sy - y); return Math.abs(d - 64) < 9 ? 'ring' : null; }
  if (S.tool === 'scale') {
    if (Math.hypot(sx - x, sy - y) < 10) return 'su';
    if (Math.hypot(sx - (x + Math.cos(ax) * 70), sy - (y + Math.sin(ax) * 70)) < 10) return 'sx';
    if (Math.hypot(sx - (x + Math.cos(ay) * 70), sy - (y + Math.sin(ay) * 70)) < 10) return 'sy';
  }
  return null;
}
const parentLinearInv = (nm) => {
  const p = part(nm); const M = p && p.parent ? M4(p.parent) : [1, 0, 0, 1, 0, 0];
  return MAT.inv([M[0], M[1], M[2], M[3], 0, 0]);
};
function commitValues(nm, vals, label) {
  if (S.mode !== 'animer' || !anim()) return;
  const k = keyAt(nm);
  if (!S.autokey && !k) { bus.emit('toast', { msg: 'Auto-clé coupée : pose d\'abord une clé (K)', kind: '' }); return; }
  setKeys(nm, vals, S.t, label);
}

function bindPointer(cv) {
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (V.handlers && V.handlers.wheel && V.handlers.wheel(e)) return;
    const pinch = e.ctrlKey || e.metaKey;
    const trackpad = !pinch && (Math.abs(e.deltaX) > 0 || (Math.abs(e.deltaY) < 40 && e.deltaMode === 0 && !Number.isInteger(e.deltaY)));
    if (trackpad) { V.pan[0] -= e.deltaX; V.pan[1] -= e.deltaY; layoutWorld(); return; }
    zoomBy(Math.exp(-e.deltaY * (pinch ? .012 : .0018)), e.offsetX, e.offsetY);
  }, { passive: false });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) spaceDown = true; });
  addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  cv.addEventListener('pointerdown', (e) => {
    if (!S.rig) return;
    cv.setPointerCapture(e.pointerId);
    const sx = e.offsetX, sy = e.offsetY;
    mouse = [sx, sy];
    if (e.button === 1 || e.button === 2 || spaceDown) { drag = { kind: 'pan', x0: sx, y0: sy, p0: [...V.pan] }; cv.style.cursor = 'grabbing'; return; }
    if (V.handlers && V.handlers.down) { V.handlers.down(e, toImage(sx, sy)); return; }
    if (S.mode === 'apercu') return;
    breakMerge();
    const h = handleAt(sx, sy);
    const sel0 = S.sel[0];
    if (h && sel0) return startDrag(h, sel0, sx, sy, e);
    if (S.tool === 'ffd' && sel0 && V.sym.nodes[sel0]?.rest) return startFfd(sel0, sx, sy, e);
    const hit = pickAt(sx, sy);
    if (!hit) { if (!e.shiftKey) { S.sel = []; bus.emit('sel'); } drag = { kind: 'none' }; return; }
    if (e.shiftKey) S.sel = S.sel.includes(hit) ? S.sel.filter((n) => n !== hit) : [...S.sel, hit];
    else if (!S.sel.includes(hit)) S.sel = [hit];
    else S.sel = [hit, ...S.sel.filter((n) => n !== hit)];
    bus.emit('sel');
    if (S.tool === 'select' || S.tool === 'pivot') startDrag(S.tool === 'pivot' ? 'pivot' : 'move', hit, sx, sy, e);
    else if (S.tool === 'rotate') startDrag('ring', hit, sx, sy, e);
    else if (S.tool === 'scale') startDrag('su', hit, sx, sy, e);
  });
  cv.addEventListener('pointermove', (e) => {
    const sx = e.offsetX, sy = e.offsetY;
    mouse = [sx, sy];
    if (V.handlers && V.handlers.move) { V.handlers.move(e, toImage(sx, sy)); }
    if (!drag) {
      if (!S.rig || S.mode === 'apercu' || S.mode === 'decoupe') return;
      hoverHandle = handleAt(sx, sy);
      const h = hoverHandle ? null : pickAt(sx, sy);
      if (h !== hover) { hover = h; }
      cv.style.cursor = spaceDown ? 'grab' : hoverHandle ? 'pointer' : hover ? (S.tool === 'rotate' ? 'alias' : 'move') : 'default';
      return;
    }
    if (drag.kind === 'pan') { V.pan = [drag.p0[0] + sx - drag.x0, drag.p0[1] + sy - drag.y0]; layoutWorld(); return; }
    if (drag.move) drag.move(sx, sy, e);
  });
  const end = (e) => {
    if (V.handlers && V.handlers.up) V.handlers.up(e, toImage(e.offsetX, e.offsetY));
    if (drag && drag.end) drag.end();
    drag = null; cv.style.cursor = 'default'; breakMerge();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { hover = null; });
}

function startDrag(handle, nm, sx, sy, e) {
  const p = part(nm);
  const M = M4(nm);
  const [lx0, ly0] = toLocal(sx, sy);
  const piv = [M[4], M[5]];
  // ---- mode Rig : déplacer la pièce (et ses enfants) ou seulement son pivot
  if (S.mode === 'rig') {
    const moving = handle === 'pivot' ? [nm] : [nm, ...descendants(nm)];
    const start = moving.map((n) => ({ n, piv: [...part(n).pivot], off: part(n).offset ? [...part(n).offset] : null }));
    drag = {
      handle, kind: 'rig',
      move(x, y, ev) {
        const [lx, ly] = toLocal(x, y);
        let dx = Math.round(lx - lx0), dy = Math.round(ly - ly0);
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        edit(handle === 'pivot' ? 'déplacer le pivot' : 'déplacer la pièce', () => {
          for (const s of start) {
            const q = part(s.n);
            q.pivot = [s.piv[0] + dx, s.piv[1] + dy];
            if (handle !== 'pivot' && (q.src || q.frames)) q.offset = [(s.off ? s.off[0] : 0) + dx, (s.off ? s.off[1] : 0) + dy];
            if (q.offset && q.offset[0] === 0 && q.offset[1] === 0) delete q.offset;
          }
        }, { structure: true });
      },
    };
    return;
  }
  if (S.mode !== 'animer' || !anim()) return;
  const v0 = { rot: valueAt(nm, 'rot'), x: valueAt(nm, 'x'), y: valueAt(nm, 'y'), sx: valueAt(nm, 'sx'), sy: valueAt(nm, 'sy') };
  if (handle === 'move') {
    const I = parentLinearInv(nm);
    drag = {
      handle, kind: 'move',
      move(x, y, ev) {
        const [lx, ly] = toLocal(x, y);
        let dx = lx - lx0, dy = ly - ly0;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const [px, py] = MAT.apply(I, dx, dy);
        commitValues(nm, { x: +(v0.x + px).toFixed(2), y: +(v0.y + py).toFixed(2) }, 'déplacer');
      },
    };
  } else if (handle === 'ring') {
    const a0 = Math.atan2(ly0 - piv[1], lx0 - piv[0]);
    const flip = (M[0] * M[3] - M[1] * M[2]) < 0 ? -1 : 1;
    drag = {
      handle, kind: 'rotate', a0v: a0, da: 0,
      move(x, y, ev) {
        const [lx, ly] = toLocal(x, y);
        let da = Math.atan2(ly - piv[1], lx - piv[0]) - a0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        let r = v0.rot + da * flip;
        if (ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
        this.da = da;
        commitValues(nm, { rot: +r.toFixed(4) }, 'tourner');
      },
    };
  } else if (handle === 'su' || handle === 'sx' || handle === 'sy') {
    const ax = [M[0], M[1]], ay = [M[2], M[3]];
    const nax = Math.hypot(...ax) || 1, nay = Math.hypot(...ay) || 1;
    const u = [ax[0] / nax, ax[1] / nax], w = [ay[0] / nay, ay[1] / nay];
    const d0 = [lx0 - piv[0], ly0 - piv[1]];
    const pu0 = d0[0] * u[0] + d0[1] * u[1], pw0 = d0[0] * w[0] + d0[1] * w[1], r0 = Math.hypot(...d0) || 1;
    drag = {
      handle, kind: 'scale',
      move(x, y, ev) {
        const [lx, ly] = toLocal(x, y), d = [lx - piv[0], ly - piv[1]];
        const vals = {};
        if (handle === 'su' || ev.shiftKey) { const f = Math.hypot(...d) / r0; vals.sx = v0.sx * f; vals.sy = v0.sy * f; }
        else if (handle === 'sx') vals.sx = v0.sx * ((d[0] * u[0] + d[1] * u[1]) / (pu0 || 1));
        else vals.sy = v0.sy * ((d[0] * w[0] + d[1] * w[1]) / (pw0 || 1));
        for (const k in vals) vals[k] = +vals[k].toFixed(4);
        commitValues(nm, vals, 'échelle');
      },
    };
  }
}

/* déformation libre : pinceau doux sur les sommets */
function startFfd(nm, sx, sy, e) {
  if (S.mode !== 'animer' || !anim()) { bus.emit('toast', { msg: 'La déformation se pose en mode Animer', kind: '' }); return; }
  const n = V.sym.nodes[nm];
  const vs = meshVerts(nm);
  let gi = 0, gd = Infinity;
  vs.forEach((v, i) => { const d = Math.hypot(v[0] - sx, v[1] - sy); if (d < gd) { gd = d; gi = i; } });
  // poids : distance au sommet saisi, dans l'image de repos
  const rest = n.rest, R = Math.max(1, S.ffdRadius);
  const gx = rest[gi * 2], gy = rest[gi * 2 + 1];
  const w = new Float32Array(rest.length / 2);
  for (let i = 0; i < w.length; i++) {
    const d = Math.hypot(rest[i * 2] - gx, rest[i * 2 + 1] - gy);
    w[i] = gd > 24 ? 0 : d < R ? (1 - (d / R) ** 2) ** 2 : 0;
  }
  if (gd > 24) return;
  w[gi] = 1;
  const f0 = (valueAt(nm, 'ffd') || []).slice();
  while (f0.length < rest.length) f0.push(0);
  const M = M4(nm), I = MAT.inv([M[0], M[1], M[2], M[3], 0, 0]);
  const [lx0, ly0] = toLocal(sx, sy);
  drag = {
    kind: 'ffd', w,
    move(x, y) {
      const [lx, ly] = toLocal(x, y);
      const [dx, dy] = MAT.apply(I, lx - lx0, ly - ly0);
      const f = f0.map((v, i) => +(v + (i % 2 ? dy : dx) * w[i >> 1]).toFixed(2));
      commitValues(nm, { ffd: f }, 'déformer');
    },
  };
}

export function resetFfd() {
  const nm = S.sel[0]; if (!nm || !keyAt(nm)) return;
  const k = keyAt(nm);
  if ('ffd' in k) edit('remettre à plat', () => { k.ffd = k.ffd.map(() => 0); }, { merge: false });
}

/* trajectoire de la pièce choisie sur toute l'animation */
export function computePath() {
  V.pathPts = null;
  if (!S.path || !S.sel.length || !anim()) return;
  const nm = S.sel[0], a = anim();
  const s = buildSymbol(PIXI, S.rig, S.tex);
  s.play(S.anim, { mix: 0, loop: false, then: null }); s.update(0);
  const pts = [];
  for (let t = 0; t <= a.dur; t += DT) { const M = s.worldOf[nm]; pts.push([M[4], M[5]]); s.update(DT); }
  s.destroy({ children: true });
  V.pathPts = pts;
}
bus.on('rig', () => computePath());
bus.on('sel', () => computePath());
