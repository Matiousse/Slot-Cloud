/* RIG LAB — l'éditeur. Branche les panneaux, les modes, les raccourcis. */
import * as PIXI from '../../vendor/pixi.min.mjs';
import { S, bus, api, open, save, undo, redo, canUndo, canRedo, anim, keyAll, replaceRig, reloadFiles } from './store.js';
import { hydrate, svg } from './icons.js';
import { toast, menu, modal, el } from './ui.js';
import { initViewport, startPlay, showAt, fit, zoomBy, V, rebuild, resetFfd } from './viewport.js';
import { initTree } from './tree.js';
import { initInspector } from './inspector.js';
import { initTimeline, togglePlay, deleteKeys, copyKeys, pasteKeys, jumpKey, fit as fitTimeline } from './timeline.js';
import { initRecettes, toggle as toggleRecettes } from './recettes.js';
import { initControle } from './controle.js';
import { initAccueil, show as showHome } from './accueil.js';
import { initApercu } from './apercu.js';
import { initDecoupe } from './decoupe.js';

const $ = (id) => document.getElementById(id);
S.tlView = 'dope';

async function boot() {
  hydrate();
  await document.fonts.ready;
  await initViewport();
  initTree(); initInspector(); initTimeline(); initRecettes(); initControle(); initApercu(); initDecoupe();
  initAccueil(openSym);
  bindTop(); bindTools(); bindKeys();
  bus.on('toast', (t) => (typeof t === 'string' ? toast(t) : toast(t.msg, t.kind)));
  bus.on('playstate', () => { if (S.playing) startPlay(); else showAt(S.t); });
  bus.on('replay', () => { if (S.playing) startPlay(); });
  bus.on('stop', () => { S.playing = false; S.t = Math.round(S.t); bus.emit('playstate'); });
  bus.on('rig', updateTop); bus.on('saved', updateTop); bus.on('open', updateTop);
  bus.on('mode', applyMode);
  bus.on('tool', applyTool);
  bus.on('view', () => rebuild());
  bus.on('zoom', (z) => { $('vZoom').textContent = Math.round(z * 100) + ' %'; });
  addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  // ouvrir : ?p=&s=, sinon le dernier symbole, sinon l'accueil
  const q = new URLSearchParams(location.search);
  let last = null;
  try { last = JSON.parse(localStorage.getItem('riglab.last') || 'null'); } catch (e) { /* rien */ }
  const want = q.get('p') && q.get('s') ? { p: q.get('p'), s: q.get('s') } : last;
  if (q.get('mode')) S.mode = q.get('mode');
  let ok = false;
  if (want) ok = await openSym(want.p, want.s).catch(() => false);
  if (!ok) showHome();
  bus.emit('mode');
}

async function openSym(p, s) {
  try {
    S.playing = false;
    const ok = await open(PIXI, p, s);
    if (!ok) return false;
    $('crumbP').textContent = (S.projets.find((x) => x.id === p) || {}).nom || p;
    $('crumbS').textContent = s;
    document.title = `${s} · Rig Lab`;
    if (!S.projets.length) api('/api/projets').then((r) => { S.projets = r; $('crumbP').textContent = (r.find((x) => x.id === p) || {}).nom || p; }).catch(() => {});
    applyMode();
    return true;
  } catch (e) { toast(e.message, 'err'); return false; }
}

