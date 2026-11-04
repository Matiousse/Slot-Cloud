/* TIMELINE : feuille d'exposition (clés), éditeur de courbes, transport. */
import { S, bus, part, anim, dur, edit, track, keyAt, snapT, treeOrder, kind, TOL, keyAll, allKeyTimes, easeFor, breakMerge } from './store.js';
import { sampleTrack, easeFn, easeOf } from '../../engine/symbol-rig.js';
import { el, menu, toast } from './ui.js';
import { PRESETS } from './inspector.js';

const LW = 196, RULER = 26, RH = 23;
const PROP_COL = { rot: '#ff7a9a', x: '#5cc8ff', y: '#6fe0a0', sx: '#ffb35c', sy: '#ffd66b', skx: '#ff9270', sky: '#ff9270', alpha: '#b99cff', flash: '#f2f2f2', tint: '#ff9ce0', z: '#9aa3b5', frame: '#9aa3b5', visible: '#9aa3b5', bend: '#5eead4', wave: '#7dd3fc', bulge: '#f0abfc', bulge2: '#f0abfc', bulge3: '#f0abfc', bulge4: '#f0abfc', taper: '#bef264', ffd: '#2dd4bf', shine: '#fff1a8', wig: '#9aa3b5' };
const PROP_FR = { rot: 'rotation', x: 'position x', y: 'position y', sx: 'échelle x', sy: 'échelle y', skx: 'cisaille x', sky: 'cisaille y', alpha: 'opacité', flash: 'flash', tint: 'teinte', z: 'ordre', frame: 'image', visible: 'visible', bend: 'courbure', wave: 'ondulation', bulge: 'gonflement', bulge2: 'gonflement 2', bulge3: 'gonflement 3', bulge4: 'gonflement 4', taper: 'effilement', ffd: 'déformation', shine: 'reflet', wig: 'bruit' };
const NAMED_BEZ = { linear: [0, 0, 1, 1], inQuad: [.55, .085, .68, .53], outQuad: [.25, .46, .45, .94], inOutQuad: [.455, .03, .515, .955], inCubic: [.55, .055, .675, .19], outCubic: [.215, .61, .355, 1], inOutCubic: [.645, .045, .355, 1], inQuart: [.895, .03, .685, .22], outQuart: [.165, .84, .44, 1], inOutSine: [.445, .05, .55, .95], inBack: [.6, -.28, .735, .045], outBack: [.175, .885, .32, 1.275], outBackBig: [.18, 1.5, .38, 1] };

let cv, g, W = 0, H = 0;
const view = { t0: 0, pxms: .3, scroll: 0, fitDur: 0 };
const expanded = new Set();
let rows = [], drag = null, clipboard = null, hoverKey = null;

export function initTimeline() {
  const body = document.getElementById('tlBody');
  cv = el('canvas'); body.append(cv); g = cv.getContext('2d');
  new ResizeObserver(() => { resize(); }).observe(body);
  for (const ev of ['rig', 'sel', 'open', 'anim', 'tick', 'time', 'stop', 'evsel', 'mode']) bus.on(ev, () => draw());
  bus.on('anim', () => fit());
  bus.on('open', () => setTimeout(fit, 10));
  bindCanvas();
  bindTransport();
}
function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  if (view.fitDur !== dur()) fit(); else draw();
}
export function fit() { view.t0 = 0; view.pxms = Math.max(.02, (W - LW - 28) / Math.max(50, dur())); view.fitDur = dur(); draw(); }
const X = (t) => LW + (t - view.t0) * view.pxms;
const T = (x) => view.t0 + (x - LW) / view.pxms;

/* ---------------- lignes ---------------- */
function buildRows() {
  rows = [];
  if (!S.rig || !anim()) return;
  const a = anim();
  rows.push({ kind: 'sum', label: 'Toutes les clés' });
  rows.push({ kind: 'events', label: 'Événements' });
  for (const { p, depth } of treeOrder()) {
    const tr = a.tracks?.[p.name] || [];
    const props = [...new Set(tr.flatMap((k) => Object.keys(k).filter((x) => x !== 't' && x !== 'ease')))];
    rows.push({ kind: 'part', pn: p.name, depth, label: p.name, props, k: kind(p) });
    if (expanded.has(p.name)) for (const pr of props) rows.push({ kind: 'prop', pn: p.name, prop: pr, depth: depth + 1, label: PROP_FR[pr] || pr });
  }
}
const rowY = (i) => RULER + i * RH - view.scroll;
function keysOfRow(r) {
  const a = anim(); if (!a) return [];
  if (r.kind === 'sum') return allKeyTimes().map((t) => ({ t }));
  if (r.kind === 'events') return (a.events || []).map((e) => ({ t: e.t, ev: e }));
  const tr = a.tracks?.[r.pn] || [];
  if (r.kind === 'part') return tr.map((k) => ({ t: k.t, k }));
  return tr.filter((k) => r.prop in k).map((k) => ({ t: k.t, k }));
}
const isSel = (r, t) => S.selKeys.some((s) => Math.abs(s.t - t) < TOL && (r.kind === 'sum' || (s.pn === r.pn && (r.kind === 'part' ? !s.prop || true : s.prop === r.prop || !s.prop))));

