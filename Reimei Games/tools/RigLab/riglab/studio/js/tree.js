/* PANNEAU DE GAUCHE : arbre des pièces (ordre de dessin, parents) et
   liste des animations. */
import { S, bus, part, edit, treeOrder, kind, KIND_LABEL, KIND_ICON, descendants } from './store.js';
import { el, menu, ask, confirmBox, toast, svg } from './ui.js';

export function initTree() {
  bus.on('rig', render);
  bus.on('sel', render);
  bus.on('open', render);
  bus.on('mode', render);
  bus.on('anim', renderAnims);
  bus.on('notes', renderAnims);
  document.getElementById('bAnimAdd').onclick = newAnim;
  document.getElementById('bShowBones').onclick = () => { S.showBones = !S.showBones; bus.emit('view'); render(); };
  document.getElementById('bAddBone').onclick = addBone;
}

function render() { renderTree(); renderAnims(); }

function renderTree() {
  const box = document.getElementById('tree');
  box.innerHTML = '';
  document.getElementById('bShowBones').classList.toggle('on', S.showBones);
  if (!S.rig) return;
  const tracks = S.rig.anims[S.anim]?.tracks || {};
  for (const { p, depth } of treeOrder()) {
    const k = kind(p);
    const animated = tracks[p.name] && tracks[p.name].length;
    const hid = S.hidden.has(p.name);
    const eye = el('button', { class: 'eye' + (hid ? ' off' : ''), title: hid ? 'Afficher dans l\'éditeur' : 'Masquer dans l\'éditeur', html: svg(hid ? 'eyeoff' : 'eye') });
    const idx = S.rig.parts.indexOf(p);
    const row = el('div', {
      class: 'node' + (S.sel.includes(p.name) ? ' sel' : ''),
      style: { paddingLeft: 6 + depth * 14 + 'px' }, draggable: 'true', title: `${KIND_LABEL[k]} · ordre ${idx}`,
    },
    el('span', { class: 'ty', html: svg(KIND_ICON[k]) }),
    el('span', { class: 'nm', text: p.name }),
    S.mode === 'rig' ? el('span', { class: 'badge', text: idx, title: 'ordre de dessin' }) : animated ? el('span', { class: 'kdot', title: 'animée dans ' + S.anim }) : null,
    eye);
    row.onclick = (e) => {
      if (e.target.closest('.eye')) return;
      if (e.shiftKey) S.sel = S.sel.includes(p.name) ? S.sel.filter((n) => n !== p.name) : [...S.sel, p.name];
      else S.sel = [p.name];
      bus.emit('sel');
    };
    eye.onclick = () => { hid ? S.hidden.delete(p.name) : S.hidden.add(p.name); bus.emit('rig', { structure: true, label: 'visibilité' }); };
    row.oncontextmenu = (e) => { e.preventDefault(); if (!S.sel.includes(p.name)) { S.sel = [p.name]; bus.emit('sel'); } partMenu(e.clientX, e.clientY, p); };
    // glisser-déposer : change l'ordre de dessin
    row.ondragstart = (e) => { e.dataTransfer.setData('text/rig-part', p.name); };
    row.ondragover = (e) => { e.preventDefault(); row.classList.add('drop-before'); };
    row.ondragleave = () => row.classList.remove('drop-before');
    row.ondrop = (e) => {
      e.preventDefault(); row.classList.remove('drop-before');
      const src = e.dataTransfer.getData('text/rig-part'); if (!src || src === p.name) return;
      edit('ordre de dessin', (rig) => {
        const a = rig.parts.findIndex((q) => q.name === src);
        const [it] = rig.parts.splice(a, 1);
        const b = rig.parts.findIndex((q) => q.name === p.name);
        rig.parts.splice(b, 0, it);
      }, { structure: true, merge: false });
    };
    box.append(row);
  }
}

