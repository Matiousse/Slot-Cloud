/* ATELIER DE CLAUDE — ce que Claude utilise pour voir et juger une animation
   sans regarder une vidéo : planche-contact image par image, trajectoires
   (l'espacement des points = la vitesse), courbes de chaque propriété, et le
   contrôle qualité. Tout est rendu dans une image PNG envoyée au serveur
   (riglab/captures/), que Claude lit ensuite.

   API : window.RL
     await RL.charger(p, s)
     await RL.planche({ anim, n, cols, taille })       → dataURL
     await RL.courbes({ anim })                          → dataURL
     await RL.controle(anim?)                            → rapport (toutes les anims si vide)
     await RL.parite({ n })                              → écart moteur v3 / v2
     await RL.envoyer(nom, dataURL)
   URL : /claude/?p=atelier&s=roi&faire=planche&anim=win&n=12&sortie=roi-win.png
         faire = planche | courbes | controle | parite | tout */
import * as PIXI from '../vendor/pixi.min.mjs';
import { buildSymbol, sampleTrack, rigImages, rigFeatures, easeOf } from '../engine/symbol-rig.js';
import { analyser, simuler } from '../engine/analyse.js';

const DT = 1000 / 60;
const COULEURS = ['#ff5d7a', '#ffb347', '#7ee081', '#5cc8ff', '#b38cff', '#ff8ad8', '#f5e663', '#6ef0d2', '#ff7a45', '#9fb4ff', '#d4ff6b', '#ffa3a3'];
const PROP_COUL = { rot: '#ff5d7a', x: '#5cc8ff', y: '#7ee081', sx: '#ffb347', sy: '#f5e663', alpha: '#b38cff', flash: '#ffffff', shine: '#fff1b8', bend: '#6ef0d2', bulge: '#ff8ad8', bulge2: '#ff8ad8', bulge3: '#ff8ad8', bulge4: '#ff8ad8', wave: '#9fb4ff', taper: '#d4ff6b', skx: '#ff7a45', sky: '#ff7a45' };

let app, rig, tex, P, S;
const $ = (id) => document.getElementById(id);
const log = (m) => { const el = $('log'); if (el) el.textContent += m + '\n'; console.log(m); };

async function initPixi(taille = 240) {
  if (app) { app.renderer.resize(taille, taille); return app; }
  app = new PIXI.Application();
  await app.init({ width: taille, height: taille, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resolution: 1, preference: 'webgl' });
  return app;
}

async function chargerTextures(p, s, r) {
  const t = {};
  await Promise.all(rigImages(r).map(async (f) => { try { t[f] = await PIXI.Assets.load(`/f/${p}/${s}/${f}?v=${Date.now()}`); } catch (e) { log('image manquante : ' + f); } }));
  return t;
}

async function charger(p, s) {
  P = p; S = s;
  rig = await (await fetch(`/api/rig?p=${p}&s=${s}`, { cache: 'no-store' })).json();
  if (rig.erreur) throw new Error(rig.erreur);
  tex = await chargerTextures(p, s, rig);
  await document.fonts.ready;
  return rig;
}