/* ---------------- dessin ---------------- */
let rafId = 0;
function draw() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(drawNow); }
function drawNow() {
  if (!g) return;
  g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!S.rig || !anim() || S.mode !== 'animer') {
    g.fillStyle = '#6c7180'; g.font = '500 12px Inter, sans-serif';
    g.fillText(S.mode === 'rig' ? 'Mode Rig : la timeline sert en mode Animer.' : 'Aucune animation.', 16, 30);
    return;
  }
  buildRows();
  if (S.tlView === 'graph') drawGraph(); else drawDope();
  drawRuler();
  drawPlayhead();
}
function drawRuler() {
  const a = anim();
  g.fillStyle = '#111318'; g.fillRect(0, 0, W, RULER);
  g.fillStyle = '#14161c'; g.fillRect(0, 0, LW, RULER);
  g.strokeStyle = '#262a35'; g.beginPath(); g.moveTo(0, RULER - .5); g.lineTo(W, RULER - .5); g.stroke();
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find((s) => s * view.pxms >= 56) || 5000;
  g.font = '500 10px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
  const t0 = Math.max(0, Math.floor(view.t0 / step) * step);
  for (let t = t0; t <= a.dur + step; t += step) {
    const x = X(t); if (x < LW - 2) continue; if (x > W) break;
    g.fillStyle = t > a.dur ? '#3a3f4c' : '#6c7180';
    g.fillRect(Math.round(x), RULER - 8, 1, 8);
    g.fillText(t < 1000 ? t + '' : (t / 1000).toFixed(t % 1000 ? 2 : 0) + ' s', x + 4, RULER / 2 - 1);
    for (let s = 1; s < 5; s++) { const xs = X(t + (step * s) / 5); if (xs > LW && xs < W && t + (step * s) / 5 <= a.dur) { g.fillStyle = '#2d313d'; g.fillRect(Math.round(xs), RULER - 4, 1, 4); } }
  }
  // images à 60 i/s quand on zoome
  if (view.pxms * (1000 / 60) > 9) {
    g.fillStyle = '#2a2e3a';
    for (let f = Math.ceil(view.t0 / (1000 / 60)); ; f++) { const x = X(f * 1000 / 60); if (x > W || f * 1000 / 60 > a.dur) break; if (x > LW) g.fillRect(Math.round(x), RULER - 3, 1, 3); }
  }
  g.fillStyle = '#6c7180'; g.font = '600 10px Inter, sans-serif';
  g.fillText(`${S.anim} · ${a.dur} ms${a.loop ? ' · boucle' : ''}`, 12, RULER / 2);
}
function drawPlayhead() {
  const x = Math.round(X(S.t)) + .5;
  if (x < LW) return;
  g.strokeStyle = '#ffd27a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, RULER - 2); g.lineTo(x, H); g.stroke();
  g.fillStyle = '#ffd27a';
  g.beginPath(); g.moveTo(x - 6, 3); g.lineTo(x + 6, 3); g.lineTo(x + 6, RULER - 10); g.lineTo(x, RULER - 3); g.lineTo(x - 6, RULER - 10); g.closePath(); g.fill();
  g.lineWidth = 1;
}
function diamond(x, y, s, fill, stroke, sw = 1.5) {
  g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = sw; g.stroke(); }
}
function drawDope() {
  const a = anim();
  // fond des lignes
  rows.forEach((r, i) => {
    const y = rowY(i); if (y + RH < RULER || y > H) return;
    const sel = (r.kind === 'part' || r.kind === 'prop') && S.sel.includes(r.pn);
    g.fillStyle = sel ? 'rgba(86,199,240,.07)' : i % 2 ? '#15171d' : '#14161c';
    g.fillRect(0, y, W, RH);
  });
  // zone après la fin
  const xe = X(a.dur);
  if (xe < W) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(Math.max(LW, xe), RULER, W - xe, H); }
  // grille verticale légère
  // lignes et clés
  rows.forEach((r, i) => {
    const y = rowY(i); if (y + RH < RULER || y > H) return;
    const cy = y + RH / 2;
    // étiquette
    g.save(); g.beginPath(); g.rect(0, y, LW, RH); g.clip();
    const ind = 12 + (r.depth || 0) * 12;
    if (r.kind === 'part' && r.props.length) {
      g.strokeStyle = '#6c7180'; g.lineWidth = 1.4; g.beginPath();
      if (expanded.has(r.pn)) { g.moveTo(ind - 4, cy - 2); g.lineTo(ind, cy + 2); g.lineTo(ind + 4, cy - 2); } else { g.moveTo(ind - 2, cy - 4); g.lineTo(ind + 2, cy); g.lineTo(ind - 2, cy + 4); }
      g.stroke();
    }
    g.font = r.kind === 'prop' ? '500 11px Inter, sans-serif' : r.kind === 'part' ? '600 12px Inter, sans-serif' : '650 10.5px Inter, sans-serif';
    g.fillStyle = r.kind === 'prop' ? (PROP_COL[r.prop] || '#a8acb8') : r.kind === 'part' ? (S.sel.includes(r.pn) ? '#e9f7fd' : r.props.length ? '#d6d8de' : '#6c7180') : '#8a8f9c';
    g.textBaseline = 'middle';
    g.fillText(r.kind === 'sum' || r.kind === 'events' ? r.label.toUpperCase() : r.label, ind + 10, cy);
    g.restore();
    g.fillStyle = '#262a35'; g.fillRect(LW - 1, y, 1, RH);
    // clés
    g.save(); g.beginPath(); g.rect(LW, y, W - LW, RH); g.clip();
    const ks = keysOfRow(r);
    if (r.kind === 'events') {
      const groupes = new Map();
      for (const { t, ev } of ks) { if (!groupes.has(t)) groupes.set(t, []); groupes.get(t).push(ev); }
      for (const [t, evs] of groupes) {
        const x = X(t), on = evs.includes(S.selEvent);
        g.fillStyle = on ? '#8ff0c8' : '#52d6a0';
        g.beginPath(); g.moveTo(x, cy - 7); g.lineTo(x + 8, cy - 3); g.lineTo(x, cy + 1); g.closePath(); g.fill();
        g.fillRect(x - .5, cy - 7, 1.5, 14);
        g.font = '500 10px Inter, sans-serif'; g.fillStyle = on ? '#e6fff4' : '#8fcfb5';
        g.fillText(evs.map((ev) => ev.name || (ev.emit ? '✦ ' + ev.emit : ev.rate ? '≈ ' + ev.rate.join(' ') : '•')).join(' · '), x + 11, cy - 1);
      }
    } else {
      // segments entre clés (maintien = trait plein, mouvement = trait fin)
      if (ks.length > 1 && r.kind !== 'sum') {
        g.strokeStyle = r.kind === 'prop' ? (PROP_COL[r.prop] || '#888') + '55' : 'rgba(245,185,66,.22)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(X(ks[0].t), cy); g.lineTo(X(ks[ks.length - 1].t), cy); g.stroke();
      }
      for (const { t, k } of ks) {
        const x = X(t), sel = isSel(r, t);
        const col = r.kind === 'prop' ? PROP_COL[r.prop] || '#f5b942' : r.kind === 'sum' ? '#c9ccd4' : '#f5b942';
        const lin = k && r.kind === 'prop' && easeOf(k, r.prop) === 'linear';
        const stp = k && r.kind === 'prop' && easeOf(k, r.prop) === 'step';
        if (stp) { g.fillStyle = sel ? '#fff' : col; g.fillRect(x - 4.5, cy - 4.5, 9, 9); if (sel) { g.strokeStyle = '#56c7f0'; g.lineWidth = 2; g.strokeRect(x - 4.5, cy - 4.5, 9, 9); } }
        else diamond(x, cy, r.kind === 'sum' ? 4.6 : 5.6, sel ? '#ffffff' : lin ? '#ff6b6b' : col, sel ? '#56c7f0' : '#0d0e12', sel ? 2 : 1.2);
      }
    }
    g.restore();
  });
  // rectangle de sélection
  if (drag && drag.kind === 'box') {
    g.fillStyle = 'rgba(86,199,240,.1)'; g.strokeStyle = 'rgba(86,199,240,.7)'; g.lineWidth = 1;
    const x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    g.fillRect(x0, y0, w, h); g.strokeRect(x0 + .5, y0 + .5, w, h);
  }
}

