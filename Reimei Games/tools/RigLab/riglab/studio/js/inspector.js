/* INSPECTEUR : propriétés de la pièce choisie (animables avec losange de
   clé), réglages du rig, courbe de la clé, animation et événements. */
import { S, bus, part, anim, edit, setKey, setKeys, delKeyProp, valueAt, keyAt, isAnimated, kind, KIND_LABEL, KIND_ICON, track, TOL, easeFor } from './store.js';
import { el, section, numRow, selRow, switchRow, colorRow, textRow, toast, normHex, svg, busy, busyStart, busyEnd } from './ui.js';
import { renamePart } from './tree.js';
import { easeFn, rigFeatures } from '../../engine/symbol-rig.js';
import { resetFfd } from './viewport.js';

const D = 180 / Math.PI;
export const PRESETS = [
  ['Doux', 'inOutQuad'], ['Sinus', 'inOutSine'], ['Entrée', [.22, 1.4, .4, 1]], ['Impact', [.2, 1.8, .4, 1]], ['Glisse', [.12, .72, .12, 1]],
  ['Décélère', 'outCubic'], ['Accélère', 'inCubic'], ['Sortie', [.4, 0, 1, 1]], ['Dépasse', 'outBack'], ['Gros dép.', 'outBackBig'],
  ['Rebond', 'outBounce'], ['Élastique', 'outElastic'], ['Anticipe', 'inBack'], ['Linéaire', 'linear'], ['Pas à pas', 'step'],
];
const sameEase = (a, b) => JSON.stringify(a ?? 'inOutQuad') === JSON.stringify(b ?? 'inOutQuad');

export function initInspector() {
  for (const ev of ['rig', 'sel', 'open', 'anim', 'mode', 'evsel']) bus.on(ev, render);
  bus.on('time', () => { if (!S.playing) render(); });
  bus.on('stop', render);
}

let raf = 0;
function render() { if (busy.v) { busy.after = render; return; } cancelAnimationFrame(raf); raf = requestAnimationFrame(renderNow); }
function renderNow() {
  const box = document.getElementById('insp');
  const scroll = box.parentElement.scrollTop;
  box.innerHTML = '';
  if (!S.rig) { box.append(el('div', { class: 'empty', text: 'Ouvre un symbole pour commencer.' })); return; }
  if (S.mode === 'apercu') return;
  if (S.mode === 'decoupe') { box.append(guideDecoupe()); return; }
  if (S.selEvent && S.mode === 'animer') box.append(...eventPanel());
  else if (S.sel.length) box.append(...partPanel(part(S.sel[0])));
  else box.append(...(S.mode === 'rig' ? rigPanel() : animPanel()));
  box.parentElement.scrollTop = scroll;
}

/* ---------------- en-tête ---------------- */
function head(p) {
  const k = kind(p);
  const name = el('input', { value: p.name, spellcheck: 'false', title: 'Renommer' });
  name.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); };
  name.onchange = () => { name.value = p.name; renamePart(p); };
  const sub = el('div', { class: 'ins-sub' }, el('span', { class: 'tag', text: KIND_LABEL[k] }), p.parent ? el('span', { class: 'tag', text: '↳ ' + p.parent }) : null,
    S.sel.length > 1 ? el('span', { class: 'tag', text: `+${S.sel.length - 1} autre(s)` }) : null,
    p.shine ? el('span', { class: 'tag v3', text: 'reflet' }) : null, p.clip ? el('span', { class: 'tag v3', text: 'découpée par ' + p.clip }) : null);
  return el('div', { class: 'ins-head' }, el('div', { class: 'ins-title' }, el('span', { class: 'ty', html: svg(KIND_ICON[k]) }), name), sub);
}

/* ligne animable : valeur au temps courant, losange de clé */
function animRow(pn, prop, label, o = {}) {
  const toUI = o.toUI || ((v) => v), fromUI = o.fromUI || ((v) => v);
  const k = keyAt(pn);
  const keyed = !!(k && prop in k);
  const state = keyed ? 'keyed' : isAnimated(pn, prop) ? 'animated' : '';
  const canAnim = S.mode === 'animer' && anim();
  return numRow({
    label, value: toUI(valueAt(pn, prop)), step: o.step ?? .01, min: o.min, max: o.max, digits: o.digits,
    keyState: canAnim ? state : '',
    onInput: (v) => canAnim && apply(pn, prop, +fromUI(v).toFixed(5)),
    onChange: (v) => canAnim && apply(pn, prop, +fromUI(v).toFixed(5)),
    onKey: canAnim ? () => (keyed ? delKeyProp(pn, prop) : setKey(pn, prop, +(+valueAt(pn, prop)).toFixed(5))) : null,
  });
}
function apply(pn, prop, v) {
  const targets = S.sel.length > 1 && S.sel.includes(pn) ? S.sel : [pn];
  const k = keyAt(pn);
  if (!S.autokey && !(k && prop in k)) { toast('Auto-clé coupée : clique le losange pour poser la clé'); return; }
  edit('régler ' + prop, () => {
    const r = Math.round(S.t);
    for (const n of targets) {
      const tr = track(n, true);
      let q = tr.find((x) => Math.abs(x.t - r) < TOL);
      if (!q) { q = { t: r }; tr.push(q); tr.sort((a, b) => a.t - b.t); }
      q[prop] = v;
    }
  });
}