/* générateur pseudo-aléatoire fixe : deux rendus identiques image pour image */
function graine(seed = 7) {  // eslint-disable-line
  let s = seed >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* Rend `anim` à des instants donnés ; rappelle `chaque(i, canvas)` */
async function rendre(anim, temps, taille, chaque, { moteur = buildSymbol, marge = 1.4, fond = true } = {}) {
  await initPixi(taille);
  graine();
  const a = rig.anims[anim];
  const sym = moteur(PIXI, rig, tex);
  sym.resetPhysics?.();
  const stage = new PIXI.Container();
  const cell = new PIXI.Graphics();
  const k = taille / (Math.max(...rig.size) * marge);
  if (fond) {
    const w = rig.size[0] * k, h = rig.size[1] * k;
    cell.roundRect(taille / 2 - w / 2, taille / 2 - h / 2, w, h, 10).fill({ color: 0x1f1a2b }).stroke({ color: 0x3b3350, width: 1.5 });
  }
  stage.addChild(cell, sym);
  sym.scale.set(k); sym.position.set(taille / 2, taille / 2);
  sym.play(anim, { mix: 0, then: null, loop: false });
  sym.update(0);
  let t = 0, i = 0;
  const cibles = [...temps].sort((x, y) => x - y);
  for (const cible of cibles) {
    while (t + DT <= cible + 1e-6) { sym.update(DT); t += DT; }
    const reste = cible - t;
    if (reste > .01) { sym.update(reste); t = cible; }
    app.renderer.render({ container: stage });
    await chaque(i++, app.canvas, sym);
  }
  stage.destroy({ children: true });
  void a;
}

function titre(g, x, y, txt, taille = 15, coul = '#efe9f7', poids = 600) {
  g.font = `${poids} ${taille}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillStyle = coul; g.textBaseline = 'top'; g.fillText(txt, x, y);
}

/* ---------------- planche-contact ---------------- */
async function planche({ anim = 'win', n = 12, cols = 6, taille = 220, trajets = true, courbes: avecCourbes = true, temps: tList = null } = {}) {
  const a = rig.anims[anim];
  if (!a) throw new Error(`animation ${anim} introuvable`);
  const temps = tList || Array.from({ length: n }, (_, i) => (a.dur * i) / (n - 1));
  n = temps.length;
  const rows = Math.ceil(n / cols);
  const head = 54, pad = 10;
  const TW = taille * 2 + pad;
  const W = cols * (taille + pad) + pad;
  const hCourbes = avecCourbes ? 26 + lignesCourbes(anim).length * 38 + 30 : 0;
  const H = head + rows * (taille + pad + 18) + (trajets ? TW + 30 : 0) + hCourbes + pad;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#12101a'; g.fillRect(0, 0, W, H);
  titre(g, pad, 12, `${S} · ${anim} · ${a.dur} ms${a.loop ? ' · boucle' : ''} · ${n} images`, 18, '#ffd27a', 700);
  titre(g, pad, 34, `projet ${P} · ${Object.keys(a.tracks || {}).length} pistes · ${(a.events || []).length} événements · moteur v3${rigFeatures(rig).length ? ' (' + rigFeatures(rig).join(', ') + ')' : ''}`, 11, '#9d93b3', 400);
  await rendre(anim, temps, taille, async (i, canvas) => {
    const x = pad + (i % cols) * (taille + pad), y = head + Math.floor(i / cols) * (taille + pad + 18);
    g.drawImage(canvas, x, y);
    titre(g, x + 4, y + taille + 2, `${Math.round(temps[i])} ms`, 11, '#c9bfdd', 500);
    // événements dans l'intervalle
    const prev = i ? temps[i - 1] : -1;
    const evs = (a.events || []).filter((e) => e.t > prev && e.t <= temps[i]).map((e) => e.name || e.emit || 'rate');
    if (evs.length) titre(g, x + taille - 4 - evs.join(' ').length * 6.6, y + taille + 2, evs.join(' '), 11, '#7fe0c0', 500);
  });
  let y0 = head + rows * (taille + pad + 18);
  if (trajets) { await dessinerTrajets(g, anim, pad, y0 + 10, TW); y0 += TW + 30; }
  if (avecCourbes) dessinerCourbes(g, anim, pad, y0, W - 2 * pad);
  return cv.toDataURL('image/png');
}

/* ---------------- trajectoires ---------------- */
async function dessinerTrajets(g, anim, x0, y0, taille) {
  titre(g, x0, y0 - 2, 'TRAJECTOIRES — un point par image à 60 i/s : serrés = lent, espacés = rapide', 11, '#9d93b3', 600);
  y0 += 18;
  // pose de repos en fond
  let fondCanvas = null;
  await rendre(anim, [0], taille, async (i, canvas) => { fondCanvas = canvas; g.globalAlpha = .38; g.drawImage(canvas, x0, y0); g.globalAlpha = 1; }, { marge: 1.4 });
  void fondCanvas;
  graine();
  const im = simuler(PIXI, rig, tex, anim, { bornes: false });
  const k = taille / (Math.max(...rig.size) * 1.4);
  const cx = x0 + taille / 2, cy = y0 + taille / 2;
  const noms = rig.parts.map((p) => p.name);
  noms.forEach((nm, j) => {
    const c = COULEURS[j % COULEURS.length];
    const pts = im.map((f) => [cx + f.monde[nm][4] * k, cy + f.monde[nm][5] * k]);
    const long = pts.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    if (long < 2) return;
    g.strokeStyle = c; g.globalAlpha = .55; g.lineWidth = 1.5; g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    g.globalAlpha = 1; g.fillStyle = c;
    pts.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 7); g.fill(); });
    g.beginPath(); g.arc(pts[0][0], pts[0][1], 4.5, 0, 7); g.strokeStyle = '#fff'; g.stroke();
  });
  // légende
  let ly = y0;
  noms.forEach((nm, j) => {
    titre(g, x0 + taille + 16, ly, '● ' + nm, 12, COULEURS[j % COULEURS.length], 500); ly += 18;
  });
  // vitesse globale dans le temps
  const vx = x0 + taille + 150, vw = taille - 140, vh = 120;
  titre(g, vx, y0, 'VITESSE (pièce la plus rapide)', 11, '#9d93b3', 600);
  const R = Math.max(...rig.size) * .35;
  const vit = im.map((f, i) => (i ? Math.max(...noms.map((nm) => { const A = im[i - 1].monde[nm], B = f.monde[nm]; let da = Math.atan2(B[1], B[0]) - Math.atan2(A[1], A[0]); da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.hypot(B[4] - A[4], B[5] - A[5]) + Math.abs(da) * R; })) : 0));
  const mx = Math.max(1e-3, ...vit);
  g.strokeStyle = '#3b3350'; g.strokeRect(vx, y0 + 18, vw, vh);
  g.strokeStyle = '#ffd27a'; g.lineWidth = 1.6; g.beginPath();
  vit.forEach((v, i) => { const X = vx + (i / (vit.length - 1)) * vw, Y = y0 + 18 + vh - (v / mx) * vh; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  g.stroke();
  titre(g, vx, y0 + 22 + vh, `max ${mx.toFixed(1)} px/image`, 10, '#9d93b3', 400);
}

/* ---------------- courbes ---------------- */
function lignesCourbes(anim) {
  const a = rig.anims[anim], out = [];
  for (const [pn, tr] of Object.entries(a.tracks || {})) {
    const props = new Set();
    tr.forEach((k) => Object.keys(k).forEach((p) => { if (p !== 't' && p !== 'ease' && p !== 'tint' && p !== 'ffd' && p !== 'z' && p !== 'visible' && p !== 'frame') props.add(p); }));
    for (const p of props) {
      const vals = tr.filter((k) => p in k).map((k) => k[p]);
      if (vals.length < 2 || Math.max(...vals) - Math.min(...vals) < 1e-4) continue;
      out.push([pn, p]);
    }
  }
  return out;
}
function dessinerCourbes(g, anim, x0, y0, w) {
  const a = rig.anims[anim], L = lignesCourbes(anim);
  titre(g, x0, y0 + 4, 'COURBES — chaque ligne normalisée ; ◆ = clé ; la couleur de la clé = sa courbe (rouge linéaire, vert bézier/rebond)', 11, '#9d93b3', 600);
  y0 += 26;
  const lab = 150, hw = w - lab, rh = 38;
  L.forEach(([pn, p], i) => {
    const y = y0 + i * rh, tr = a.tracks[pn];
    g.fillStyle = i % 2 ? '#15121e' : '#1a1624'; g.fillRect(x0, y, w, rh - 2);
    titre(g, x0 + 6, y + 12, `${pn}.${p}`, 11, PROP_COUL[p] || '#ddd', 500);
    const vals = [];
    for (let s = 0; s <= 200; s++) vals.push(sampleTrack(tr, p, (a.dur * s) / 200));
    const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
    const X = (t) => x0 + lab + (t / a.dur) * (hw - 8), Y = (v) => y + rh - 6 - ((v - mn) / sp) * (rh - 12);
    g.strokeStyle = PROP_COUL[p] || '#ddd'; g.lineWidth = 1.6; g.beginPath();
    vals.forEach((v, s) => { const px = X((a.dur * s) / 200), py = Y(v); s ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
    tr.filter((k) => p in k).forEach((k) => {
      const e = easeOf(k, p);
      g.save(); g.translate(X(k.t), Y(k[p])); g.rotate(Math.PI / 4);
      g.fillStyle = e === 'linear' ? '#ff4d4d' : (Array.isArray(e) || /Back|Elastic|Bounce/.test(e || '')) ? '#7ee081' : '#ffd27a';
      g.fillRect(-3.5, -3.5, 7, 7); g.restore();
    });
    titre(g, x0 + w - 110, y + 3, `${+mn.toFixed(3)} → ${+mx.toFixed(3)}`, 9, '#7d7392', 400);
  });
  // règle
  const yb = y0 + L.length * rh + 2;
  for (let t = 0; t <= a.dur; t += a.dur > 2000 ? 500 : 100) titre(g, x0 + lab + (t / a.dur) * (hw - 8) - 8, yb, String(t), 9, '#7d7392', 400);
}
async function courbes({ anim = 'win' } = {}) {
  const L = lignesCourbes(anim), W = 1200, H = 60 + L.length * 38 + 30;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#12101a'; g.fillRect(0, 0, W, H);
  titre(g, 10, 10, `${S} · ${anim} · ${rig.anims[anim].dur} ms`, 16, '#ffd27a', 700);
  dessinerCourbes(g, anim, 10, 30, W - 20);
  return cv.toDataURL('image/png');
}

/* ---------------- contrôle ---------------- */
async function controle(anim) {
  graine();
  const noms = anim ? [anim] : Object.keys(rig.anims);
  const out = {};
  for (const n of noms) out[n] = analyser(PIXI, rig, tex, n);
  return out;
}

/* ---------------- parité v3 / v2 ---------------- */
async function parite({ n = 8, taille = 256, ref = '_v2-reference' } = {}) {
  const ancien = await import(`../engine/${ref}.js`);
  const res = {};
  for (const [nom, a] of Object.entries(rig.anims)) {
    const temps = Array.from({ length: n }, (_, i) => (a.dur * i) / (n - 1));
    const A = [], B = [];
    await rendre(nom, temps, taille, async (i, c) => { A[i] = await pixels(c); }, { moteur: buildSymbol });
    await rendre(nom, temps, taille, async (i, c) => { B[i] = await pixels(c); }, { moteur: ancien.buildSymbol });
    let pire = 0, diff = 0;
    for (let i = 0; i < n; i++) {
      let d = 0, m = 0;
      for (let j = 0; j < A[i].length; j++) { const e = Math.abs(A[i][j] - B[i][j]); d += e; if (e > m) m = e; }
      diff += d / A[i].length; pire = Math.max(pire, m);
    }
    res[nom] = { ecartMoyen: +(diff / n).toFixed(4), pirePixel: pire };
  }
  return res;
}
async function pixels(canvas) {
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d'); g.drawImage(canvas, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}

/* ---------------- vidéo 60 i/s image par image ----------------
   Rejoue une séquence comme le jeu (play + enchaînement sur idle, fondus
   compris) et envoie chaque image au serveur ; rl.py assemble avec ffmpeg. */
function sequenceJeu(A) {
  const seq = [];
  let t = 600;
  if (A.idle) seq.push(['idle', 0]);
  if (A.land) { seq.push(['land', t]); t += A.land.dur + 900; }
  if (A.win) { seq.push(['win', t]); t += A.win.dur + 900; }
  if (A.remove) { seq.push(['remove', t]); t += A.remove.dur + 400; }
  if (A.land) { seq.push(['land', t]); t += A.land.dur + 900; }
  return { seq, fin: t };
}
async function video({ seq = null, fin = 0, taille = 720, vitesse = 1, dossier = 'film', marge = 1.55 } = {}) {
  if (!seq) ({ seq, fin } = sequenceJeu(rig.anims));
  await initPixi(taille);
  graine();
  const sym = buildSymbol(PIXI, rig, tex);
  sym.resetPhysics();
  const stage = new PIXI.Container();
  const fond = new PIXI.Graphics();
  fond.rect(0, 0, taille, taille).fill({ color: 0x121018 });
  const k = taille / (Math.max(...rig.size) * marge);
  const w = rig.size[0] * k, h = rig.size[1] * k;
  fond.roundRect(taille / 2 - w / 2, taille / 2 - h / 2, w, h, 14).fill({ color: 0x1f1a2b }).stroke({ color: 0x3b3350, width: 2 });
  stage.addChild(fond, sym);
  sym.scale.set(k); sym.position.set(taille / 2, taille / 2);
  const DTv = 1000 / 60;
  let n = 0, i = 0;
  const total = Math.ceil(fin / (DTv * vitesse));
  for (let f = 0; f <= total; f++) {
    const t = f * DTv * vitesse;
    while (i < seq.length && seq[i][1] <= t) {
      const [nom] = seq[i];
      const a = rig.anims[nom];
      if (a) sym.play(nom, { then: a.loop || nom === 'remove' || nom === 'pop' ? null : (rig.anims.idle ? 'idle' : null), loop: a.loop, mix: i === 0 ? 0 : undefined });
      i++;
    }
    sym.update(f ? DTv * vitesse : 0);
    app.renderer.render({ container: stage });
    const data = app.canvas.toDataURL('image/png');
    await fetch(`/api/frame?dossier=${dossier}&n=${n++}`, { method: 'POST', body: data });
  }
  stage.destroy({ children: true });
  return { dossier, images: n };
}

/* ---------------- contrôle couleur ----------------
   Rejoue chaque animation image par image (60 i/s) et vérifie que la couleur
   du symbole reste celle du repos :
   1. dans le moteur : aucune pièce visible n'a de teinte (≠ blanc), de flash,
      ni de mélange additif ;
   2. à l'écran : couleur moyenne des pixels opaques du symbole (particules et
      reflet blanc exclus) comparée à la première image du repos. */
async function couleur({ anims = ['win', 'pop', 'frisson', 'anticipation', 'anticipation-boucle', 'suspense'], taille = 240 } = {}) {
  const sauve = rig;
  const r = JSON.parse(JSON.stringify(rig));
  r.emitters = {};
  for (const p of r.parts) delete p.shine;
  // les pièces invisibles au repos (le pop-corn qui remplace le grain, des yeux
  // ouverts, une paupière) ne sont pas le corps : on les cache pour la mesure
  const caches = r.parts.filter((p) => p.alpha === 0).map((p) => p.name);
  for (const a of Object.values(r.anims)) for (const n of caches) if (a.tracks && a.tracks[n]) a.tracks[n] = a.tracks[n].map((k) => { const c = { ...k }; delete c.alpha; return c; });
  rig = r;
  const moyenne = (d) => {
    let n = 0, R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 230) { n++; R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    return n ? [R / n, G / n, B / n, n] : null;
  };
  const etat = (sym) => {
    const pb = [];
    for (const n of Object.values(sym.nodes)) {
      if (!n.sprite || !n.visible || n.alpha < .01) continue;
      const tint = n.sprite.tint;
      if (tint !== 0xffffff && tint !== '#ffffff') pb.push(`${n.part.name} teinté`);
      if (n.flashSp && n.flashSp.visible && n.flashSp.alpha > .001) pb.push(`${n.part.name} flash`);
      if (n.sprite.blendMode === 'add') pb.push(`${n.part.name} additif`);
    }
    return pb;
  };
  const res = {};
  try {
    let ref = null;
    await rendre('idle', [0], taille, async (i, c) => { ref = moyenne(await pixels(c)); }, { fond: false });
    for (const an of anims) {
      const a = rig.anims[an];
      if (!a) continue;
      const temps = [];
      for (let t = 0; t <= a.dur; t += 1000 / 60) temps.push(t);
      let pire = 0, tPire = 0, images = 0, vides = 0;
      const moteur = new Set();
      await rendre(an, temps, taille, async (i, c, sym) => {
        etat(sym).forEach((x) => moteur.add(x));
        const m = moyenne(await pixels(c));
        if (!m || m[3] < ref[3] * .2) { vides++; return; }      // symbole parti (explosion)
        images++;
        const d = Math.hypot(m[0] - ref[0], m[1] - ref[1], m[2] - ref[2]);
        if (d > pire) { pire = d; tPire = temps[i]; }
      }, { fond: false });
      res[an] = { images, vides, ecartMax: +pire.toFixed(2), a: Math.round(tPire), moteur: [...moteur] };
    }
    res.reference = ref.slice(0, 3).map((v) => Math.round(v));
  } finally { rig = sauve; }
  return res;
}

/* ---------------- repos : ça vibre ? ----------------
   Joue `idle` pendant `duree` ms (60 i/s) et suit chaque pièce visible (sa
   position et son angle, en pixels de l'image). Une vibration = un mouvement
   qui change de sens plusieurs fois par seconde. Un balancement lent = moins
   de 2 changements de sens par seconde. */
function repos({ duree = 10000, anim = 'idle' } = {}) {
  graine();
  const sym = buildSymbol(PIXI, rig, tex);
  sym.resetPhysics();
  sym.play(anim, { mix: 0 });
  sym.update(0);
  const DTr = 1000 / 60, n = Math.round(duree / DTr);
  const R = Math.max(...rig.size) * .4;          // l'angle est ramené à des pixels au bord du symbole
  const pieces = rig.parts.filter((p) => p.src || p.frames).map((p) => p.name);
  const serie = {};
  for (const nm of pieces) serie[nm] = [];
  for (let i = 0; i <= n; i++) {
    if (i) sym.update(DTr);
    for (const nm of pieces) {
      const node = sym.nodes[nm], M = sym.worldOf[nm];
      if (!node.visible || node.alpha < .05) { serie[nm].push(null); continue; }
      serie[nm].push([M[4], M[5], Math.atan2(M[1], M[0]) * R]);
    }
  }
  sym.destroy({ children: true });
  const res = {};
  let pireInversions = 0, pireVitesse = 0;
  for (const nm of pieces) {
    const s = serie[nm].filter(Boolean);
    if (s.length < 10) continue;
    let inv = 0, vmax = 0, amp = 0;
    for (let c = 0; c < 3; c++) {
      let lastSign = 0, mn = Infinity, mx = -Infinity;
      for (let i = 1; i < s.length; i++) {
        const v = s[i][c] - s[i - 1][c];
        vmax = Math.max(vmax, Math.abs(v));
        mn = Math.min(mn, s[i][c]); mx = Math.max(mx, s[i][c]);
        if (Math.abs(v) < .02) continue;                   // immobile : pas un changement de sens
        const sg = Math.sign(v);
        if (lastSign && sg !== lastSign) inv++;
        lastSign = sg;
      }
      amp = Math.max(amp, mx - mn);
    }
    const parSeconde = inv / 3 / (duree / 1000);
    res[nm] = { inversionsParSeconde: +parSeconde.toFixed(2), amplitudePx: +amp.toFixed(1), vitesseMaxPx: +vmax.toFixed(2) };
    if (amp > 1) pireInversions = Math.max(pireInversions, parSeconde);
    pireVitesse = Math.max(pireVitesse, vmax);
  }
  return { pieces: res, pireInversionsParSeconde: +pireInversions.toFixed(2), pireVitessePx: +pireVitesse.toFixed(2), vibre: pireInversions > 2 };
}

/* ---------------- comparer avec une autre version (autre projet, même symbole) ---------------- */
async function comparer({ autre, anims, n = 24, taille = 256 } = {}) {
  const r2 = await (await fetch(`/api/rig?p=${autre}&s=${S}`, { cache: 'no-store' })).json();
  const t2 = await chargerTextures(autre, S, r2);
  const r1 = rig, t1 = tex;
  const res = {};
  for (const an of anims || Object.keys(r2.anims)) {
    if (!r1.anims[an] || !r2.anims[an]) { res[an] = 'absente d\'un côté'; continue; }
    const d = r1.anims[an].dur;
    const temps = Array.from({ length: n }, (_, i) => (d * i) / (n - 1));
    const A = [], B = [];
    rig = r1; tex = t1;
    await rendre(an, temps, taille, async (i, c) => { A[i] = await pixels(c); });
    rig = r2; tex = t2;
    await rendre(an, temps, taille, async (i, c) => { B[i] = await pixels(c); });
    rig = r1; tex = t1;
    let pire = 0, somme = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < A[i].length; j++) { const e = Math.abs(A[i][j] - B[i][j]); somme += e; if (e > pire) pire = e; }
    res[an] = { pirePixel: pire, ecartMoyen: +(somme / (n * A[0].length)).toFixed(4) };
  }
  return res;
}

/* ---------------- grille : plusieurs symboles côte à côte, en vidéo ---------------- */
async function grille({ p, noms, anim = 'idle', duree = 10000, cellule = 240, cols = 6, dossier = 'grille' } = {}) {
  const lignes = Math.ceil(noms.length / cols);
  const W = cols * cellule, H = lignes * cellule;
  if (!app) { app = new PIXI.Application(); await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resolution: 1, preference: 'webgl' }); }
  app.renderer.resize(W, H);
  graine(11);
  const stage = new PIXI.Container();
  const fond = new PIXI.Graphics();
  fond.rect(0, 0, W, H).fill({ color: 0x140f16 });
  stage.addChild(fond);
  const syms = [];
  for (let i = 0; i < noms.length; i++) {
    const r = await (await fetch(`/api/rig?p=${p}&s=${noms[i]}`, { cache: 'no-store' })).json();
    const t = await chargerTextures(p, noms[i], r);
    const x = (i % cols) * cellule, y = Math.floor(i / cols) * cellule;
    fond.roundRect(x + 6, y + 6, cellule - 12, cellule - 12, 12).fill({ color: 0x241a26 }).stroke({ color: 0x3a2632, width: 1.5 });
    const s = buildSymbol(PIXI, r, t);
    s.scale.set((cellule * .8) / Math.max(...r.size));
    s.position.set(x + cellule / 2, y + cellule / 2);
    s.play(anim, { start: 'hasard', mix: 0 });      // comme le jeu : chaque case démarre à un moment au hasard
    s.update(0);
    stage.addChild(s);
    syms.push(s);
  }
  const DTg = 1000 / 60, n = Math.round(duree / DTg);
  for (let f = 0; f <= n; f++) {
    if (f) for (const s of syms) s.update(DTg);
    app.renderer.render({ container: stage });
    await fetch(`/api/frame?dossier=${dossier}&n=${f}`, { method: 'POST', body: app.canvas.toDataURL('image/png') });
  }
  stage.destroy({ children: true });
  return { dossier, images: n + 1 };
}

/* ---------------- enchaînement : plusieurs rigs sur une même scène ----------------
   script = { W, H, duree, fond, p, taille (hauteur des rigs à l'écran, px),
              etapes: [{ t, s, a, then?, loop? }]          // lancer l'anim a du rig s à t ms
              compteur?: { de, a, t0, t1, rig } }          // un montant qui défile, posé à l'os « montant »
   Chaque rig est créé à sa première étape et retiré après sa dernière animation
   sans suite (palier, out). Rendu image par image à 60 i/s. */
async function enchainement(script, dossier = 'enchainement') {
  const { W = 1280, H = 720, duree = 20000, fond = 0x160c12, p, taille = 560, etapes, compteur } = script;
  if (!app) { app = new PIXI.Application(); await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resolution: 1, preference: 'webgl' }); }
  app.renderer.resize(W, H);
  try { const f = new FontFace('Luckiest Guy', 'url(../vendor/fonts/LuckiestGuy-Regular.ttf)'); await f.load(); document.fonts.add(f); } catch (e) { /* police absente */ }
  graine(5);
  const stage = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.rect(0, 0, W, H).fill({ color: fond });
  stage.addChild(bg);
  // script.grille = { cols, rows, case, x0, y0 } : des cases avec des symboles provisoires
  const G = script.grille;
  if (G) {
    const formes = [0x7a5cc4, 0x3fa36b, 0xc4833f, 0x4f86c6, 0xb8505a];
    for (let c = 0; c < G.cols; c++) for (let r = 0; r < G.rows; r++) {
      const x = G.x0 + c * G.case, y = G.y0 + r * G.case, m = G.case * .5;
      bg.rect(x, y, G.case, G.case).fill({ color: (c + r) % 2 ? 0x221a2e : 0x1d1627 });
      const col = formes[(c * 3 + r * 2) % formes.length];
      if (!G.vide) bg.circle(x + m, y + m, G.case * .28).fill({ color: col }).stroke({ color: 0x150d08, width: 3 });   // grille.vide : cases sans symbole provisoire
    }
    bg.rect(G.x0 - 4, G.y0 - 4, G.cols * G.case + 8, G.rows * G.case + 8).stroke({ color: 0x5a4632, width: 6 });
  }
  const place = (e, rig) => {            // position d'un rig : explicite (x, y, k), case (colonne, ligne) de la grille, ou centre de l'écran
    if (e.x !== undefined) return [e.x, e.y, e.k ?? 1];
    if (G && e.col) return [G.x0 + (e.col - .5) * G.case, G.y0 + (e.ligne - .5) * G.case, G.case / rig.size[1]];
    return [W / 2, H * .44, taille / rig.size[1]];
  };
  const rigs = {};
  for (const e of etapes) if (e.s && !rigs[e.s]) { const r = await (await fetch(`/api/rig?p=${p}&s=${e.s}`, { cache: 'no-store' })).json(); rigs[e.s] = { rig: r, tex: await chargerTextures(p, e.s, r) }; }
  const vivants = {};
  let texte = null;
  if (compteur) {
    texte = new PIXI.Text({ text: '0.00', style: { fontFamily: 'Luckiest Guy', fontSize: 64, fill: '#fff3dc', stroke: { color: '#150d08', width: 10 }, letterSpacing: 2 } });
    texte.anchor.set(.5); texte.visible = false;
    stage.addChild(texte);
  }
  const DTe = 1000 / 60, n = Math.round(duree / DTe);
  const faites = new Set();
  const posMontant = (nm) => {           // l'os « montant » du rig, en coordonnées de la scène (sans l'animation)
    const { rig } = rigs[nm], m = rig.parts.find((q) => q.name === 'montant');
    const k = taille / rig.size[1];
    return m ? [W / 2 + (m.pivot[0] - rig.size[0] / 2) * k, H * .44 + (m.pivot[1] - rig.size[1] / 2) * k] : [W / 2, H * .85];
  };
  for (let f = 0; f <= n; f++) {
    const t = f * DTe;
    etapes.forEach((e, i) => {
      if (faites.has(i) || e.t > t) return;
      faites.add(i);
      const id = e.id || e.s;
      let sym = vivants[id];
      if (!sym) {
        const { rig, tex: tx } = rigs[e.s];
        sym = buildSymbol(PIXI, rig, tx);
        sym.resetPhysics();
        const [x, y, k] = place(e, rig);
        sym.scale.set(k);
        sym.position.set(x, y);
        stage.addChildAt(sym, stage.children.length - (texte ? 1 : 0));   // le nouveau passe DEVANT
        vivants[id] = sym;
      }
      if (e.devant) { stage.removeChild(sym); stage.addChildAt(sym, stage.children.length - (texte ? 1 : 0)); }   // repasse devant les autres (wild qui s'étire)
      if (e.visible !== undefined) sym.visible = e.visible;
      if (e.skin !== undefined) sym.setSkin(e.skin);
      if (e.stop !== undefined) sym.stop(e.stop, e.mix ?? 200);
      if (e.detache && sym.textes) { sym.textes.forEach((tx) => sym.detach(tx)); sym.textes = []; }   // d'abord retirer l'ancien texte
      if (e.attach) {                    // un texte du jeu accroché à un os (le multi…)
        const tx = new PIXI.Text({ text: e.attach.texte, style: { fontFamily: 'Luckiest Guy', fontSize: e.attach.taille || 110, fill: '#fff3dc', stroke: { color: '#150d08', width: 16 } } });
        tx.anchor.set(.5);
        sym.attach(e.attach.os, tx);
        sym.textes = [...(sym.textes || []), tx];
      }
      if (e.a) {
        const a = rigs[e.s].rig.anims[e.a];
        sym.play(e.a, { track: e.track || 0, then: e.then !== undefined ? e.then : null, loop: e.loop ?? a.loop, mix: e.mix });
        sym.fin = (e.a === 'palier' || e.a === 'out') ? t + a.dur + 1400 : sym.fin || null;   // on le garde le temps des particules
      }
    });
    for (const [nm, sym] of Object.entries(vivants)) {
      if (f) sym.update(DTe);
      if (sym.fin && t > sym.fin) { sym.destroy({ children: true }); delete vivants[nm]; }
    }
    if (texte) {
      const c = compteur;
      texte.visible = t >= c.t0;
      const u = Math.max(0, Math.min(1, (t - c.t0) / (c.t1 - c.t0)));
      const v = c.de + (c.a - c.de) * (1 - (1 - u) ** 2.2);
      texte.text = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const cible = Object.keys(vivants).pop();
      if (cible) { const [x, y] = posMontant(cible); texte.position.set(x, y); }
    }
    app.renderer.render({ container: stage });
    await fetch(`/api/frame?dossier=${dossier}&n=${f}`, { method: 'POST', body: app.canvas.toDataURL('image/png') });
  }
  stage.destroy({ children: true });
  return { dossier, images: n + 1 };
}

async function envoyer(nom, data) {
  const r = await fetch(`/api/capture?nom=${encodeURIComponent(nom)}`, { method: 'POST', body: data });
  return (await r.json()).chemin;
}

window.RL = { charger, planche, courbes, controle, parite, envoyer, video, get rig() { return rig; }, PIXI, buildSymbol };

/* ---------------- pilotage par l'URL (rendu en arrière-plan) ---------------- */
const q = new URLSearchParams(location.search);
(async () => {
  if (q.get('faire') === 'enchainement') {
    try {
      const script = await (await fetch('/captures/' + q.get('script'), { cache: 'no-store' })).json();
      window.RL_FINI = { ok: true, enchainement: await enchainement(script, q.get('dossier') || 'enchainement') };
    } catch (e) { window.RL_FINI = { ok: false, erreur: String(e && e.stack || e) }; }
    return;
  }
  if (q.get('faire') === 'grille') {
    try {
      window.RL_FINI = { ok: true, grille: await grille({ p: q.get('p'), noms: q.get('noms').split(','), anim: q.get('anim') || 'idle',
        duree: +(q.get('duree') || 10000), cellule: +(q.get('cellule') || 240), cols: +(q.get('cols') || 6), dossier: q.get('dossier') || 'grille' }) };
    } catch (e) { window.RL_FINI = { ok: false, erreur: String(e && e.stack || e) }; }
    return;
  }
  if (!q.get('p')) { window.RL_FINI = { ok: true, vide: true }; return; }
  try {
    await charger(q.get('p'), q.get('s'));
    const faire = q.get('faire') || 'planche';
    const anim = q.get('anim') || Object.keys(rig.anims)[0];
    const res = { ok: true, fichiers: [] };
    if (faire === 'planche' || faire === 'tout') {
      const animsVoulues = faire === 'tout' ? Object.keys(rig.anims) : anim.split(',');
      for (const an of animsVoulues) {
        const tl = q.get('temps') ? q.get('temps').split(',').map(Number) : null;
        const img = await planche({ anim: an, n: +(q.get('n') || 12), cols: +(q.get('cols') || 6), taille: +(q.get('taille') || 220), temps: tl, trajets: !tl, courbes: !tl });
        const nom = (faire === 'tout' || animsVoulues.length > 1 ? `${P}-${S}-${an}.png` : q.get('sortie')) || `${P}-${S}-${an}.png`;
        res.fichiers.push(await envoyer(nom, img));
        $('apercu')?.appendChild(Object.assign(new Image(), { src: img, style: 'max-width:100%' }));
      }
    }
    if (faire === 'courbes') res.fichiers.push(await envoyer(q.get('sortie') || `${P}-${S}-${anim}-courbes.png`, await courbes({ anim })));
    if (faire === 'controle' || faire === 'tout') res.rapport = await controle(q.get('anim') && faire !== 'tout' ? anim : null);
    if (faire === 'parite') res.parite = await parite({ n: +(q.get('n') || 8), ref: q.get('ref') || '_v2-reference' });
    if (faire === 'repos') res.repos = repos({ duree: +(q.get('duree') || 10000), anim: q.get('anim') || 'idle' });
    if (faire === 'comparer') res.comparer = await comparer({ autre: q.get('autre'), anims: q.get('anim') ? q.get('anim').split(',') : null });
    if (faire === 'couleur') res.couleur = await couleur({ anims: q.get('anim') ? q.get('anim').split(',') : undefined });
    if (faire === 'video') {
      let seq = null, fin = 0;
      if (q.get('seq')) { // seq=win:0,idle:1500 … ; fin=ms
        seq = q.get('seq').split(',').map((x) => { const [nm, t] = x.split(':'); return [nm, +t]; });
        fin = +(q.get('fin') || 3000);
      }
      res.video = await video({ seq, fin, taille: +(q.get('taille') || 720), vitesse: +(q.get('vitesse') || 1), dossier: q.get('dossier') || 'film' });
    }
    window.RL_FINI = res;
    log(JSON.stringify(res, null, 1));
  } catch (e) {
    window.RL_FINI = { ok: false, erreur: String(e && e.stack || e) };
    log('ERREUR ' + e);
  }
})();