/* ---------------- éditeur de courbes ---------------- */
let graphCurves = [];
function drawGraph() {
  const a = anim();
  g.fillStyle = '#121419'; g.fillRect(0, RULER, W, H);
  const pn = S.sel[0];
  graphCurves = [];
  // colonne des propriétés
  g.fillStyle = '#14161c'; g.fillRect(0, RULER, LW, H);
  g.fillStyle = '#262a35'; g.fillRect(LW - 1, RULER, 1, H);
  if (!pn || !a.tracks?.[pn]) {
    g.fillStyle = '#6c7180'; g.font = '500 12px Inter, sans-serif';
    g.fillText(pn ? `« ${pn} » n'est pas animée ici.` : 'Choisis une pièce animée pour voir ses courbes.', LW + 16, RULER + 28);
    return;
  }
  const tr = a.tracks[pn];
  let props = [...new Set(tr.flatMap((k) => Object.keys(k).filter((x) => !['t', 'ease', 'tint', 'ffd', 'z', 'visible', 'frame'].includes(x))))];
  if (S.graphProps && S.graphProps.length) props = props.filter((p) => S.graphProps.includes(p)) .concat([]);
  const top = RULER + 14, bot = H - 14;
  g.font = '650 10.5px Inter, sans-serif'; g.fillStyle = '#8a8f9c'; g.textBaseline = 'middle';
  g.fillText(pn.toUpperCase(), 12, RULER + 16);
  const allProps = [...new Set(tr.flatMap((k) => Object.keys(k).filter((x) => !['t', 'ease', 'tint', 'ffd', 'z', 'visible', 'frame'].includes(x))))];
  allProps.forEach((p, i) => {
    const on = props.includes(p), y = RULER + 38 + i * 22;
    g.fillStyle = on ? PROP_COL[p] || '#ccc' : '#3a3f4c'; g.fillRect(12, y - 5, 10, 10);
    g.fillStyle = on ? '#d6d8de' : '#6c7180'; g.font = '500 11.5px Inter, sans-serif'; g.fillText(PROP_FR[p] || p, 30, y);
    graphCurves.push({ legend: true, prop: p, y });
  });
  // repères horizontaux
  g.strokeStyle = '#1d2029'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = Math.round(top + (bot - top) * i / 4) + .5; g.beginPath(); g.moveTo(LW, y); g.lineTo(W, y); g.stroke(); }
  const xe = X(a.dur);
  if (xe < W) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(Math.max(LW, xe), RULER, W - xe, H); }
  g.save(); g.beginPath(); g.rect(LW, RULER, W - LW, H - RULER); g.clip();
  for (const p of props) {
    const ks = tr.filter((k) => p in k);
    if (!ks.length) continue;
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s <= 160; s++) { const v = sampleTrack(tr, p, (a.dur * s) / 160); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    ks.forEach((k) => { lo = Math.min(lo, k[p]); hi = Math.max(hi, k[p]); });
    if (hi - lo < 1e-6) { hi += .5; lo -= .5; }
    const padv = (hi - lo) * .12; lo -= padv; hi += padv;
    const Yv = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    const Vy = (y) => lo + ((bot - y) / (bot - top)) * (hi - lo);
    const col = PROP_COL[p] || '#ccc';
    g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
    const n = Math.max(80, Math.round((W - LW) / 3));
    for (let s = 0; s <= n; s++) { const t = view.t0 + ((W - LW) / view.pxms) * s / n; const v = sampleTrack(tr, p, Math.min(a.dur, Math.max(0, t))); const x = X(t), y = Yv(v); s ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const curve = { prop: p, ks, Yv, Vy, lo, hi };
    graphCurves.push(curve);
    // poignées de la clé choisie (courbe du segment d'arrivée)
    ks.forEach((k, i) => {
      const x = X(k.t), y = Yv(k[p]);
      const sel = S.selKeys.some((s) => s.pn === pn && Math.abs(s.t - k.t) < TOL && (!s.prop || s.prop === p));
      if (sel && i > 0) {
        const k0 = ks[i - 1], dv = k[p] - k0[p];
        const e = easeOf(k, p) ?? 'inOutQuad';
        const bz = Array.isArray(e) ? e : NAMED_BEZ[e];
        if (bz && Math.abs(dv) > 1e-9) {
          const h1 = [X(k0.t + bz[0] * (k.t - k0.t)), Yv(k0[p] + bz[1] * dv)], h2 = [X(k0.t + bz[2] * (k.t - k0.t)), Yv(k0[p] + bz[3] * dv)];
          g.strokeStyle = '#56c7f0'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(X(k0.t), Yv(k0[p])); g.lineTo(...h1); g.moveTo(x, y); g.lineTo(...h2); g.stroke();
          for (const [hx, hy] of [h1, h2]) { g.fillStyle = '#56c7f0'; g.beginPath(); g.arc(hx, hy, 5, 0, 7); g.fill(); }
          curve.handles = { k, k0, h1, h2, dv };
        }
      }
      diamond(x, y, 6, sel ? '#fff' : col, sel ? '#56c7f0' : '#0d0e12', sel ? 2 : 1.2);
    });
  }
  g.restore();
}