/* ---------------- pièce (mode Animer) ---------------- */
function partPanel(p) {
  if (!p) return [];
  const out = [head(p)];
  const pn = p.name, k = kind(p);
  if (S.mode === 'rig') return [...out, ...rigPartPanel(p)];
  if (!anim()) return [...out, el('div', { class: 'empty', text: 'Crée une animation pour animer cette pièce.' })];
  out.push(section('tr', 'Transformation', (b) => {
    b.append(animRow(pn, 'rot', 'Rotation °', { toUI: (v) => v * D, fromUI: (v) => v / D, step: .5, digits: 1 }));
    b.append(animRow(pn, 'x', 'Position X', { step: 1, digits: 1 }), animRow(pn, 'y', 'Position Y', { step: 1, digits: 1 }));
    b.append(animRow(pn, 'sx', 'Échelle X', { step: .01 }), animRow(pn, 'sy', 'Échelle Y', { step: .01 }));
    b.append(animRow(pn, 'skx', 'Cisaille X', { step: .01 }), animRow(pn, 'sky', 'Cisaille Y', { step: .01 }));
  }));
  const kk = keyAt(pn);
  if (kk) out.push(section('ease', `Courbe de la clé · ${kk.t} ms`, (b) => easeEditor(b, pn, kk)));
  out.push(section('look', 'Apparence', (b) => {
    b.append(animRow(pn, 'alpha', 'Opacité', { step: .01, min: 0, max: 1 }));
    if (k !== 'bone') b.append(animRow(pn, 'flash', 'Flash', { step: .01, min: 0, max: 1.5 }));
    if (k !== 'bone') {
      const kk = keyAt(pn), keyed = kk && 'tint' in kk;
      b.append(colorRow('Teinte', normHex(valueAt(pn, 'tint')), (v, fin) => apply(pn, 'tint', v), keyed ? 'keyed' : isAnimated(pn, 'tint') ? 'animated' : '', () => (keyed ? delKeyProp(pn, 'tint') : setKey(pn, 'tint', normHex(valueAt(pn, 'tint'))))));
    }
    b.append(animRow(pn, 'z', 'Ordre (dessin)', { step: 1, digits: 0 }));
    if (p.frames) b.append(animRow(pn, 'frame', 'Image n°', { step: 1, digits: 0, min: 0, max: p.frames.length - 1 }));
  }));
  if (p.mesh) {
    out.push(section('mesh', 'Maillage', (b) => {
      b.append(animRow(pn, 'bend', 'Courbure'), animRow(pn, 'wave', 'Ondulation', { min: 0 }), animRow(pn, 'taper', 'Effilement'));
      const nb = Math.max(1, (p.mesh.bulges || []).length);
      for (let i = 0; i < nb; i++) b.append(animRow(pn, i ? 'bulge' + (i + 1) : 'bulge', 'Gonflement' + (nb > 1 ? ' ' + (i + 1) : '')));
      const ffd = valueAt(pn, 'ffd');
      b.append(el('p', { class: 'note-p', text: ffd && ffd.some((v) => Math.abs(v) > .01) ? 'Déformation libre posée sur cette pièce.' : 'Déformation libre : outil D, puis glisse les sommets (pinceau doux).' }));
      b.append(el('div', { class: 'btn-row' },
        el('button', { class: 'btn sm', html: svg('mesh') + 'Déformer (D)', onclick: () => { S.tool = 'ffd'; bus.emit('tool'); } }),
        el('button', { class: 'btn sm ghost', text: 'Remettre à plat', onclick: resetFfd, disabled: !(keyAt(pn) && 'ffd' in keyAt(pn)) })));
    }));
  }
  if (k !== 'bone') {
    out.push(section('shine', 'Reflet', (b) => {
      if (!p.shine) {
        b.append(el('p', { class: 'note-p', text: 'Une bande de lumière qui traverse la pièce, seulement sur ses pixels (or, gemme, métal).' }));
        b.append(el('button', { class: 'btn sm', html: svg('spark') + 'Ajouter un reflet', onclick: () => edit('reflet', () => { p.shine = { angle: 20, width: .16, strength: .85, color: '#fff4d6' }; }, { structure: true, merge: false }) }));
        return;
      }
      b.append(animRow(pn, 'shine', 'Position', { min: 0, max: 1, step: .01 }));
      b.append(el('p', { class: 'note-p', text: '0 = avant la pièce, 1 = après. Deux clés 0 → 1 font passer le reflet.' }));
      shineSettings(b, p);
    }, { startClosed: !p.shine }));
  }
  out.push(section('phys', 'Physique', (b) => physics(b, p), { startClosed: true }));
  return out;
}

function shineSettings(b, p) {
  const s = p.shine;
  const set = (key, v) => edit('reflet', () => { s[key] = v; }, { structure: true });
  b.append(numRow({ label: 'Angle °', value: s.angle ?? 20, step: 1, digits: 0, onChange: (v) => set('angle', v) }));
  b.append(numRow({ label: 'Largeur', value: s.width ?? .16, step: .01, min: .02, max: .8, onChange: (v) => set('width', v) }));
  b.append(numRow({ label: 'Force', value: s.strength ?? .85, step: .01, min: 0, max: 1.5, onChange: (v) => set('strength', v) }));
  b.append(colorRow('Couleur', s.color || '#fff4d6', (v, fin) => fin && set('color', v)));
  b.append(el('button', { class: 'btn sm ghost danger', text: 'Retirer le reflet', onclick: () => edit('retirer le reflet', () => { delete p.shine; }, { structure: true, merge: false }) }));
}

