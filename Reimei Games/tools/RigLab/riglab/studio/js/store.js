/* ÉTAT PARTAGÉ de l'éditeur : le rig ouvert, l'animation, le temps, la
   sélection ; l'historique (annuler / rétablir) ; les clés ; le serveur. */
import { sampleTrack, DEFAULTS, rigImages, easeOf } from '../../engine/symbol-rig.js';

export const S = {
  projets: [], p: null, s: null, rig: null, tex: {}, fichiers: [], sons: [],
  mode: 'animer', anim: null, t: 0, playing: false, loop: true, speed: 1, snap: 10,
  sel: [], selKeys: [], selEvent: null,
  autokey: true, onion: false, cell: true, path: false, showBones: true, hidden: new Set(),
  tool: 'select', ffdRadius: 90, layer: '',
  dirty: false, version: 0, notes: {},
};

/* ---------------- bus d'événements ---------------- */
const subs = {};
export const bus = {
  on(ev, fn) { (subs[ev] ||= []).push(fn); },
  emit(ev, data) { (subs[ev] || []).forEach((f) => f(data)); },
};

/* ---------------- serveur ---------------- */
export async function api(path, body) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({ erreur: `réponse illisible (${r.status})` }));
  if (!r.ok || j.erreur) throw new Error(j.erreur || `erreur ${r.status}`);
  return j;
}

/* ---------------- accès au rig ---------------- */
export const part = (name) => S.rig && S.rig.parts.find((p) => p.name === name);
export const anim = () => S.rig && S.rig.anims[S.anim];
export const dur = () => (anim() ? anim().dur : 1000);
export function track(pn, create = false) {
  const a = anim(); if (!a) return null;
  a.tracks ||= {};
  if (create && !a.tracks[pn]) a.tracks[pn] = [];
  return a.tracks[pn] || null;
}
export const TOL = 0.5;
export function keyAt(pn, t = S.t) { const tr = track(pn); const r = Math.round(t); return tr ? tr.find((k) => Math.abs(k.t - r) < TOL) : null; }
export function isAnimated(pn, prop) { const tr = track(pn); return !!(tr && tr.some((k) => prop in k)); }
export function valueAt(pn, prop, t = S.t) {
  const tr = track(pn);
  const v = tr ? sampleTrack(tr, prop, t) : undefined;
  if (v !== undefined) return v;
  if (prop === 'tint') return part(pn)?.tint ?? '#ffffff';
  if (prop === 'z') return S.rig.parts.findIndex((p) => p.name === pn);
  if (prop === 'alpha' && part(pn)?.alpha != null) return part(pn).alpha;
  return DEFAULTS[prop] ?? 0;
}
export function snapT(t) { const s = S.snap || 1; return Math.max(0, Math.min(dur(), Math.round(Math.round(t / s) * s))); }
export const children = (pn) => S.rig.parts.filter((p) => p.parent === pn);
export function descendants(pn) { const out = []; const go = (n) => children(n).forEach((c) => { out.push(c.name); go(c.name); }); go(pn); return out; }
export function kind(p) {
  if (p.frames) return 'seq';
  if (p.mesh && p.mesh.bones) return 'skin';
  if (p.mesh) return 'mesh';
  if (p.blend === 'add') return 'glow';
  if (p.src) return 'image';
  return 'bone';
}
export const KIND_LABEL = { seq: 'séquence', skin: 'peau', mesh: 'maillage', glow: 'lueur', image: 'image', bone: 'os' };
export const KIND_ICON = { seq: 'seq', skin: 'skin', mesh: 'mesh', glow: 'glow', image: 'image', bone: 'bone' };
/* ordre de l'arbre : parents puis enfants, dans l'ordre de dessin */
export function treeOrder() {
  const out = [];
  const go = (parent, depth) => S.rig.parts.filter((p) => (p.parent || null) === parent).forEach((p) => { out.push({ p, depth }); go(p.name, depth + 1); });
  go(null, 0);
  return out;
}

/* ---------------- historique ---------------- */
const undoStack = [], redoStack = [];
let lastLabel = '', lastTime = 0;
/* edit(libellé, fn) : modifie le rig avec retour possible. Les modifications
   rapprochées du même libellé (glisser un curseur) forment un seul pas. */
