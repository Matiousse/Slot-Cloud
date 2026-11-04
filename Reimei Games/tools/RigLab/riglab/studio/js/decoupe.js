/* DÉCOUPE : tirer des pièces d'une image (lasso, baguette magique), créer
   des lueurs. Le serveur découpe, rebouche le trou et écrit les images. */
import * as PIXI from '../../vendor/pixi.min.mjs';
import { S, bus, api, edit, part, reloadFiles, save } from './store.js';
import { V, imageToScreen, fit } from './viewport.js';
import { el, svg, modal, toast } from './ui.js';

const st = { outil: 'lasso', source: 'corps.webp', poly: [], ferme: false, seed: null, tol: 32, contigu: true, mode: 'union', contour: 6, lueurs: [], rayon: 70, couleur: '#ffcf6e', alpha: 200, masque: null };
let imgSprite = null, maskSprite = null, freehand = null, timer = 0;

export function initDecoupe() {
  bus.on('mode', () => (S.mode === 'decoupe' ? enter() : leave()));
  bus.on('open', () => { reset(); if (S.mode === 'decoupe') enter(); });
}
function reset() { st.poly = []; st.ferme = false; st.seed = null; st.lueurs = []; st.masque = null; }

async function enter() {
  if (!S.rig) return;
  if (!S.fichiers.includes(st.source)) st.source = S.fichiers.includes('corps.webp') ? 'corps.webp' : S.fichiers[0];
  V.handlers = { down, move, up };
  V.drawCustom = drawOverlay;
  await showImage();
  renderBar();
  setTimeout(fit, 20);
}
function leave() {
  V.handlers = null; V.drawCustom = null;
  V.customLayer && V.customLayer.removeChildren().forEach((c) => c.destroy());
  imgSprite = maskSprite = null;
}
async function showImage() {
  V.customLayer.removeChildren().forEach((c) => c.destroy());
  const t = S.tex[st.source] || await PIXI.Assets.load(`/f/${S.p}/${S.s}/${st.source}?v=${Date.now()}`);
  const [W, H] = S.rig.size;
  // damier discret derrière, pour voir la transparence
  const chk = new PIXI.Graphics();
  const c = 24;
  for (let y = 0; y < H; y += c) for (let x = 0; x < W; x += c) if (((x / c) + (y / c)) % 2 === 0) chk.rect(x - W / 2, y - H / 2, Math.min(c, W - x), Math.min(c, H - y)).fill({ color: 0x1d2029 });
  chk.rect(-W / 2, -H / 2, W, H).stroke({ color: 0x323846, width: 2 });
  imgSprite = new PIXI.Sprite(t);
  const p = S.rig.parts.find((q) => q.src === st.source);
  const off = (p && p.offset) || [0, 0];
  imgSprite.position.set(-W / 2 + off[0], -H / 2 + off[1]);
  maskSprite = new PIXI.Sprite(); maskSprite.position.set(-W / 2, -H / 2);
  V.customLayer.addChild(chk, imgSprite, maskSprite);
  refreshMask();
}