/* ---------------- barre du haut ---------------- */
function updateTop() {
  $('bUndo').disabled = !canUndo(); $('bRedo').disabled = !canRedo();
  const ss = $('saveState');
  ss.classList.toggle('dirty', S.dirty);
  ss.querySelector('span').textContent = S.dirty ? 'Modifié' : 'Enregistré';
}
function bindTop() {
  document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('bUndo').onclick = undo; $('bRedo').onclick = redo;
  $('bSave').onclick = () => save().catch((e) => toast(e.message, 'err'));
  $('bMenu').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.right - 240, r.bottom + 6, [
      { head: S.s ? `${S.p} / ${S.s}` : 'Rig Lab' },
      { label: 'Tous les symboles', icon: 'home', fn: showHome },
      { label: 'Historique des versions…', icon: 'history', disabled: !S.rig, fn: history },
      { label: 'Copier vers un autre projet…', icon: 'copy', disabled: !S.rig, fn: copyTo },
      { label: 'Exporter le rig (JSON)', icon: 'export', disabled: !S.rig, fn: exportJson },
      { label: 'Recharger les images', icon: 'image', disabled: !S.rig, fn: () => reloadFiles(PIXI) },
      '-',
      { label: 'Atelier de Claude (planches)', icon: 'film', disabled: !S.rig, fn: () => window.open(`/claude/?p=${S.p}&s=${S.s}&faire=planche&anim=${S.anim}`, '_blank') },
      { label: 'Raccourcis clavier', icon: 'more', fn: shortcuts },
    ]);
  };
}
export function setMode(m) {
  if (S.mode === m) return;
  S.playing = false; bus.emit('playstate');
  S.mode = m;
  if (m !== 'animer' && S.tool === 'ffd') S.tool = 'select';
  if (m === 'animer' && S.tool === 'pivot') S.tool = 'select';
  bus.emit('mode');
}
function applyMode() {
  const app = $('app');
  app.className = 'mode-' + S.mode;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  applyTool();
  setTimeout(() => { V.app && V.app.resize(); fit(); fitTimeline(); }, 40);
}
function applyTool() {
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
  $('ffdOpts').hidden = S.tool !== 'ffd' || S.mode !== 'animer';
  const H = {
    select: S.mode === 'rig' ? '<b>Déplacer</b> une pièce et ses enfants (Maj : un seul axe)' : '<b>Sélection</b> : clique une pièce · glisse pour la déplacer · Maj+clic : plusieurs',
    rotate: '<b>Rotation</b> : glisse l\'anneau ou la pièce (Maj : par 15°)',
    scale: '<b>Échelle</b> : poignée rouge = X, verte = Y, carré = les deux (Maj : proportionnel)',
    pivot: '<b>Pivot</b> : glisse le point autour duquel la pièce tourne',
    ffd: '<b>Déformer</b> : glisse un sommet, les voisins suivent dans le rayon · molette + Alt : rayon',
  };
  if (S.mode === 'animer' || S.mode === 'rig') $('hint').innerHTML = (H[S.tool] || '') + ' · <b>Espace</b> lecture · molette : zoom';
}
function bindTools() {
  document.querySelectorAll('#tools button').forEach((b) => (b.onclick = () => { S.tool = b.dataset.tool; bus.emit('tool'); }));
  $('vOnion').onclick = () => { S.onion = !S.onion; $('vOnion').classList.toggle('on', S.onion); rebuild(); };
  $('vCell').onclick = () => { S.cell = !S.cell; $('vCell').classList.toggle('on', S.cell); rebuild(); };
  $('vPath').onclick = () => { S.path = !S.path; $('vPath').classList.toggle('on', S.path); bus.emit('sel'); };
  $('vZoomIn').onclick = () => zoomBy(1.25); $('vZoomOut').onclick = () => zoomBy(.8); $('vZoom').onclick = fit;
  $('ffdR').oninput = (e) => { S.ffdRadius = +e.target.value; $('ffdRv').textContent = e.target.value; };
  $('ffdReset').onclick = resetFfd;
  $('view').addEventListener('wheel', (e) => {
    if (S.tool === 'ffd' && e.altKey) { e.stopPropagation(); S.ffdRadius = Math.max(0, Math.min(400, S.ffdRadius - e.deltaY * .3)); $('ffdR').value = S.ffdRadius; $('ffdRv').textContent = Math.round(S.ffdRadius); }
  }, { capture: true });
}

