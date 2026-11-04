/* RECETTES : les gestes d'animation studio, appliqués par le serveur (les
   mêmes que Claude utilise en ligne de commande). */
import { S, bus, api, replaceRig, anim } from './store.js';
import { el, numRow, selRow, colorRow, toast, svg } from './ui.js';

let catalogue = null, open = null;
const ICONS = { Gestes: 'bolt', Boucles: 'loop', Effets: 'spark', 'Outils studio': 'edit', Packs: 'layers' };
const params = {};

export function initRecettes() {
  document.getElementById('tRecettes').onclick = () => toggle();
  bus.on('sel', () => { if (!document.getElementById('sheet').hidden && sheetKind === 'recettes') render(); });
}
let sheetKind = '';
export async function toggle(force) {
  const sh = document.getElementById('sheet');
  if (!force && !sh.hidden && sheetKind === 'recettes') { sh.hidden = true; return; }
  sheetKind = 'recettes';
  if (!catalogue) catalogue = await api('/api/recettes');
  sh.hidden = false;
  render();
}

function render() {
  const sh = document.getElementById('sheet');
  sh.innerHTML = '';
  const sel = S.sel.length ? S.sel.join(', ') : 'aucune pièce choisie';
  sh.append(el('div', { class: 'sheet-h' }, el('span', { class: 'ic', style: 'color:var(--acc);width:20px;height:20px', html: svg('spark') }),
    el('h2', { text: 'Recettes' }), el('button', { class: 'icon-btn sm', html: svg('x'), onclick: () => (sh.hidden = true) })));
  const body = el('div', { class: 'sheet-b' });
  body.append(el('p', { class: 'note-p', html: `Appliquée à <b>${S.anim || '—'}</b> à <b>${Math.round(S.t)} ms</b> · pièce : <b>${sel}</b>. Tout s'annule avec ⌘Z.` }));
  const fams = [...new Set(catalogue.map((r) => r.famille))];
  for (const f of fams) {
    body.append(el('div', { class: 'fam', text: f }));
    for (const r of catalogue.filter((x) => x.famille === f)) body.append(card(r));
  }
  sh.append(body);
}

function card(r) {
  const isOpen = open === r.id;
  const c = el('div', { class: 'rcard' + (isOpen ? ' open' : '') });
  const h = el('div', { class: 'rh' }, el('span', { class: 'ri', html: svg(ICONS[r.famille] || 'spark') }),
    el('div', { class: 'rt' }, el('b', { text: r.nom }), el('span', { text: r.desc })),
    r.ideal ? el('span', { class: 'ideal', text: r.ideal }) : null);
  h.onclick = () => { open = isOpen ? null : r.id; render(); };
  c.append(h);
  const f = el('div', { class: 'rf' });
  const vals = params[r.id] ||= {};
  const parts = S.rig ? S.rig.parts.map((p) => p.name) : [];
  for (const p of r.params) {
    const v = vals[p.id] ?? p.defaut;
    if (p.type === 'nombre') f.append(numRow({ label: `${p.nom}${p.unite ? ' (' + p.unite + ')' : ''}`, value: v, step: p.pas, min: p.min, max: p.max, digits: p.pas < 1 ? (p.pas < .1 ? 2 : 1) : 0, onChange: (x) => (vals[p.id] = x) }));
    else if (p.type === 'piece') {
      const special = [{ value: 'sel', label: 'la pièce choisie' }, { value: 'racine', label: 'la racine' }, { value: 'corps', label: 'corps' }, { value: 'haut', label: 'haut' }, { value: 'aucune', label: '— aucune —' }];
      f.append(selRow(p.nom, [...special.filter((s) => s.value === p.defaut || ['sel', 'aucune'].includes(s.value)), ...parts.map((n) => ({ value: n, label: n }))], v, (x) => (vals[p.id] = x)));
    } else if (p.type === 'pieces') {
      f.append(selRow(p.nom, [{ value: 'sel', label: 'les pièces choisies (dans l\'ordre)' }, { value: 'lueurs', label: 'toutes les lueurs' }], v, (x) => (vals[p.id] = x)));
    } else if (p.type === 'couleur') f.append(colorRow(p.nom, v, (x) => (vals[p.id] = x)));
  }
  const bt = el('button', { class: 'btn primary wide', text: `Appliquer à ${Math.round(S.t)} ms` });
  bt.onclick = () => appliquer(r, vals, bt);
  f.append(el('div', { style: 'margin-top:6px' }, bt));
  c.append(f);
  return c;
}

async function appliquer(r, vals, bt) {
  if (!S.rig || !S.anim) return toast('Ouvre une animation d\'abord', 'err');
  bt.disabled = true;
  try {
    const res = await api('/api/recette', { rig: S.rig, anim: S.anim, recette: r.id, params: vals, t0: Math.round(S.t), ctx: { sel: S.sel } });
    replaceRig(res.rig, 'recette ' + r.nom);
    if (r.id === 'symbole-complet' && res.rig.anims.idle) S.anim = 'idle';
    bus.emit('anim');
    toast(res.info, 'ok');
  } catch (e) { toast(e.message, 'err'); }
  bt.disabled = false;
}