/* ---------------- interactions ---------------- */
function hitKey(x, y) {
  if (S.tlView === 'graph') {
    for (const c of graphCurves) {
      if (c.legend) continue;
      if (c.handles) {
        for (const [i, h] of [[1, c.handles.h1], [2, c.handles.h2]]) if (Math.hypot(h[0] - x, h[1] - y) < 8) return { handle: i, curve: c };
      }
      for (const k of c.ks) if (Math.hypot(X(k.t) - x, c.Yv(k[c.prop]) - y) < 8) return { graphKey: k, curve: c };
    }
    return null;
  }
  const i = Math.floor((y - RULER + view.scroll) / RH), r = rows[i];
  if (!r) return null;
  const ks = keysOfRow(r);
  let best = null, bd = 7;
  for (const kk of ks) { const d = Math.abs(X(kk.t) - x); if (d < bd) { bd = d; best = kk; } }
  return best ? { row: r, ...best } : { row: r };
}
function selectionFrom(r, t) {
  if (r.kind === 'sum') return (anim().tracks ? Object.entries(anim().tracks) : []).filter(([, tr]) => tr.some((k) => Math.abs(k.t - t) < TOL)).map(([pn]) => ({ pn, t }));
  if (r.kind === 'part') return [{ pn: r.pn, t }];
  if (r.kind === 'prop') return [{ pn: r.pn, t, prop: r.prop }];
  return [];
}