export function partMenu(x, y, p) {
  const idx = S.rig.parts.indexOf(p);
  menu(x, y, [
    { head: p.name },
    { label: 'Renommer…', icon: 'edit', fn: () => renamePart(p) },
    { label: 'Vers l\'avant (dessin)', icon: 'up', disabled: idx >= S.rig.parts.length - 1, fn: () => moveOrder(p, 1) },
    { label: 'Vers l\'arrière (dessin)', icon: 'down', disabled: idx <= 0, fn: () => moveOrder(p, -1) },
    { label: 'Ajouter un os enfant', icon: 'bone', fn: () => addBone(p.name) },
    '-',
    { label: 'Supprimer la pièce', icon: 'trash', danger: true, fn: () => deletePart(p) },
  ]);
}
function moveOrder(p, d) {
  edit('ordre de dessin', (rig) => {
    const i = rig.parts.indexOf(p), j = i + d;
    if (j < 0 || j >= rig.parts.length) return;
    [rig.parts[i], rig.parts[j]] = [rig.parts[j], rig.parts[i]];
  }, { structure: true, merge: false });
}
export async function renamePart(p) {
  const n = await ask('Renommer la pièce', 'Nouveau nom', p.name);
  if (!n || n === p.name) return;
  if (!/^[\w\-]+$/.test(n)) return toast('Lettres, chiffres, - et _ seulement', 'err');
  if (part(n)) return toast('Ce nom est déjà pris', 'err');
  const old = p.name;
  edit('renommer', (rig) => {
    for (const q of rig.parts) {
      if (q.name === old) q.name = n;
      if (q.parent === old) q.parent = n;
      if (q.clip === old) q.clip = n;
      if (q.mesh) {
        if (q.mesh.follow === old) q.mesh.follow = n;
        (q.mesh.bones || []).forEach((b) => { if (typeof b === 'object' && b.name === old) b.name = n; });
        if (q.mesh.bones) q.mesh.bones = q.mesh.bones.map((b) => (b === old ? n : b));
      }
    }
    for (const a of Object.values(rig.anims)) if (a.tracks && a.tracks[old]) { a.tracks[n] = a.tracks[old]; delete a.tracks[old]; }
    for (const e of Object.values(rig.emitters || {})) if (e.part === old) e.part = n;
    for (const c of rig.ik || []) { c.bones = c.bones.map((b) => (b === old ? n : b)); if (c.target === old) c.target = n; if (c.tip === old) c.tip = n; }
    for (const c of rig.constraints || []) { if (c.part === old) c.part = n; if (c.cible === old) c.cible = n; }
  }, { structure: true, merge: false });
  S.sel = S.sel.map((x) => (x === old ? n : x));
  bus.emit('sel');
}
async function deletePart(p) {
  const kids = descendants(p.name);
  if (!(await confirmBox('Supprimer la pièce ?', `« ${p.name} »${kids.length ? ` et ses ${kids.length} enfant(s) seront rattachés à son parent` : ''}. Ses clés dans toutes les animations disparaissent aussi.`, 'Supprimer'))) return;
  edit('supprimer ' + p.name, (rig) => {
    for (const q of rig.parts) if (q.parent === p.name) q.parent = p.parent || null;
    rig.parts.splice(rig.parts.indexOf(p), 1);
    for (const a of Object.values(rig.anims)) if (a.tracks) delete a.tracks[p.name];
    for (const q of rig.parts) if (q.mesh && q.mesh.bones) q.mesh.bones = q.mesh.bones.filter((b) => (b.name || b) !== p.name);
    rig.ik = (rig.ik || []).filter((c) => !c.bones.includes(p.name) && c.target !== p.name && c.tip !== p.name);
  }, { structure: true, merge: false });
  S.sel = []; bus.emit('sel');
}
async function addBone(parentName) {
  if (typeof parentName !== 'string') parentName = S.sel[0] || null;
  const n = await ask('Nouvel os', 'Nom de l\'os', 'os' + (S.rig.parts.length + 1), 'Un os n\'a pas d\'image : il sert à porter et à faire bouger d\'autres pièces. Place-le ensuite avec l\'outil Pivot (P).');
  if (!n) return;
  if (part(n)) return toast('Ce nom est déjà pris', 'err');
  const par = parentName ? part(parentName) : null;
  const piv = par ? [par.pivot[0], par.pivot[1] - 60] : [S.rig.size[0] / 2, S.rig.size[1] / 2];
  edit('ajouter un os', (rig) => { rig.parts.unshift({ name: n, pivot: piv.map(Math.round), parent: parentName }); if (!parentName) delete rig.parts[0].parent; }, { structure: true, merge: false });
  S.sel = [n]; bus.emit('sel');
}