/* ---------------- courbe ---------------- */
function curveSvg(e) {
  const f = easeFn(e); let d = '';
  let lo = 0, hi = 1;
  const pts = [];
  for (let i = 0; i <= 40; i++) { const y = e === 'step' ? (i < 40 ? 0 : 1) : f(i / 40); pts.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const sp = hi - lo || 1;
  pts.forEach((y, i) => { d += (i ? 'L' : 'M') + (2 + i * .9).toFixed(1) + ' ' + (36 - ((y - lo) / sp) * 32).toFixed(1); });
  return `<svg viewBox="0 0 40 38" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${d ? `<path d="${d}"/>` : ''}</svg>`;
}
function easeEditor(b, pn, k) {
  const props = Object.keys(k).filter((x) => x !== 't' && x !== 'ease');
  if (!props.length) return;
  let target = S.easeProp && props.includes(S.easeProp) ? S.easeProp : '*';
  const perProp = k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease);
  if (!perProp) target = '*';
  const curOf = () => (target === '*' ? (perProp ? (k.ease['*'] ?? 'inOutQuad') : (k.ease ?? 'inOutQuad')) : easeFor(k, target) ?? 'inOutQuad');
  const opts = [{ value: '*', label: 'Toutes les propriétés' }, ...props.map((x) => ({ value: x, label: 'Seulement ' + x }))];
  b.append(selRow('Appliquer à', opts, target, (v) => { S.easeProp = v; if (v !== '*' && !perProp) edit('courbe par propriété', () => { k.ease = { '*': k.ease ?? 'inOutQuad' }; }, { merge: false }); else render(); }));
  const setEase = (e) => edit('courbe', () => {
    if (target === '*') {
      if (perProp) { k.ease = e; } else k.ease = e;
      if (k.ease === 'inOutQuad') delete k.ease;
    } else {
      if (!perProp) k.ease = { '*': k.ease ?? 'inOutQuad' };
      k.ease[target] = e;
    }
  }, { merge: false });
  const grid = el('div', { class: 'ease-grid' });
  const cur = curOf();
  for (const [lab, e] of PRESETS) {
    grid.append(el('button', { class: 'ease-cell' + (sameEase(cur, e) ? ' on' : ''), title: lab, html: curveSvg(e) + `<span>${lab}</span>`, onclick: () => setEase(e) }));
  }
  b.append(grid);
  // Bézier libre
  const cv = el('canvas', { width: 560, height: 340 });
  const vals = el('div', { class: 'bez-vals' });
  b.append(el('div', { class: 'bez-box' }, cv, vals));
  let bz = Array.isArray(cur) ? [...cur] : null;
  const draw = () => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 40;
    const lo = -.6, hi = 1.8;
    const X = (x) => pad + x * (W - 2 * pad), Y = (y) => H - pad * .6 - ((y - lo) / (hi - lo)) * (H - pad * 1.2);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#262a35'; g.lineWidth = 2;
    g.strokeRect(X(0), Y(1), X(1) - X(0), Y(0) - Y(1));
    g.setLineDash([6, 6]); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke(); g.setLineDash([]);
    const e = bz || cur, f = easeFn(e);
    g.strokeStyle = '#f5b942'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 120; i++) { const p = i / 120, y = e === 'step' ? (p < 1 ? 0 : 1) : f(p); i ? g.lineTo(X(p), Y(y)) : g.moveTo(X(p), Y(y)); }
    g.stroke();
    if (bz) {
      g.strokeStyle = '#56c7f0'; g.lineWidth = 2;
      for (const [ax, ay, hx, hy] of [[0, 0, bz[0], bz[1]], [1, 1, bz[2], bz[3]]]) {
        g.beginPath(); g.moveTo(X(ax), Y(ay)); g.lineTo(X(hx), Y(hy)); g.stroke();
        g.fillStyle = '#56c7f0'; g.beginPath(); g.arc(X(hx), Y(hy), 11, 0, 7); g.fill();
        g.fillStyle = '#0d0e12'; g.beginPath(); g.arc(X(hx), Y(hy), 5, 0, 7); g.fill();
      }
      vals.textContent = `cubic-bezier(${bz.map((v) => +v.toFixed(2)).join(', ')})`;
    } else vals.textContent = (typeof cur === 'string' ? cur : '') + ' · glisse dans le cadre pour une Bézier libre';
    cv._X = X; cv._Y = Y; cv._lo = lo; cv._hi = hi; cv._pad = pad;
  };
  draw();
  let dragH = -1;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = (e) => {
    cv.setPointerCapture(e.pointerId);
    busyStart();
    if (!bz) bz = [.25, .1, .25, 1];
    const [mx, my] = pos(e);
    const d1 = Math.hypot(mx - cv._X(bz[0]), my - cv._Y(bz[1])), d2 = Math.hypot(mx - cv._X(bz[2]), my - cv._Y(bz[3]));
    dragH = d1 < d2 ? 0 : 1;
    cv.onpointermove(e);
  };
  cv.onpointermove = (e) => {
    if (dragH < 0) return;
    const [mx, my] = pos(e), W = cv.width, H = cv.height, pad = cv._pad;
    const x = Math.max(0, Math.min(1, (mx - pad) / (W - 2 * pad)));
    const y = cv._lo + ((H - pad * .6 - my) / (H - pad * 1.2)) * (cv._hi - cv._lo);
    bz[dragH * 2] = +x.toFixed(3); bz[dragH * 2 + 1] = +Math.max(-1, Math.min(2.5, y)).toFixed(3);
    draw();
    setEaseQuiet(k, target, [...bz]);
  };
  cv.onpointerup = () => { if (dragH >= 0) { dragH = -1; setEase([...bz]); } busyEnd(); };
}
function setEaseQuiet(k, target, e) {
  // aperçu en direct pendant le glisser (fusionné en un seul pas d'annulation)
  edit('courbe', () => {
    if (target === '*') k.ease = e;
    else { if (!(k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease))) k.ease = { '*': k.ease ?? 'inOutQuad' }; k.ease[target] = e; }
  });
}