function bindCanvas() {
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const t = T(e.offsetX);
      view.pxms = Math.max(.01, Math.min(20, view.pxms * Math.exp(-e.deltaY * .01)));
      view.t0 = Math.max(-50, t - (e.offsetX - LW) / view.pxms);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.t0 = Math.max(-50, view.t0 + (e.deltaX || e.deltaY) / view.pxms);
    } else {
      const max = Math.max(0, rows.length * RH - (H - RULER) + 20);
      view.scroll = Math.max(0, Math.min(max, view.scroll + e.deltaY));
    }
    draw();
  }, { passive: false });
  cv.addEventListener('dblclick', (e) => {
    const x = e.offsetX, y = e.offsetY;
    if (y < RULER || x < LW || S.tlView === 'graph') return;
    const h = hitKey(x, y); if (!h || !h.row) return;
    const t = snapT(T(x));
    if (h.row.kind === 'events') {
      const ev = { t, name: 'son' };
      edit('événement', () => { (anim().events ||= []).push(ev); }, { merge: false });
      S.selEvent = ev; S.sel = []; bus.emit('evsel');
    } else if (h.row.kind === 'part' || h.row.kind === 'prop') { S.t = t; keyAll([h.row.pn], t); bus.emit('time'); }
  });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const h = hitKey(e.offsetX, e.offsetY);
    if (h && h.t !== undefined && h.row && h.row.kind !== 'events') {
      if (!isSel(h.row, h.t)) { S.selKeys = selectionFrom(h.row, h.t); S.t = h.t; bus.emit('time'); bus.emit('sel'); }
      keyMenu(e.clientX, e.clientY);
    } else if (h && h.ev) {
      menu(e.clientX, e.clientY, [{ label: 'Supprimer l\'événement', icon: 'trash', danger: true, fn: () => { edit('supprimer l\'événement', () => { anim().events.splice(anim().events.indexOf(h.ev), 1); }, { merge: false }); S.selEvent = null; bus.emit('evsel'); } }]);
    } else keyMenu(e.clientX, e.clientY);
  });
  cv.addEventListener('pointerdown', (e) => {
    if (!anim() || S.mode !== 'animer') return;
    cv.setPointerCapture(e.pointerId);
    const x = e.offsetX, y = e.offsetY;
    breakMerge();
    if (y < RULER && x > LW) { drag = { kind: 'scrub' }; scrub(x); return; }
    // colonne des étiquettes
    if (x < LW) {
      if (S.tlView === 'graph') {
        const c = graphCurves.find((q) => q.legend && Math.abs(q.y - y) < 10);
        if (c) { const all = graphCurves.filter((q) => q.legend).map((q) => q.prop); let cur = S.graphProps && S.graphProps.length ? [...S.graphProps] : [...all]; cur = cur.includes(c.prop) ? cur.filter((p) => p !== c.prop) : [...cur, c.prop]; S.graphProps = cur.length === all.length ? [] : cur; draw(); }
        return;
      }
      const i = Math.floor((y - RULER + view.scroll) / RH), r = rows[i]; if (!r) return;
      if (r.kind === 'part') {
        const ind = 12 + (r.depth || 0) * 12;
        if (x < ind + 8 && r.props.length) { expanded.has(r.pn) ? expanded.delete(r.pn) : expanded.add(r.pn); draw(); return; }
        S.sel = e.shiftKey ? (S.sel.includes(r.pn) ? S.sel.filter((n) => n !== r.pn) : [...S.sel, r.pn]) : [r.pn]; bus.emit('sel');
      } else if (r.kind === 'prop') { S.sel = [r.pn]; S.easeProp = r.prop; bus.emit('sel'); }
      return;
    }
    const h = hitKey(x, y);
    if (S.tlView === 'graph') return graphDown(e, h, x, y);
    if (h && h.ev) {
      S.selEvent = h.ev; S.selKeys = []; bus.emit('evsel');
      const ev = h.ev, t0 = ev.t;
      drag = { kind: 'event', move: (xx) => { const t = snapT(T(xx)); edit('déplacer l\'événement', () => { ev.t = t; }); S.t = t; bus.emit('time'); }, t0 };
      return;
    }
    if (h && h.t !== undefined && h.row) {
      const r = h.row;
      if (e.shiftKey) {
        const add = selectionFrom(r, h.t);
        if (isSel(r, h.t)) S.selKeys = S.selKeys.filter((s) => !add.some((a2) => a2.pn === s.pn && Math.abs(a2.t - s.t) < TOL));
        else S.selKeys = [...S.selKeys, ...add];
      } else if (!isSel(r, h.t)) S.selKeys = selectionFrom(r, h.t);
      if (r.pn) { if (!S.sel.includes(r.pn)) S.sel = [r.pn]; if (r.prop) S.easeProp = r.prop; }
      S.selEvent = null;
      S.t = h.t; bus.emit('sel'); bus.emit('time');
      startMove(x, e.altKey);
      return;
    }
    // vide : sélection au rectangle
    if (!e.shiftKey) S.selKeys = [];
    drag = { kind: 'box', x0: x, y0: y, x1: x, y1: y, base: [...S.selKeys] };
    if (e.detail === 1) scrub(x);
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    const x = e.offsetX, y = e.offsetY;
    if (!drag) { const h = hitKey(x, y); cv.style.cursor = h && (h.t !== undefined || h.handle || h.graphKey) ? 'pointer' : y < RULER ? 'col-resize' : 'default'; return; }
    if (drag.kind === 'scrub') scrub(x);
    else if (drag.kind === 'box') {
      drag.x1 = x; drag.y1 = y;
      const tA = T(Math.min(drag.x0, x)), tB = T(Math.max(drag.x0, x));
      const iA = Math.floor((Math.min(drag.y0, y) - RULER + view.scroll) / RH), iB = Math.floor((Math.max(drag.y0, y) - RULER + view.scroll) / RH);
      const sel = [...drag.base];
      for (let i = Math.max(0, iA); i <= Math.min(rows.length - 1, iB); i++) for (const kk of keysOfRow(rows[i])) if (kk.t >= tA && kk.t <= tB && rows[i].kind !== 'events') sel.push(...selectionFrom(rows[i], kk.t));
      S.selKeys = sel; draw();
    } else if (drag.move) drag.move(x, y, e);
  });
  const up = () => { if (drag && drag.end) drag.end(); if (drag && drag.kind === 'box') bus.emit('sel'); drag = null; breakMerge(); draw(); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
}
function scrub(x) {
  S.playing = false; bus.emit('playstate');
  S.t = snapT(T(x)); bus.emit('time');
}