/* ---------------- barre d'outils ---------------- */
function renderBar() {
  const bar = document.getElementById('decoupeBar');
  bar.innerHTML = '';
  const imgs = S.fichiers.filter((f) => /\.(webp|png)$/i.test(f));
  const src = el('select', { class: 'sel', title: 'Image à découper' }, ...imgs.map((f) => el('option', { value: f, text: f, selected: f === st.source })));
  src.onchange = () => { st.source = src.value; reset(); showImage(); renderBar(); };
  bar.append(src);
  const seg = el('div', { class: 'seg sm' });
  for (const [v, l, ic] of [['lasso', 'Lasso', 'lasso'], ['baguette', 'Baguette', 'wand'], ['lueur', 'Lueur', 'glow']]) {
    seg.append(el('button', { class: st.outil === v ? 'on' : '', html: `<span class="ic">${svg(ic)}</span>${l}`, onclick: () => { st.outil = v; renderBar(); V.app && bus.emit('view'); } }));
  }
  bar.append(seg, el('span', { class: 'vsep' }));
  const range = (label, key, min, max, step = 1, fn) => {
    const o = el('output', { text: st[key] });
    const r = el('input', { type: 'range', min, max, step, value: st[key], style: 'width:90px' });
    r.oninput = () => { st[key] = +r.value; o.textContent = r.value; fn && fn(); };
    return el('label', {}, label, r, o);
  };
  if (st.outil !== 'lueur') {
    if (st.outil === 'baguette') {
      bar.append(range('Tolérance', 'tol', 2, 120, 1, refreshMaskSoon));
      const ct = el('button', { class: 'chip' + (st.contigu ? ' on' : ''), text: 'Contiguë', title: 'Seulement la zone touchée (sinon toute la couleur de l\'image)', onclick: () => { st.contigu = !st.contigu; renderBar(); refreshMask(); } });
      bar.append(ct);
      if (st.poly.length >= 3) bar.append(el('button', { class: 'chip' + (st.mode === 'inter' ? ' on' : ''), text: 'Dans le lasso', title: 'Seulement la couleur à l\'intérieur du lasso', onclick: () => { st.mode = st.mode === 'inter' ? 'union' : 'inter'; renderBar(); refreshMask(); } }));
    }
    bar.append(range('Trait', 'contour', 0, 30, 1, refreshMaskSoon));
    bar.append(el('span', { class: 'vsep' }));
    const has = (st.poly.length >= 3 && st.ferme) || st.seed;
    bar.append(el('button', { class: 'btn sm primary', html: svg('scissors') + 'Détacher', disabled: !has, title: 'La zone devient une pièce ; le trou dans l\'image est rebouché', onclick: () => detacher('detacher') }));
    bar.append(el('button', { class: 'btn sm', html: svg('layers') + 'Surimpression', disabled: !has, title: 'Copie de la zone qui suit le corps : pour la faire briller ou gonfler sans couture', onclick: () => detacher('surimpression') }));
    bar.append(el('button', { class: 'btn sm ghost', text: 'Effacer', onclick: () => { reset(); refreshMask(); renderBar(); } }));
  } else {
    bar.append(range('Rayon', 'rayon', 8, 500, 1));
    bar.append(range('Force', 'alpha', 30, 255, 1));
    const col = el('input', { type: 'color', value: st.couleur, class: 'color-in', style: 'width:40px' });
    col.oninput = () => (st.couleur = col.value);
    bar.append(el('label', {}, 'Couleur', col));
    bar.append(el('span', { class: 'vsep' }));
    bar.append(el('button', { class: 'btn sm primary', html: svg('glow') + `Créer la lueur (${st.lueurs.length})`, disabled: !st.lueurs.length, onclick: creerLueur }));
    bar.append(el('button', { class: 'btn sm ghost', text: 'Effacer', onclick: () => { st.lueurs = []; renderBar(); } }));
  }
  const hint = document.getElementById('hint');
  hint.innerHTML = st.outil === 'lasso' ? '<b>Lasso</b> : clique point par point autour de la pièce (ou glisse à main levée), clique le premier point pour fermer · <b>Retour</b> : retirer un point'
    : st.outil === 'baguette' ? '<b>Baguette</b> : clique une couleur de la pièce · combine avec un lasso pour limiter la zone'
      : '<b>Lueur</b> : clique où la lumière doit naître (plusieurs points possibles : deux yeux)';
}

