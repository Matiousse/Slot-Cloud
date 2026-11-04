/* ACCUEIL : tous les projets et leurs symboles ; nouveau symbole. */
import { S, bus, api } from './store.js';
import { el, svg, modal, toast } from './ui.js';

let openFn = null;
export function initAccueil(onOpen) {
  openFn = onOpen;
  document.getElementById('crumb').onclick = () => show();
}
export async function show() {
  const h = document.getElementById('home');
  h.hidden = false;
  h.innerHTML = '';
  const inner = el('div', { class: 'home-in' });
  h.append(inner);
  const close = el('button', { class: 'btn ghost', html: svg('x') + 'Fermer', onclick: () => (h.hidden = true), disabled: !S.rig });
  inner.append(el('div', { class: 'home-top' }, el('h1', { html: 'Tes symboles<small>Choisis un symbole à rigger ou à animer. Les modifications s\'enregistrent dans le jeu, l\'ancienne version est gardée.</small>' }),
    el('button', { class: 'btn', html: svg('folder') + 'Ajouter un projet', onclick: addProject }), close));
  let projets;
  try { projets = await api('/api/projets'); } catch (e) { inner.append(el('p', { class: 'note-p', text: 'Serveur injoignable : ' + e.message })); return; }
  S.projets = projets;
  for (const p of projets) {
    const sec = el('div', { class: 'proj' });
    sec.append(el('div', { class: 'proj-h' }, el('h2', { text: p.nom }), el('span', { text: `${p.symboles.length} symbole(s)${p.existe ? '' : ' · dossier introuvable'}` })));
    const cards = el('div', { class: 'cards' });
    for (const s of p.symboles) {
      const nA = Object.keys(s.anims || {}).length;
      const c = el('div', { class: 'card' + (S.p === p.id && S.s === s.nom ? ' cur' : '') },
        el('div', { class: 'th' }, s.vignette ? el('img', { src: s.vignette + '?v=' + Math.round(s.modifie || 0), loading: 'lazy', alt: s.nom }) : el('span', { html: svg('bone') })),
        el('div', { class: 'cb' }, el('b', { text: s.nom }), el('span', { text: s.erreur ? 'rig illisible' : `${nA} anim. · ${s.pieces} pièces` })));
      c.onclick = async () => { if (await openFn(p.id, s.nom)) h.hidden = true; };
      cards.append(c);
    }
    const nw = el('div', { class: 'card new' }, el('div', { class: 'th', html: `<span style="display:grid;place-items:center;gap:8px;font-weight:600;font-size:12px"><span style="width:28px;height:28px;display:block">${svg('plus')}</span>Nouveau symbole</span>` }), el('div', { class: 'cb' }, el('b', { text: 'Depuis une image' }), el('span', { text: 'PNG / WebP détouré' })));
    nw.onclick = () => nouveau(p.id);
    cards.append(nw);
    sec.append(cards);
    inner.append(sec);
  }
}

async function nouveau(pid) {
  const r = await modal({
    title: 'Nouveau symbole',
    text: 'Glisse une image détourée (fond transparent). Rig Lab la recadre, crée l\'os du bas et l\'os du haut, un corps souple, et les cinq animations de départ (repos, arrivée, gain, disparition, éclat). Tu découpes ensuite les pièces qui bougent.',
    fields: [{ id: 'f', label: 'Image', type: 'file' }, { id: 'n', label: 'Nom du symbole', value: '', placeholder: 'couronne, wild, scatter…' }, { id: 'c', label: 'Taille max (px)', value: '640', help: '640 suffit pour une case de jeu (écran Retina compris).' }],
    ok: 'Créer',
  });
  if (!r) return;
  if (!r.f) return toast('Choisis une image', 'err');
  const nom = (r.n || r.f.name.replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^\w\-]+/g, '-');
  const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.f); });
  try {
    await api('/api/nouveau', { p: pid, s: nom, image: data, cote: +r.c || 640 });
    toast(`Symbole « ${nom} » créé`, 'ok');
    if (await openFn(pid, nom)) { document.getElementById('home').hidden = true; S.mode = 'decoupe'; bus.emit('mode'); }
  } catch (e) { toast(e.message, 'err'); }
}

async function addProject() {
  const r = await modal({
    title: 'Ajouter un projet',
    text: 'Un projet = un jeu. Rig Lab y cherche les rigs dans <b>art/symbols/rig/</b> (réglable).',
    fields: [{ id: 'id', label: 'Identifiant', placeholder: 'golem-1000' }, { id: 'nom', label: 'Nom', placeholder: 'GOLEM 1000' }, { id: 'dossier', label: 'Dossier du jeu (chemin complet)', placeholder: '/Users/Fyxx/…' },
      { id: 'rigs', label: 'Dossier des rigs (dans le jeu)', value: 'art/symbols/rig' }],
    ok: 'Ajouter',
  });
  if (!r) return;
  try { await api('/api/projets', r); toast('Projet ajouté', 'ok'); show(); } catch (e) { toast(e.message, 'err'); }
}