/* ---------------- physique (réglages du rig) ---------------- */
function physics(b, p) {
  const tog = (key, def, label, help) => b.append(switchRow(label, !!p[key], (on) => edit(label, () => { if (on) p[key] = def; else delete p[key]; }, { structure: true, merge: false }), help));
  const num = (obj, key, label, step, def, o = {}) => b.append(numRow({ label, value: obj[key] ?? def, step, min: o.min, max: o.max, digits: o.digits, onChange: (v) => edit(label, () => { obj[key] = v; }, { structure: true }) }));
  tog('spring', { k: 70, damp: 5.5, gain: 1.2 }, 'Ressort (rotation)', 'La pièce suit la rotation de son parent avec retard, puis oscille : battant, plume, oreille.');
  if (p.spring) { num(p.spring, 'k', '  Raideur', 1, 70, { min: 1 }); num(p.spring, 'damp', '  Amortissement', .1, 5.5, { min: 0 }); num(p.spring, 'gain', '  Ampleur', .05, 1, { min: 0 }); }
  tog('jiggle', { k: 90, damp: 8, gain: 1 }, 'Traîne (position)', 'La pièce traîne derrière le mouvement : chaîne, gelée, cheveux.');
  if (p.jiggle) { num(p.jiggle, 'k', '  Raideur', 1, 90, { min: 1 }); num(p.jiggle, 'damp', '  Amortissement', .1, 8, { min: 0 }); num(p.jiggle, 'gain', '  Ampleur', .05, 1, { min: 0 }); }
  tog('physique', { longueur: 100, inertie: .5, raideur: 90, amortissement: 8, masse: 1, rotation: 1, limite: .5 }, 'Physique (Spine 4.2)', 'Le bout de l\'os est une masse au bout d\'un ressort : il traîne quand le corps monte, saute ou tourne, puis se rattrape. Cheveux, fleur, bras mous, ventre.');
  if (p.physique) { const ph = p.physique;
    num(ph, 'longueur', '  Longueur (px)', 5, 100, { min: 5, digits: 0 }); num(ph, 'inertie', '  Inertie', .05, .5, { min: 0, max: 1 }); num(ph, 'raideur', '  Raideur', 1, 90, { min: 1 });
    num(ph, 'amortissement', '  Amortissement', .1, 8, { min: 0 }); num(ph, 'masse', '  Masse', .05, 1, { min: .05 }); num(ph, 'gravite', '  Gravité', 5, 0);
    num(ph, 'vent', '  Vent', 5, 0); num(ph, 'rotation', '  Rotation (0-1)', .05, 1, { min: 0, max: 1 }); num(ph, 'position', '  Position (0-1)', .05, 0, { min: 0, max: 1 });
    num(ph, 'etirement', '  Étirement (0-1)', .05, 0, { min: 0, max: 1 }); num(ph, 'limite', '  Limite (rad)', .05, .5, { min: 0 }); num(ph, 'mix', '  Mélange', .05, 1, { min: 0, max: 1 }); }
  { const meshes = S.rig.parts.filter((q) => q.mesh && q.name !== p.name);
    if (meshes.length) { tog('epingle', { sur: meshes[0].name, point: [...p.pivot], mix: 1 }, 'Épingler sur la peau', 'La pièce suit EXACTEMENT un point du maillage déformé (œil, bouche, bijou posés sur un corps souple) : jamais de décalage ni de couture.');
      if (p.epingle) { b.append(el('select', { onchange: (e) => edit('épingle', () => { p.epingle.sur = e.target.value; }, { structure: true }) }, meshes.map((q) => el('option', { value: q.name, text: '  sur : ' + q.name, selected: q.name === p.epingle.sur }))));
        num(p.epingle, 'mix', '  Mélange', .05, 1, { min: 0, max: 1 });
        b.append(el('button', { class: 'btn sm', text: 'Point = pivot actuel', onclick: () => edit('épingle', () => { p.epingle.point = [...p.pivot]; }, { structure: true }) })); } } }
  tog('wiggle', { rot: .03, x: 0, y: 0, freq: 1.4 }, 'Bruit organique', 'Petit mouvement permanent et irrégulier : flamme, respiration, lévitation.');
  if (p.wiggle) {
    b.append(numRow({ label: '  Rotation °', value: (p.wiggle.rot || 0) * D, step: .1, digits: 1, onChange: (v) => edit('bruit', () => { p.wiggle.rot = v / D; }, { structure: true }) }));
    num(p.wiggle, 'x', '  X (px)', .5, 0, { digits: 1 }); num(p.wiggle, 'y', '  Y (px)', .5, 0, { digits: 1 }); num(p.wiggle, 'freq', '  Fréquence', .05, 1.4, { min: 0 });
    if (S.mode === 'animer' && anim()) b.append(animRow(p.name, 'wig', 'Force du bruit (clé)', { min: 0, max: 5 }));
  }
}