/* déplacer (ou dupliquer avec Alt) les clés choisies */
function startMove(x0, dup) {
  const a = anim();
  const snapTracks = JSON.stringify(a.tracks || {});
  const sel0 = S.selKeys.map((s) => ({ ...s }));
  let lastDt = 0;
  drag = {
    kind: 'keys',
    move(x) {
      const dt = snapT(T(x)) - snapT(T(x0));
      if (dt === lastDt) return;
      lastDt = dt;
      edit(dup ? 'dupliquer des clés' : 'déplacer des clés', () => {
        a.tracks = JSON.parse(snapTracks);
        moveSel(a, sel0, dt, dup);
      });
      S.selKeys = sel0.map((s) => ({ ...s, t: Math.max(0, Math.min(a.dur, s.t + dt)) }));
      S.t = Math.max(0, Math.min(a.dur, (sel0[0]?.t || 0) + dt));
      bus.emit('time');
    },
  };
}
function moveSel(a, sel, dt, dup) {
  // on retire d'abord toutes les valeurs déplacées, puis on les repose
  const moving = [];
  for (const s of sel) {
    const tr = a.tracks[s.pn]; if (!tr) continue;
    const k = tr.find((q) => Math.abs(q.t - s.t) < TOL); if (!k) continue;
    const props = s.prop ? [s.prop] : Object.keys(k).filter((x) => x !== 't' && x !== 'ease');
    const vals = {}; for (const p of props) vals[p] = k[p];
    const ease = {}; for (const p of props) { const e2 = easeOf(k, p); if (e2 !== undefined) ease[p] = e2; }
    moving.push({ pn: s.pn, t: Math.max(0, Math.min(a.dur, s.t + dt)), vals, ease });
    if (!dup) {
      for (const p of props) delete k[p];
      if (k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease)) for (const p of props) delete k.ease[p];
      if (!Object.keys(k).some((x) => x !== 't' && x !== 'ease')) tr.splice(tr.indexOf(k), 1);
    }
  }
  for (const m of moving) {
    const tr = a.tracks[m.pn] ||= [];
    let k = tr.find((q) => Math.abs(q.t - m.t) < TOL);
    if (!k) { k = { t: Math.round(m.t) }; tr.push(k); }
    const had = Object.keys(k).some((x) => x !== 't' && x !== 'ease');
    Object.assign(k, JSON.parse(JSON.stringify(m.vals)));
    const eases = Object.values(m.ease);
    const uni = eases.length && eases.every((e) => JSON.stringify(e) === JSON.stringify(eases[0])) && Object.keys(m.ease).length === Object.keys(m.vals).length;
    if (!had && uni) k.ease = eases[0];
    else if (Object.keys(m.ease).length) {
      if (!(k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease))) k.ease = k.ease !== undefined ? { '*': k.ease } : {};
      Object.assign(k.ease, m.ease);
    }
    tr.sort((p, q) => p.t - q.t);
  }
}