/* ---------------- raccourcis ---------------- */
function bindKeys() {
  addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !$('modal').hidden) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); $('bSave').click(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'c') { e.preventDefault(); copyKeys(); return; }
    if (mod && k === 'v') { e.preventDefault(); pasteKeys(); return; }
    if (mod) return;
    if (!$('home').hidden) { if (k === 'escape' && S.rig) $('home').hidden = true; return; }
    if (['1', '2', '3', '4'].includes(k)) { setMode(['decoupe', 'rig', 'animer', 'apercu'][+k - 1]); return; }
    if (S.mode === 'decoupe') return;
    if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'animer') togglePlay(); return; }
    const tools = { v: 'select', r: 'rotate', s: 'scale', d: 'ffd', p: 'pivot' };
    if (tools[k] && (S.mode === 'animer' || S.mode === 'rig')) { if (k === 'p' && S.mode !== 'rig') return; if (k === 'd' && S.mode !== 'animer') return; S.tool = tools[k]; bus.emit('tool'); return; }
    if (k === 'k') { keyAll(); return; }
    if (k === 'o') { $('vOnion').click(); return; }
    if (k === 'f') { fit(); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteKeys(); return; }
    if (k === 'escape') { S.sel = []; S.selKeys = []; S.selEvent = null; bus.emit('sel'); bus.emit('evsel'); document.getElementById('sheet').hidden = true; return; }
    if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); S.playing = false; bus.emit('playstate'); const st = e.shiftKey ? 100 : 1000 / 60; S.t = Math.max(0, Math.min(anim() ? anim().dur : 0, Math.round((S.t + (k === 'arrowleft' ? -st : st)) * 10) / 10)); bus.emit('time'); return; }
    if (k === ',') { jumpKey(-1); return; }
    if (k === ';' || k === '.') { jumpKey(1); return; }
    if (k === 'home') { S.t = 0; bus.emit('time'); return; }
    if (k === 'end') { S.t = anim() ? anim().dur : 0; bus.emit('time'); return; }
    if (k === 'e') toggleRecettes();
  });
}
function shortcuts() {
  const rows = [['Espace', 'lecture / pause'], ['← →', 'image précédente / suivante (Maj : 100 ms)'], [', ;', 'clé précédente / suivante'], ['K', 'poser une clé sur la sélection'], ['V R S D P', 'sélection, rotation, échelle, déformer, pivot'], ['O', 'pelure d\'oignon'], ['F', 'recadrer'], ['E', 'recettes'], ['1 2 3 4', 'Découpe, Rig, Animer, Aperçu'], ['⌘Z / ⇧⌘Z', 'annuler / rétablir'], ['⌘C / ⌘V', 'copier / coller des clés'], ['⌫', 'supprimer les clés choisies'], ['⌘S', 'enregistrer'], ['Alt + glisser une clé', 'la dupliquer'], ['Double-clic timeline', 'clé complète / nouvel événement'], ['Molette / pincer', 'zoom · deux doigts : déplacer · Espace + glisser : déplacer']];
  modal({ title: 'Raccourcis', extra: el('div', {}, ...rows.map(([k, v]) => el('div', { style: 'display:flex;gap:14px;padding:5px 0;border-bottom:1px solid var(--line)' }, el('kbd', { style: 'font:600 11px var(--mono);color:var(--acc2);min-width:150px', text: k }), el('span', { style: 'color:var(--txt2)', text: v })))), ok: 'Fermer', cancel: null });
}

/* ---------------- historique, copie, export ---------------- */
async function history() {
  const list = await api(`/api/historique?p=${S.p}&s=${S.s}`).catch(() => []);
  const box = el('div', { style: 'display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow:auto' });
  if (!list.length) box.append(el('p', { text: 'Aucune ancienne version : elles apparaissent à chaque enregistrement.' }));
  for (const v of list) {
    const d = v.v.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d).*/, '$3/$2 à $4:$5:$6');
    box.append(el('button', { class: 'btn ghost', style: 'justify-content:space-between;height:36px', onclick: async () => {
      const rig = await api(`/api/version?p=${S.p}&s=${S.s}&v=${v.v}`);
      replaceRig(rig, 'version du ' + d); document.getElementById('modal').hidden = true; toast(`Version du ${d} chargée (⌘Z pour revenir)`, 'ok');
    } }, el('span', { text: d }), el('span', { style: 'color:var(--txt3);font-size:11.5px', text: v.note || '' })));
  }
  modal({ title: 'Historique des versions', text: 'Chaque enregistrement garde la version précédente. Clique une version pour la recharger (rien n\'est écrit tant que tu n\'enregistres pas).', extra: box, ok: 'Fermer', cancel: null });
}
async function copyTo() {
  const projs = S.projets.length ? S.projets : await api('/api/projets');
  const r = await modal({ title: 'Copier le symbole', text: 'Copie le rig et ses images dans un autre projet (par exemple l\'Atelier pour faire des essais sans toucher au jeu).', fields: [{ id: 'p', label: 'Projet', type: 'select', options: projs.filter((x) => x.id !== S.p).map((x) => ({ value: x.id, label: x.nom })), value: 'atelier' }, { id: 's', label: 'Nom', value: S.s }], ok: 'Copier' });
  if (!r) return;
  if (S.dirty) await save();
  try { await api('/api/copier', { de: { p: S.p, s: S.s }, vers: { p: r.p, s: r.s }, ecraser: false }); toast('Copié', 'ok'); } catch (e) {
    if (/existe déjà/.test(e.message) && confirm('Le symbole existe déjà là-bas. Le remplacer ? (l\'ancien est gardé dans l\'historique)')) { await api('/api/copier', { de: { p: S.p, s: S.s }, vers: { p: r.p, s: r.s }, ecraser: true }); toast('Remplacé', 'ok'); } else toast(e.message, 'err');
  }
}
function exportJson() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S.rig, null, 1)], { type: 'application/json' }));
  a.download = `${S.s}.rig.json`; a.click();
}

window.riglab = { S, bus, V, PIXI };
boot();
void svg;