/* ---------------- pièce (mode Rig) ---------------- */
function rigPartPanel(p) {
  const out = [];
  const others = S.rig.parts.filter((q) => q !== p && q.name !== p.name);
  const setP = (label, fn, structure = true) => edit(label, fn, { structure });
  out.push(section('struct', 'Structure', (b) => {
    const forbidden = new Set([p.name]);
    const desc = (n) => S.rig.parts.filter((q) => q.parent === n).forEach((q) => { forbidden.add(q.name); desc(q.name); });
    desc(p.name);
    b.append(selRow('Parent', [{ value: '', label: '— aucun —' }, ...S.rig.parts.filter((q) => !forbidden.has(q.name)).map((q) => q.name)], p.parent || '', (v) => setP('parent', () => { if (v) p.parent = v; else delete p.parent; })));
    b.append(numRow({ label: 'Pivot X', value: p.pivot[0], step: 1, digits: 0, onChange: (v) => setP('pivot', () => { p.pivot = [Math.round(v), p.pivot[1]]; }) }));
    b.append(numRow({ label: 'Pivot Y', value: p.pivot[1], step: 1, digits: 0, onChange: (v) => setP('pivot', () => { p.pivot = [p.pivot[0], Math.round(v)]; }) }));
    if (p.src || p.frames) {
      const off = p.offset || [0, 0];
      b.append(numRow({ label: 'Image X', value: off[0], step: 1, digits: 0, onChange: (v) => setP('placement', () => { p.offset = [Math.round(v), off[1]]; }) }));
      b.append(numRow({ label: 'Image Y', value: off[1], step: 1, digits: 0, onChange: (v) => setP('placement', () => { p.offset = [off[0], Math.round(v)]; }) }));
      const imgs = S.fichiers.length ? S.fichiers : [p.src];
      if (p.src) b.append(selRow('Image', imgs, p.src, (v) => setP('image', () => { p.src = v; })));
      b.append(selRow('Mélange', [{ value: '', label: 'normal' }, { value: 'add', label: 'addition (lueur)' }, { value: 'screen', label: 'superposition claire' }, { value: 'multiply', label: 'produit (ombre)' }], p.blend || '', (v) => setP('mélange', () => { if (v) p.blend = v; else delete p.blend; })));
      b.append(selRow('Visible dans', [{ value: '', label: '— partout —' }, ...others.filter((q) => q.src && !q.mesh).map((q) => ({ value: q.name, label: 'la forme de ' + q.name }))], p.clip || '', (v) => setP('découpe', () => { if (v) p.clip = v; else delete p.clip; })));
      b.append(colorRow('Teinte de base', normHex(p.tint ?? '#ffffff'), (v, fin) => fin && setP('teinte', () => { if (v.toLowerCase() === '#ffffff') delete p.tint; else p.tint = v; })));
    } else {
      b.append(el('p', { class: 'note-p', text: 'Os sans image : il porte ses enfants. Place-le avec l\'outil Pivot (P).' }));
    }
  }));
  if (p.src || p.frames) {
    out.push(section('rmesh', 'Maillage', (b) => {
      b.append(switchRow('Maillage déformable', !!p.mesh, (on) => setP('maillage', () => { if (on) p.mesh = { grid: [8, 8] }; else delete p.mesh; })));
      if (!p.mesh) { b.append(el('p', { class: 'note-p', text: 'Un maillage permet de courber, gonfler, onduler et de déformer la pièce librement.' })); return; }
      const m = p.mesh;
      b.append(numRow({ label: 'Colonnes', value: (m.grid || [8, 8])[0], step: 1, digits: 0, min: 1, max: 40, onChange: (v) => setP('grille', () => { m.grid = [Math.round(v), (m.grid || [8, 8])[1]]; }) }));
      b.append(numRow({ label: 'Rangées', value: (m.grid || [8, 8])[1], step: 1, digits: 0, min: 1, max: 40, onChange: (v) => setP('grille', () => { m.grid = [(m.grid || [8, 8])[0], Math.round(v)]; }) }));
      b.append(selRow('Sens', [{ value: '1', label: 'pend sous le pivot' }, { value: '-1', label: 'monte (flamme)' }], String(m.dir ?? 1), (v) => setP('sens', () => { m.dir = +v; })));
      b.append(numRow({ label: 'Longueur', value: m.length || Math.round(S.rig.size[1] / 2), step: 1, digits: 0, min: 1, onChange: (v) => setP('longueur', () => { m.length = Math.round(v); }) }));
      b.append(selRow('Suit les déformations de', [{ value: '', label: '— non —' }, ...others.filter((q) => q.mesh).map((q) => q.name)], m.follow || '', (v) => setP('suivre', () => { if (v) m.follow = v; else delete m.follow; })));
      // peau : os qui tirent le maillage
      b.append(el('p', { class: 'note-p', text: 'Peau : les os qui tirent ce maillage (chaque sommet suit les os proches).' }));
      const bones = (m.bones || []).map((x) => (typeof x === 'string' ? { name: x } : x));
      for (const q of S.rig.parts.filter((x) => !x.src && !x.frames)) {
        const on = bones.find((x) => x.name === q.name);
        b.append(switchRow('  ' + q.name, !!on, (v) => setP('peau', () => {
          let arr = (m.bones || []).map((x) => (typeof x === 'string' ? { name: x } : x));
          if (v) arr.push({ name: q.name, radius: Math.round(Math.max(...S.rig.size) * .33) }); else arr = arr.filter((x) => x.name !== q.name);
          if (arr.length) m.bones = arr; else delete m.bones;
        })));
        if (on) b.append(numRow({ label: '    rayon', value: on.radius ?? 100, step: 1, digits: 0, min: 1, onChange: (v) => setP('rayon', () => { on.radius = Math.round(v); m.bones = bones; }) }));
      }
      if (m.bones) b.append(numRow({ label: 'Douceur', value: m.falloff ?? 2, step: .1, min: .5, max: 8, onChange: (v) => setP('douceur', () => { m.falloff = v; }) }));
      if (m.bones) b.append(switchRow('Poids le long des os', m.weights === 'os', (on) => setP('poids', () => { if (on) m.weights = 'os'; else delete m.weights; }), 'Chaque os tire toute sa longueur (pas seulement son pivot), puis les poids sont lissés : un corps entier plie comme du caoutchouc, sans aucune couture.'));
      if (m.bones && m.weights === 'os') b.append(numRow({ label: '  Lissage', value: m.smooth ?? 6, step: 1, digits: 0, min: 0, max: 30, onChange: (v) => setP('lissage', () => { m.smooth = v; }) }));
      // zones de gonflement
      const zs = m.bulges || [];
      b.append(el('p', { class: 'note-p', text: `Zones de gonflement (${zs.length || 'centre par défaut'}) : un œil, une gemme, une lettre.` }));
      zs.forEach((z, i) => {
        b.append(numRow({ label: `  zone ${i + 1} X`, value: z.center[0], step: 1, digits: 0, onChange: (v) => setP('zone', () => { z.center = [Math.round(v), z.center[1]]; }) }));
        b.append(numRow({ label: `  zone ${i + 1} Y`, value: z.center[1], step: 1, digits: 0, onChange: (v) => setP('zone', () => { z.center = [z.center[0], Math.round(v)]; }) }));
        b.append(numRow({ label: `  zone ${i + 1} rayon`, value: z.radius, step: 1, digits: 0, min: 1, onChange: (v) => setP('zone', () => { z.radius = Math.round(v); }) }));
      });
      b.append(el('div', { class: 'btn-row' },
        el('button', { class: 'btn sm', text: '+ zone', disabled: zs.length >= 4, onclick: () => setP('zone', () => { (m.bulges ||= []).push({ center: [...p.pivot], radius: Math.round(Math.max(...S.rig.size) * .12) }); }) }),
        zs.length ? el('button', { class: 'btn sm ghost', text: '− dernière zone', onclick: () => setP('zone', () => { m.bulges.pop(); if (!m.bulges.length) delete m.bulges; }) }) : null));
    }));
    out.push(section('rshine', 'Reflet', (b) => {
      if (!p.shine) { b.append(el('button', { class: 'btn sm', html: svg('spark') + 'Ajouter un reflet', onclick: () => setP('reflet', () => { p.shine = { angle: 20, width: .16, strength: .85, color: '#fff4d6' }; }) })); return; }
      shineSettings(b, p);
    }, { startClosed: !p.shine }));
  }
  out.push(section('rphys', 'Physique', (b) => physics(b, p)));
  return out;
}