/* ---------------- animations ---------------- */
function renderAnims() {
  const box = document.getElementById('anims');
  box.innerHTML = '';
  if (!S.rig) return;
  for (const [n, a] of Object.entries(S.rig.anims)) {
    const note = S.notes[n];
    const cls = note == null ? '' : note >= 8.5 ? 'good' : note >= 6.5 ? 'mid' : 'bad';
    const more = el('button', { class: 'icon-btn sm more', html: svg('more'), title: 'Actions' });
    const row = el('div', { class: 'anim-item' + (n === S.anim ? ' on' : '') },
      el('span', { class: 'nm', text: n }),
      note != null ? el('span', { class: 'note ' + cls, text: note.toFixed(1), title: 'Note du contrôle qualité' }) : null,
      a.loop ? el('span', { class: 'lp', title: 'Boucle', html: svg('loop') }) : null,
      el('span', { class: 'd', text: a.dur + ' ms' }),
      more);
    row.onclick = (e) => { if (e.target.closest('.more')) return; selectAnim(n); };
    const m = (e) => { e.preventDefault(); e.stopPropagation(); animMenu(e.clientX, e.clientY, n); };
    more.onclick = m; row.oncontextmenu = m;
    box.append(row);
  }
}
export function selectAnim(n) {
  if (!S.rig.anims[n]) return;
  S.anim = n; S.t = 0; S.selKeys = []; S.selEvent = null;
  if (S.mode !== 'animer' && S.mode !== 'apercu') { S.mode = 'animer'; bus.emit('mode'); }
  bus.emit('anim'); bus.emit('rig', { structure: true, label: 'animation' });
}
function animMenu(x, y, n) {
  menu(x, y, [
    { head: n },
    { label: 'Renommer…', icon: 'edit', fn: async () => {
      const v = await ask('Renommer l\'animation', 'Nouveau nom', n); if (!v || v === n) return;
      if (S.rig.anims[v]) return toast('Ce nom est déjà pris', 'err');
      edit('renommer l\'animation', (rig) => { const o = {}; for (const [k, a] of Object.entries(rig.anims)) o[k === n ? v : k] = a; rig.anims = o; for (const [k, m] of Object.entries(rig.mixes || {})) { const nk = k.split('>').map((x) => (x === n ? v : x)).join('>'); if (nk !== k) { rig.mixes[nk] = m; delete rig.mixes[k]; } } }, { structure: true, merge: false });
      if (S.anim === n) S.anim = v; bus.emit('anim');
    } },
    { label: 'Dupliquer', icon: 'copy', fn: () => {
      let v = n + '-2', i = 2; while (S.rig.anims[v]) v = `${n}-${++i}`;
      edit('dupliquer l\'animation', (rig) => { rig.anims[v] = JSON.parse(JSON.stringify(rig.anims[n])); }, { structure: true, merge: false });
      selectAnim(v);
    } },
    { label: 'Nouvelle à partir de la pose…', icon: 'plus', fn: newAnim },
    '-',
    { label: 'Supprimer', icon: 'trash', danger: true, disabled: Object.keys(S.rig.anims).length <= 1, fn: async () => {
      if (!(await confirmBox('Supprimer l\'animation ?', `« ${n} » et toutes ses clés.`, 'Supprimer'))) return;
      edit('supprimer l\'animation', (rig) => { delete rig.anims[n]; }, { structure: true, merge: false });
      if (S.anim === n) selectAnim(Object.keys(S.rig.anims)[0]);
      else bus.emit('anim');
    } },
  ]);
}
async function newAnim() {
  if (!S.rig) return;
  const n = await ask('Nouvelle animation', 'Nom', 'nouvelle', 'Noms du jeu : <b>idle</b> (repos), <b>land</b> (arrivée), <b>win</b> (gain), <b>remove</b> (disparition). Pour un moment fort : début / boucle / fin.');
  if (!n) return;
  if (S.rig.anims[n]) return toast('Ce nom est déjà pris', 'err');
  const durs = { idle: 2800, land: 730, win: 1370, remove: 330 };
  edit('nouvelle animation', (rig) => { rig.anims[n] = { dur: durs[n] || 1000, loop: n === 'idle', tracks: {} }; }, { structure: true, merge: false });
  selectAnim(n);
}