/* éditeur de courbes : glisser une clé (temps + valeur) ou une poignée */
function graphDown(e, h, x, y) {
  const pn = S.sel[0], a = anim();
  if (!h) { S.selKeys = []; scrub(x); drag = { kind: 'scrub' }; draw(); return; }
  if (h.handle) {
    const { k, k0, dv } = h.curve.handles, p = h.curve.prop;
    const e0 = easeOf(k, p) ?? 'inOutQuad';
    let bz = Array.isArray(e0) ? [...e0] : [...(NAMED_BEZ[e0] || [.25, .1, .25, 1])];
    drag = {
      kind: 'handle',
      move(xx, yy) {
        const u = Math.max(0, Math.min(1, (T(xx) - k0.t) / Math.max(1, k.t - k0.t)));
        const v = (h.curve.Vy(yy) - k0[p]) / dv;
        if (h.handle === 1) { bz[0] = +u.toFixed(3); bz[1] = +Math.max(-2, Math.min(3, v)).toFixed(3); } else { bz[2] = +u.toFixed(3); bz[3] = +Math.max(-2, Math.min(3, v)).toFixed(3); }
        edit('courbe', () => {
          const props = Object.keys(k).filter((q) => q !== 't' && q !== 'ease');
          if (props.length === 1 && !(k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease))) k.ease = [...bz];
          else { if (!(k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease))) k.ease = { '*': k.ease ?? 'inOutQuad' }; k.ease[p] = [...bz]; }
        });
      },
    };
    return;
  }
  if (h.graphKey) {
    const k = h.graphKey, p = h.curve.prop;
    S.selKeys = [{ pn, t: k.t, prop: p }]; S.easeProp = p; S.t = k.t; bus.emit('sel'); bus.emit('time');
    const t0 = k.t, v0 = k[p], y0 = y, x0 = x, curve = h.curve;
    drag = {
      kind: 'gkey',
      move(xx, yy, ev) {
        const dt = ev.shiftKey ? 0 : snapT(T(xx)) - snapT(T(x0));
        const dv = ev.altKey ? 0 : curve.Vy(yy) - curve.Vy(y0);
        edit('clé (courbe)', () => { k[p] = +(v0 + dv).toFixed(4); if (dt) { const nt = Math.max(0, Math.min(a.dur, t0 + dt)); k.t = nt; a.tracks[pn].sort((q, r) => q.t - r.t); } });
        S.t = k.t; S.selKeys = [{ pn, t: k.t, prop: p }];
        bus.emit('time');
      },
    };
  }
}

/* ---------------- menu des clés, copier / coller ---------------- */
function keyMenu(x, y) {
  const has = S.selKeys.length > 0;
  menu(x, y, [
    { head: has ? `${S.selKeys.length} clé(s)` : 'Timeline' },
    { label: 'Courbe…', icon: 'path', disabled: !has, fn: () => easeMenu(x, y) },
    { label: 'Copier', icon: 'copy', key: '⌘C', disabled: !has, fn: copyKeys },
    { label: `Coller à ${Math.round(S.t)} ms`, icon: 'copy', key: '⌘V', disabled: !clipboard, fn: pasteKeys },
    { label: 'Inverser le temps', icon: 'loop', disabled: S.selKeys.length < 2, fn: reverseKeys },
    '-',
    { label: 'Supprimer', icon: 'trash', key: '⌫', danger: true, disabled: !has, fn: deleteKeys },
  ]);
}
function easeMenu(x, y) {
  menu(x, y, PRESETS.map(([lab, e]) => ({ label: lab, fn: () => setEaseSel(e) })));
}
export function setEaseSel(e) {
  const a = anim();
  edit('courbe', () => {
    for (const s of S.selKeys) {
      const k = a.tracks?.[s.pn]?.find((q) => Math.abs(q.t - s.t) < TOL); if (!k) continue;
      if (s.prop && Object.keys(k).filter((q) => q !== 't' && q !== 'ease').length > 1) {
        if (!(k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease))) k.ease = { '*': k.ease ?? 'inOutQuad' };
        k.ease[s.prop] = e;
      } else { k.ease = e; if (e === 'inOutQuad') delete k.ease; }
    }
  }, { merge: false });
}
export function deleteKeys() {
  if (S.selEvent) { const a = anim(); edit('supprimer l\'événement', () => { a.events.splice(a.events.indexOf(S.selEvent), 1); }, { merge: false }); S.selEvent = null; bus.emit('evsel'); return; }
  if (!S.selKeys.length) return;
  const a = anim();
  edit('supprimer des clés', () => {
    for (const s of S.selKeys) {
      const tr = a.tracks?.[s.pn]; if (!tr) continue;
      const k = tr.find((q) => Math.abs(q.t - s.t) < TOL); if (!k) continue;
      if (s.prop) { delete k[s.prop]; if (k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease)) delete k.ease[s.prop]; if (!Object.keys(k).some((q) => q !== 't' && q !== 'ease')) tr.splice(tr.indexOf(k), 1); }
      else tr.splice(tr.indexOf(k), 1);
      if (!tr.length) delete a.tracks[s.pn];
    }
  }, { merge: false });
  S.selKeys = []; bus.emit('sel');
}
export function copyKeys() {
  if (!S.selKeys.length) return;
  const a = anim(), t0 = Math.min(...S.selKeys.map((s) => s.t));
  clipboard = S.selKeys.map((s) => {
    const k = a.tracks?.[s.pn]?.find((q) => Math.abs(q.t - s.t) < TOL); if (!k) return null;
    const c = JSON.parse(JSON.stringify(k));
    if (s.prop) { for (const q of Object.keys(c)) if (q !== 't' && q !== 'ease' && q !== s.prop) delete c[q]; }
    return { pn: s.pn, dt: s.t - t0, k: c };
  }).filter(Boolean);
  toast(`${clipboard.length} clé(s) copiée(s)`);
}
export function pasteKeys() {
  if (!clipboard) return;
  const a = anim();
  const targets = S.sel.length === 1 && new Set(clipboard.map((c) => c.pn)).size === 1 ? S.sel[0] : null;
  edit('coller des clés', () => {
    for (const c of clipboard) {
      const pn = targets || c.pn; if (!part(pn)) continue;
      const tr = a.tracks[pn] ||= [];
      const t = Math.min(a.dur, Math.round(S.t + c.dt));
      let k = tr.find((q) => Math.abs(q.t - t) < TOL);
      if (!k) { k = { t }; tr.push(k); }
      const v = JSON.parse(JSON.stringify(c.k)); delete v.t;
      Object.assign(k, v);
      tr.sort((p, q) => p.t - q.t);
    }
  }, { merge: false });
}
function reverseKeys() {
  const a = anim(), ts = S.selKeys.map((s) => s.t), lo = Math.min(...ts), hi = Math.max(...ts);
  edit('inverser', () => {
    for (const pn of new Set(S.selKeys.map((s) => s.pn))) {
      const tr = a.tracks[pn]; if (!tr) continue;
      for (const k of tr) if (k.t >= lo - TOL && k.t <= hi + TOL) k.t = Math.round(lo + hi - k.t);
      tr.sort((p, q) => p.t - q.t);
    }
  }, { merge: false });
  S.selKeys = S.selKeys.map((s) => ({ ...s, t: Math.round(lo + hi - s.t) }));
}
export function jumpKey(dir) {
  const ts = allKeyTimes(S.sel.length ? S.sel : null);
  const t = dir > 0 ? ts.find((x) => x > S.t + TOL) : [...ts].reverse().find((x) => x < S.t - TOL);
  if (t !== undefined) { S.playing = false; bus.emit('playstate'); S.t = t; bus.emit('time'); }
}