/* ---------------- rien de choisi : l'animation ---------------- */
function animPanel() {
  const a = anim();
  if (!a) return [el('div', { class: 'empty', text: 'Aucune animation. Crée-en une avec + dans la liste.' })];
  const out = [el('div', { class: 'ins-head' }, el('div', { class: 'ins-title' }, el('span', { class: 'ty', html: svg('film') }), el('b', { text: S.anim, style: 'font-size:15px' })),
    el('div', { class: 'ins-sub' }, el('span', { class: 'tag', text: a.loop ? 'boucle' : 'une fois' }), el('span', { class: 'tag', text: a.dur + ' ms' })))];
  out.push(section('anim', 'Animation', (b) => {
    b.append(numRow({ label: 'Durée (ms)', value: a.dur, step: 10, digits: 0, min: 10, onChange: (v) => edit('durée', () => { a.dur = Math.round(v); }, { structure: true }) }));
    b.append(switchRow('Boucle', !!a.loop, (on) => edit('boucle', () => { a.loop = on; }, { merge: false })));
    b.append(numRow({ label: 'Fondu d\'entrée (ms)', value: a.mix ?? S.rig.mix ?? 120, step: 10, digits: 0, min: 0, onChange: (v) => edit('fondu', () => { a.mix = Math.round(v); }) }));
    b.append(el('p', { class: 'note-p', html: 'Studios mesurés : repos 1–3 s en boucle, arrivée <b>730 ms</b>, gain <b>1370 ms</b>, disparition <b>330 ms</b>.' }));
  }));
  out.push(section('evs', `Événements (${(a.events || []).length})`, (b) => {
    for (const e of (a.events || []).slice().sort((x, y) => x.t - y.t)) {
      const lab = e.name || (e.emit ? 'rafale ' + e.emit : e.rate ? `débit ${e.rate[0]} = ${e.rate[1]}` : '•');
      b.append(el('button', { class: 'btn sm ghost', style: 'justify-content:space-between;width:100%', onclick: () => { S.selEvent = e; S.t = e.t; bus.emit('time'); bus.emit('evsel'); } },
        el('span', { text: lab }), el('span', { style: 'font:500 11px var(--mono);color:var(--txt3)', text: e.t + ' ms' })));
    }
    b.append(el('button', { class: 'btn sm', html: svg('plus') + `Événement à ${Math.round(S.t)} ms`, onclick: () => { const ev = { t: Math.round(S.t), name: 'son' }; edit('événement', () => { (a.events ||= []).push(ev); }, { merge: false }); S.selEvent = ev; bus.emit('evsel'); } }));
    b.append(el('p', { class: 'note-p', text: 'Un événement joue un son du jeu (même nom que le fichier), lance une rafale de particules, ou prévient le code du jeu.' }));
  }));
  const feats = rigFeatures(S.rig);
  if (feats.length) out.push(section('v3', 'Moteur', (b) => b.append(el('p', { class: 'note-p', html: `Ce rig utilise : <b>${feats.join(', ')}</b>. Le jeu doit avoir le moteur v3 (<code>rl moteur ${S.p}</code>).` }))));
  return out;
}