/* ---------------- souris ---------------- */
function down(e, [x, y]) {
  if (st.outil === 'lueur') { st.lueurs.push([Math.round(x), Math.round(y)]); renderBar(); return; }
  if (st.outil === 'baguette') { st.seed = [Math.round(x), Math.round(y)]; refreshMask(); renderBar(); return; }
  // lasso
  if (st.ferme) { st.poly = []; st.ferme = false; }
  if (st.poly.length >= 3) {
    const [fx, fy] = imageToScreen(...st.poly[0]);
    if (Math.hypot(fx - e.offsetX, fy - e.offsetY) < 10) { st.ferme = true; refreshMask(); renderBar(); return; }
  }
  st.poly.push([Math.round(x), Math.round(y)]);
  freehand = { n: st.poly.length };
}
function move(e, [x, y]) {
  if (freehand && e.buttons & 1) {
    const l = st.poly[st.poly.length - 1];
    if (Math.hypot(l[0] - x, l[1] - y) > 6 / V.zoom * 2) { st.poly.push([Math.round(x), Math.round(y)]); freehand.drew = true; }
  }
}
function up() {
  if (freehand && freehand.drew && st.poly.length > 8) { st.ferme = true; refreshMask(); renderBar(); }
  freehand = null;
}
addEventListener('keydown', (e) => {
  if (S.mode !== 'decoupe' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Backspace' && st.poly.length && !st.ferme) { st.poly.pop(); e.preventDefault(); }
  if (e.key === 'Enter' && st.poly.length >= 3) { st.ferme = true; refreshMask(); renderBar(); }
  if (e.key === 'Escape') { reset(); refreshMask(); renderBar(); }
});

function drawOverlay(g) {
  // lasso
  if (st.poly.length) {
    const pts = st.poly.map((p) => imageToScreen(...p));
    g.moveTo(...pts[0]); pts.forEach((p) => g.lineTo(...p)); if (st.ferme) g.lineTo(...pts[0]);
    g.stroke({ color: 0xffffff, width: 2, alpha: .95 });
    g.moveTo(...pts[0]); pts.forEach((p) => g.lineTo(...p)); if (st.ferme) g.lineTo(...pts[0]);
    g.stroke({ color: 0x56c7f0, width: 1, alpha: 1 });
    if (!st.ferme) pts.forEach((p, i) => g.circle(p[0], p[1], i ? 2.5 : 5).fill({ color: i ? 0xffffff : 0x56c7f0 }));
  }
  if (st.seed && st.outil !== 'lueur') { const [sx, sy] = imageToScreen(...st.seed); g.circle(sx, sy, 6).stroke({ color: 0xffd27a, width: 2 }); g.circle(sx, sy, 2).fill({ color: 0xffd27a }); }
  for (const c of st.lueurs) {
    const [sx, sy] = imageToScreen(...c);
    g.circle(sx, sy, st.rayon * V.zoom).fill({ color: parseInt(st.couleur.slice(1), 16), alpha: .18 }).stroke({ color: parseInt(st.couleur.slice(1), 16), width: 1.5 });
    g.circle(sx, sy, 3).fill({ color: 0xffffff });
  }
}

/* ---------------- masque ---------------- */
function selection() {
  const sel = { contour: st.contour, mode: st.mode };
  if (st.poly.length >= 3 && st.ferme) sel.poly = st.poly;
  if (st.seed) sel.baguette = { x: st.seed[0], y: st.seed[1], tol: st.tol, contigu: st.contigu };
  return sel;
}
function refreshMaskSoon() { clearTimeout(timer); timer = setTimeout(refreshMask, 180); }
async function refreshMask() {
  if (!maskSprite) return;
  const sel = selection();
  if (!sel.poly && !sel.baguette) { maskSprite.visible = false; return; }
  try {
    const r = await api('/api/masque', { p: S.p, s: S.s, source: st.source, sel });
    const img = new Image(); img.src = r.png; await img.decode();
    maskSprite.texture = PIXI.Texture.from(img); maskSprite.visible = true;
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- actions ---------------- */
async function detacher(action) {
  const parents = S.rig.parts.map((p) => p.name);
  const src = S.rig.parts.find((p) => p.src === st.source);
  const defParent = part('haut') ? 'haut' : src ? src.parent || src.name : parents[0];
  const r = await modal({
    title: action === 'detacher' ? 'Détacher en pièce' : 'Surimpression',
    text: action === 'detacher' ? `La zone devient une pièce qui peut bouger. Dans <b>${st.source}</b>, le trou est rebouché (l'ancienne image est gardée dans l'historique).` : 'Copie de la zone, de la taille de l\'image, qui se déforme comme le corps. On l\'anime avec le flash, le gonflement, le reflet : aucune couture possible.',
    fields: [{ id: 'nom', label: 'Nom de la pièce', value: action === 'detacher' ? 'piece' : 'brillance' }, ...(action === 'detacher' ? [{ id: 'parent', label: 'Portée par', type: 'select', options: parents, value: defParent }] : [])],
    ok: action === 'detacher' ? 'Détacher' : 'Créer',
  });
  if (!r) return;
  const nom = r.nom.trim().replace(/[^\w\-]+/g, '-');
  if (!nom || part(nom)) return toast('Nom vide ou déjà pris', 'err');
  try {
    const res = await api('/api/decoupe', { p: S.p, s: S.s, source: st.source, sel: selection(), nom, action });
    await reloadFiles(PIXI);
    edit(action === 'detacher' ? 'détacher ' + nom : 'surimpression ' + nom, (rig) => {
      const i = rig.parts.findIndex((p) => p.src === st.source);
      let np;
      if (action === 'detacher') { np = { name: nom, src: res.fichier, pivot: res.centre, parent: r.parent }; if (res.offset && (res.offset[0] || res.offset[1])) np.offset = res.offset; }
      else {
        const base = src || rig.parts[0];
        np = { name: nom, src: res.fichier, pivot: [...base.pivot], parent: base.parent || undefined };
        if (base.mesh) np.mesh = { ...JSON.parse(JSON.stringify(base.mesh)), follow: base.name };
        if (!np.parent) delete np.parent;
      }
      rig.parts.splice(i + 1, 0, np);
    }, { structure: true, merge: false });
    reset(); S.sel = [nom];
    await save(); // les images sont déjà écrites : le rig doit suivre tout de suite
    toast(action === 'detacher' ? `« ${nom} » détachée et enregistrée. Place son pivot en mode Rig (P).` : `Surimpression « ${nom} » créée et enregistrée`, 'ok');
    await showImage(); renderBar();
  } catch (e) { toast(e.message, 'err'); }
}

async function creerLueur() {
  const parents = S.rig.parts.map((p) => p.name);
  const r = await modal({ title: 'Créer la lueur', text: 'Halo additif doux. Au repos il reste discret ; on l\'allume au gain.', fields: [{ id: 'nom', label: 'Nom', value: 'lueur' }, { id: 'parent', label: 'Portée par', type: 'select', options: parents, value: part('haut') ? 'haut' : parents[0] }], ok: 'Créer' });
  if (!r) return;
  const nom = r.nom.trim().replace(/[^\w\-]+/g, '-');
  if (!nom || part(nom)) return toast('Nom vide ou déjà pris', 'err');
  try {
    const c = st.couleur;
    const res = await api('/api/lueur', { p: S.p, s: S.s, nom, centres: st.lueurs, rayon: st.rayon, couleur: c, alpha: st.alpha });
    await reloadFiles(PIXI);
    const cx = Math.round(st.lueurs.reduce((s, q) => s + q[0], 0) / st.lueurs.length), cy = Math.round(st.lueurs.reduce((s, q) => s + q[1], 0) / st.lueurs.length);
    edit('lueur ' + nom, (rig) => {
      rig.parts.push({ name: nom, src: res.fichier, pivot: [cx, cy], parent: r.parent, blend: 'add', offset: res.offset });
      for (const a of Object.values(rig.anims)) { a.tracks ||= {}; if (!a.tracks[nom]) a.tracks[nom] = [{ t: 0, alpha: .25 }]; }
    }, { structure: true, merge: false });
    st.lueurs = []; S.sel = [nom];
    await save();
    toast(`Lueur « ${nom} » créée (repos à 25 %) et enregistrée`, 'ok');
    renderBar();
  } catch (e) { toast(e.message, 'err'); }
}