export function edit(label, fn, { structure = false, merge = true } = {}) {
  const now = performance.now();
  if (!(merge && label === lastLabel && now - lastTime < 600)) {
    undoStack.push({ rig: JSON.stringify(S.rig), label });
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
  }
  lastLabel = label; lastTime = now;
  const r = fn(S.rig);
  S.dirty = true; S.version++;
  bus.emit('rig', { structure, label });
  return r;
}
export function breakMerge() { lastLabel = ''; }
export function undo() {
  const u = undoStack.pop(); if (!u) return;
  redoStack.push({ rig: JSON.stringify(S.rig), label: u.label });
  S.rig = JSON.parse(u.rig); lastLabel = '';
  fixAfterReplace();
  S.dirty = true; S.version++;
  bus.emit('rig', { structure: true, label: 'annuler' });
  bus.emit('toast', `Annulé : ${u.label}`);
}
export function redo() {
  const r = redoStack.pop(); if (!r) return;
  undoStack.push({ rig: JSON.stringify(S.rig), label: r.label });
  S.rig = JSON.parse(r.rig); lastLabel = '';
  fixAfterReplace();
  S.dirty = true; S.version++;
  bus.emit('rig', { structure: true, label: 'rétablir' });
  bus.emit('toast', `Rétabli : ${r.label}`);
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
function fixAfterReplace() {
  if (!S.rig.anims[S.anim]) S.anim = Object.keys(S.rig.anims)[0] || null;
  S.sel = S.sel.filter((n) => part(n));
  S.selKeys = [];
}
export function replaceRig(rig, label) {
  undoStack.push({ rig: JSON.stringify(S.rig), label });
  redoStack.length = 0; lastLabel = '';
  S.rig = rig;
  fixAfterReplace();
  S.dirty = true; S.version++;
  bus.emit('rig', { structure: true, label });
}

/* ---------------- clés ---------------- */
function cleanKey(tr, k) {
  const props = Object.keys(k).filter((x) => x !== 't' && x !== 'ease');
  if (!props.length) tr.splice(tr.indexOf(k), 1);
  else if (k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease)) {
    for (const x of Object.keys(k.ease)) if (x !== '*' && !props.includes(x)) delete k.ease[x];
    if (!Object.keys(k.ease).length) delete k.ease;
  }
}
export function setKeys(pn, values, t = S.t, label = 'clé') {
  return edit(label + ' ' + pn, () => {
    const tr = track(pn, true);
    const r = Math.round(t);
    let k = tr.find((q) => Math.abs(q.t - r) < TOL);
    if (!k) { k = { t: r }; tr.push(k); tr.sort((a, b) => a.t - b.t); }
    Object.assign(k, values);
    return k;
  });
}
export function setKey(pn, prop, v, t = S.t) { return setKeys(pn, { [prop]: v }, t, 'clé ' + prop); }
export function delKeyProp(pn, prop, t = S.t) {
  const k = keyAt(pn, t); if (!k || !(prop in k)) return;
  edit('retirer ' + prop, () => { delete k[prop]; cleanKey(track(pn), k); }, { merge: false });
}
/* toutes les propriétés d'une pièce à t (pose une clé complète) */
export const KEY_PROPS = ['rot', 'x', 'y', 'sx', 'sy', 'alpha'];
export function keyAll(pns = S.sel, t = S.t) {
  if (!pns.length) return;
  edit('poser une clé', () => {
    t = Math.round(t);
    for (const pn of pns) {
      const tr = track(pn, true);
      let k = tr.find((q) => Math.abs(q.t - t) < TOL);
      const props = new Set(KEY_PROPS);
      tr.forEach((q) => Object.keys(q).forEach((x) => { if (x !== 't' && x !== 'ease') props.add(x); }));
      const vals = {};
      for (const x of props) { const v = valueAt(pn, x, t); vals[x] = typeof v === 'number' ? +v.toFixed(4) : v; }
      if (!k) { k = { t: Math.round(t) }; tr.push(k); tr.sort((a, b) => a.t - b.t); }
      Object.assign(k, vals);
    }
  }, { merge: false });
}
export function allKeyTimes(pns = null) {
  const a = anim(); if (!a) return [];
  const set = new Set();
  for (const [pn, tr] of Object.entries(a.tracks || {})) if (!pns || pns.includes(pn)) tr.forEach((k) => set.add(k.t));
  return [...set].sort((x, y) => x - y);
}
export function easeFor(k, prop) { return easeOf(k, prop); }

/* ---------------- chargement / enregistrement ---------------- */
export async function loadTextures(PIXI, bust = true) {
  const v = bust ? `?v=${Date.now()}` : '';
  const tex = {};
  const files = new Set(rigImages(S.rig));
  (S.fichiers || []).forEach((f) => files.add(f));
  await Promise.all([...files].map(async (f) => {
    try { tex[f] = await PIXI.Assets.load(`/f/${S.p}/${S.s}/${f}${v}`); } catch (e) { console.warn('image', f, e); }
  }));
  S.tex = tex;
  return tex;
}
export async function open(PIXI, p, s) {
  if (S.dirty && S.rig && !confirm('Des modifications ne sont pas enregistrées. Ouvrir quand même ?')) return false;
  const rig = await api(`/api/rig?p=${encodeURIComponent(p)}&s=${encodeURIComponent(s)}`);
  S.p = p; S.s = s; S.rig = rig;
  S.fichiers = await api(`/api/fichiers?p=${p}&s=${s}`).catch(() => []);
  S.sons = await api(`/api/sons?p=${p}`).catch(() => []);
  await loadTextures(PIXI);
  undoStack.length = 0; redoStack.length = 0;
  S.anim = rig.anims.idle ? 'idle' : Object.keys(rig.anims)[0] || null;
  S.t = 0; S.sel = []; S.selKeys = []; S.dirty = false; S.notes = {}; S.hidden = new Set(); S.layer = '';
  try { localStorage.setItem('riglab.last', JSON.stringify({ p, s })); } catch (e) { /* stockage indisponible */ }
  bus.emit('open');
  bus.emit('rig', { structure: true, label: 'ouvrir' });
  return true;
}
export async function save() {
  if (!S.rig) return;
  await api(`/api/rig?p=${S.p}&s=${S.s}`, S.rig);
  S.dirty = false;
  bus.emit('saved');
  bus.emit('toast', { msg: `Enregistré · ${S.p}/${S.s}`, kind: 'ok' });
}
export async function reloadFiles(PIXI) {
  S.fichiers = await api(`/api/fichiers?p=${S.p}&s=${S.s}`).catch(() => []);
  await loadTextures(PIXI);
  bus.emit('rig', { structure: true, label: 'images' });
}