/* ---------------- rien de choisi : le rig ---------------- */
function rigPanel() {
  const r = S.rig;
  const out = [el('div', { class: 'ins-head' }, el('div', { class: 'ins-title' }, el('span', { class: 'ty', html: svg('bone') }), el('b', { text: S.s, style: 'font-size:15px' })),
    el('div', { class: 'ins-sub' }, el('span', { class: 'tag', text: `${r.size[0]} × ${r.size[1]} px` }), el('span', { class: 'tag', text: `${r.parts.length} pièces` })))];
  out.push(section('rg', 'Symbole', (b) => {
    b.append(numRow({ label: 'Fondu par défaut (ms)', value: r.mix ?? 120, step: 10, digits: 0, min: 0, onChange: (v) => edit('fondu', () => { r.mix = Math.round(v); }) }));
    b.append(el('p', { class: 'note-p', text: 'Clique une pièce ou un os pour régler son parent, son pivot, son maillage et sa physique. Outil P : déplacer un pivot ; V : déplacer une pièce et ses enfants.' }));
  }));
  out.push(section('ik', `IK (${(r.ik || []).length})`, (b) => {
    (r.ik || []).forEach((c, i) => {
      b.append(el('p', { class: 'note-p', html: `<b>${c.bones.join(' → ')}</b> vise <b>${c.target}</b> (bout : ${typeof c.tip === 'string' ? c.tip : c.tip.join(', ')})` }));
      b.append(numRow({ label: '  Mélange', value: c.mix ?? 1, step: .05, min: 0, max: 1, onChange: (v) => edit('ik', () => { c.mix = v; }, { structure: true }) }));
      b.append(selRow('  Pli', [{ value: '1', label: 'dans un sens' }, { value: '-1', label: 'dans l\'autre' }], String(c.bend ?? 1), (v) => edit('ik', () => { c.bend = +v; }, { structure: true })));
      b.append(el('button', { class: 'btn sm ghost danger', text: 'Retirer', onclick: () => edit('ik', () => { r.ik.splice(i, 1); }, { structure: true, merge: false }) }));
    });
    const bones = r.parts.map((q) => q.name);
    const f = { a: bones[0], b: '', target: bones[0], tip: bones[0] };
    b.append(selRow('Os 1', bones, f.a, (v) => (f.a = v)), selRow('Os 2 (option)', ['', ...bones], '', (v) => (f.b = v)), selRow('Cible', bones, f.target, (v) => (f.target = v)), selRow('Bout de la chaîne', bones, f.tip, (v) => (f.tip = v)));
    b.append(el('button', { class: 'btn sm', html: svg('ik') + 'Ajouter l\'IK', onclick: () => edit('ik', () => { (r.ik ||= []).push({ bones: f.b ? [f.a, f.b] : [f.a], target: f.target, tip: f.tip, bend: 1, mix: 1 }); }, { structure: true, merge: false }) }));
    b.append(el('p', { class: 'note-p', text: 'L\'IK plie un bras ou une jambe pour que le bout touche la cible : on anime la cible, les os suivent.' }));
  }, { startClosed: !(r.ik || []).length }));
  out.push(section('emit', `Particules (${Object.keys(r.emitters || {}).length})`, (b) => {
    const ta = el('textarea', { class: 'txt', spellcheck: 'false', style: 'height:180px;padding:8px;font:11px var(--mono);resize:vertical' });
    ta.value = JSON.stringify(r.emitters || {}, null, 1);
    ta.onkeydown = (e) => e.stopPropagation();
    b.append(ta, el('div', { class: 'btn-row' }, el('button', { class: 'btn sm', text: 'Appliquer', onclick: () => { try { const v = JSON.parse(ta.value); edit('particules', () => { r.emitters = v; }, { structure: true, merge: false }); } catch (e) { toast('JSON invalide : ' + e.message, 'err'); } } })));
    b.append(el('p', { class: 'note-p', text: 'Émetteurs : part, at [x,y], tex (soft, dot, star, smoke), color, speed, angle, spread, gravity, life, scale, area, rate. Déclenchés par les événements « emit ».' }));
  }, { startClosed: true }));
  out.push(section('skins', `Skins (${Object.keys(r.skins || {}).length})`, (b) => {
    const ta = el('textarea', { class: 'txt', spellcheck: 'false', style: 'height:110px;padding:8px;font:11px var(--mono);resize:vertical' });
    ta.value = JSON.stringify(r.skins || {}, null, 1);
    ta.onkeydown = (e) => e.stopPropagation();
    b.append(ta, el('button', { class: 'btn sm', text: 'Appliquer', onclick: () => { try { const v = JSON.parse(ta.value); edit('skins', () => { r.skins = v; }, { structure: true, merge: false }); } catch (e) { toast('JSON invalide', 'err'); } } }));
    b.append(el('p', { class: 'note-p', text: '{ "gris": { "corps.webp": "corps-gris.webp" } } : une autre version des images (symbole terni, doré…).' }));
  }, { startClosed: true }));
  return out;
}