/* ---------------- transport ---------------- */
function bindTransport() {
  const $ = (id) => document.getElementById(id);
  $('tPlay').onclick = () => togglePlay();
  $('tStart').onclick = () => { S.t = 0; bus.emit('time'); if (S.playing) bus.emit('replay'); };
  $('tEnd').onclick = () => { S.playing = false; bus.emit('playstate'); S.t = dur(); bus.emit('time'); };
  $('tPrevKey').onclick = () => jumpKey(-1);
  $('tNextKey').onclick = () => jumpKey(1);
  $('tLoop').onclick = () => { S.loop = !S.loop; $('tLoop').classList.toggle('on', S.loop); if (S.playing) bus.emit('replay'); };
  $('tSpeed').onchange = (e) => { S.speed = +e.target.value; };
  $('tSnap').onchange = (e) => { S.snap = +e.target.value; };
  $('tAuto').onclick = () => { S.autokey = !S.autokey; $('tAuto').classList.toggle('on', S.autokey); };
  $('tKey').onclick = () => keyAll();
  $('tTime').onchange = (e) => { const v = parseFloat(e.target.value.replace(',', '.')); if (Number.isFinite(v)) { S.t = Math.max(0, Math.min(dur(), v)); bus.emit('time'); } };
  $('tDur').onchange = (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0 && anim()) edit('durée', () => { anim().dur = Math.round(v); }, { structure: true, merge: false }); };
  for (const inp of [$('tTime'), $('tDur')]) inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
  document.querySelectorAll('#tView button').forEach((b) => (b.onclick = () => {
    S.tlView = b.dataset.v; document.querySelectorAll('#tView button').forEach((x) => x.classList.toggle('on', x === b)); draw();
  }));
  $('tLayer').onchange = (e) => { S.layer = e.target.value; bus.emit('rig', { structure: false, label: 'superposer' }); };
  const upd = () => {
    $('tTime').value = Math.round(S.t); $('tDur').value = anim() ? anim().dur : 0;
    $('tPlay').innerHTML = `<span class="ic">${S.playing ? '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>'}</span>`;
  };
  for (const ev of ['tick', 'time', 'playstate', 'stop', 'rig', 'anim', 'open']) bus.on(ev, upd);
  const fillLayer = () => {
    const s = $('tLayer'); s.innerHTML = '';
    s.append(el('option', { value: '', text: 'Superposer : aucune' }));
    for (const n of Object.keys(S.rig?.anims || {})) if (n !== S.anim) s.append(el('option', { value: n, text: 'Superposer : ' + n, selected: n === S.layer }));
  };
  bus.on('open', fillLayer); bus.on('anim', fillLayer); bus.on('rig', fillLayer);
  // redimensionner la timeline
  $('tlResize').onpointerdown = (e) => {
    const y0 = e.clientY, h0 = $('timeline').getBoundingClientRect().height;
    $('tlResize').setPointerCapture(e.pointerId);
    const mv = (ev) => { const h = Math.max(140, Math.min(innerHeight - 220, h0 - (ev.clientY - y0))); document.documentElement.style.setProperty('--tl-h', h + 'px'); };
    const up2 = () => { $('tlResize').removeEventListener('pointermove', mv); $('tlResize').removeEventListener('pointerup', up2); };
    $('tlResize').addEventListener('pointermove', mv); $('tlResize').addEventListener('pointerup', up2);
  };
}
export function togglePlay() {
  if (!anim() || S.mode !== 'animer') return;
  S.playing = !S.playing;
  if (!S.playing) S.t = snapT(S.t);
  bus.emit('playstate');
}