/* ---------------- événement choisi ---------------- */
function eventPanel() {
  const e = S.selEvent, a = anim();
  if (!a || !(a.events || []).includes(e)) { S.selEvent = null; return animPanel(); }
  const out = [el('div', { class: 'ins-head' }, el('div', { class: 'ins-title' }, el('span', { class: 'ty', html: svg('sound') }), el('b', { text: 'Événement', style: 'font-size:15px' })))];
  out.push(section('ev', 'Événement', (b) => {
    b.append(numRow({ label: 'Temps (ms)', value: e.t, step: 10, digits: 0, min: 0, max: a.dur, onChange: (v) => edit('événement', () => { e.t = Math.round(v); }) }));
    const sons = S.sons || [];
    b.append(selRow('Son du jeu', [{ value: '', label: '— aucun —' }, ...sons], sons.includes(e.name) ? e.name : '', (v) => edit('événement', () => { if (v) e.name = v; }, { merge: false })));
    b.append(textRow('Nom', e.name || '', (v) => edit('événement', () => { if (v) e.name = v; else delete e.name; }, { merge: false })));
    const ems = Object.keys(S.rig.emitters || {});
    if (ems.length) {
      b.append(selRow('Rafale de', [{ value: '', label: '— aucune —' }, ...ems], e.emit || '', (v) => edit('rafale', () => { if (v) { e.emit = v; e.n ??= 12; } else { delete e.emit; delete e.n; } }, { merge: false })));
      if (e.emit) b.append(numRow({ label: '  Nombre', value: e.n ?? 12, step: 1, digits: 0, min: 1, onChange: (v) => edit('rafale', () => { e.n = Math.round(v); }) }));
      b.append(selRow('Débit continu de', [{ value: '', label: '— aucun —' }, ...ems], e.rate ? e.rate[0] : '', (v) => edit('débit', () => { if (v) e.rate = [v, e.rate ? e.rate[1] : 20]; else delete e.rate; }, { merge: false })));
      if (e.rate) b.append(numRow({ label: '  Par seconde', value: e.rate[1], step: 1, digits: 0, min: 0, onChange: (v) => edit('débit', () => { e.rate = [e.rate[0], Math.round(v)]; }) }));
    }
    b.append(numRow({ label: 'Volume', value: e.volume ?? .8, step: .05, min: 0, max: 1, onChange: (v) => edit('volume', () => { e.volume = v; }) }));
    b.append(el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm ghost danger', html: svg('trash') + 'Supprimer', onclick: () => { edit('supprimer l\'événement', () => { a.events.splice(a.events.indexOf(e), 1); }, { merge: false }); S.selEvent = null; bus.emit('evsel'); } }),
      el('button', { class: 'btn sm ghost', text: 'Fermer', onclick: () => { S.selEvent = null; bus.emit('evsel'); } })));
  }));
  return out;
}

/* ---------------- guide de la découpe ---------------- */
function guideDecoupe() {
  const g = el('div', { class: 'guide' });
  g.append(el('h3', { text: 'Découper les pièces' }));
  g.append(el('ol', { html: '<li><b>Lasso</b> autour de ce qui doit bouger (couronne, bras, battant…). Clique le premier point pour fermer.</li><li><b>Baguette</b> : clique une couleur ; dans un lasso, elle ne prend que cette couleur-là.</li><li><b>Trait</b> : élargit la sélection pour emporter le contour noir.</li><li><b>Détacher</b> : la pièce part dans sa propre image, le trou est rebouché dans le corps.</li><li><b>Surimpression</b> : pour faire briller ou gonfler une zone (lettres, gemme) sans couture.</li><li><b>Lueur</b> : clique où la lumière naît.</li></ol>' }));
  g.append(el('p', { class: 'note-p', text: 'Ensuite, en mode Rig, place le pivot de chaque pièce (outil P) là où elle tourne.' }));
  g.append(el('div', { class: 'fam', text: 'Images du symbole' }));
  const files = el('div', { class: 'files' });
  for (const f of S.fichiers) files.append(el('div', { class: 'f', title: f }, el('img', { src: `/f/${S.p}/${S.s}/${f}?v=${S.version}`, loading: 'lazy' }), el('span', { text: f })));
  g.append(files);
  return g;
}
