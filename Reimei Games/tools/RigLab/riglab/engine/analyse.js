/* ANALYSE — contrôle qualité d'une animation de rig, avec les lois studio :
   rien de linéaire, rien de simultané, rien sans anticipation, rien ne
   s'arrête net ; plus les pièges techniques (saut de boucle, à-coups,
   temps morts, débordement de la case, raccords avec le repos).

   simuler(PIXI, rig, tex, anim) rejoue l'animation image par image (60 i/s,
   ressorts compris) et relève la position des pièces ; analyser() en tire
   un rapport { note, points: [{ niveau, titre, detail, t, piece }] }. */
import { buildSymbol, sampleTrack, easeOf, DEFAULTS } from './symbol-rig.js';

export const REFERENCES = { idle: [1000, 3200], land: [650, 800], win: [1200, 1500], remove: [280, 400] };
/* (14/10/2026) Mesures image par image des symboles Spine de Cybersaurus (Paperclip Gaming), pour comparer :
   durées, pic d'échelle du gain (et son moment), décalages entre os d'une même chaîne. */
export const CYBERSAURUS = {
  duree: { idle: [2000, 2000], land: [667, 667], win: [667, 1333] },
  picGain: { premier: [1.2, 100], second: [1.28, 533], retour: 134 },
  decalageChaine: [33, 100],
};
const MOVE = ['rot', 'x', 'y', 'sx', 'sy', 'skx', 'sky'];
const DEFORM = ['bulge', 'bulge2', 'bulge3', 'bulge4', 'bend', 'taper'];
const DT = 1000 / 60;

/* Rejoue `anim` de 0 à dur et relève, à chaque image : la matrice monde de
   chaque pièce, sa valeur animée, et la boîte du symbole. */
/* Points de contrôle de chaque pièce visible, en coordonnées du symbole :
   les sommets du maillage (déformations comprises) ou les coins et le
   centre de l'image. Le mouvement d'une pièce = le plus grand déplacement
   d'un de ses points. */
/* boîte des pixels visibles d'une image : une pièce au cadrage du symbole est
   surtout du vide, sa boîte d'image entière fausserait tout */
const rectCache = new Map();
function opaqueRect(tex) {
  if (rectCache.has(tex.uid)) return rectCache.get(tex.uid);
  const w = tex.frame.width, h = tex.frame.height;
  let r = [0, 0, w, h];
  try {
    const res = tex.source.resource;
    const cv = document.createElement('canvas'); cv.width = tex.source.width; cv.height = tex.source.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(res, 0, 0);
    const d = g.getImageData(tex.frame.x, tex.frame.y, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= x0) r = [x0, y0, x1 + 2, y1 + 2];
  } catch (e) { /* image illisible : boîte entière */ }
  rectCache.set(tex.uid, r);
  return r;
}
function points(sym) {
  const out = {};
  for (const n of Object.values(sym.nodes)) {
    if (!n.sprite) continue;
    const M = sym.worldOf[n.part.name], sp = n.sprite, pts = [];
    if (n.rest) { const p = sp.geometry.positions; for (let i = 0; i < p.length; i += 2) pts.push(p[i] + sp.x, p[i + 1] + sp.y); }
    else {
      const [a, b, c, d] = opaqueRect(sp.texture), x0 = sp.x + a, y0 = sp.y + b, x1 = sp.x + c, y1 = sp.y + d;
      pts.push(x0, y0, x1, y0, x0, y1, x1, y1, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const o = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) { o[i] = M[0] * pts[i] + M[2] * pts[i + 1] + M[4]; o[i + 1] = M[1] * pts[i] + M[3] * pts[i + 1] + M[5]; }
    out[n.part.name] = o;
  }
  return out;
}
/* Boîte des pièces opaques (sans les lueurs additives ni les particules). */
function boite(sym, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of Object.values(sym.nodes)) {
    const o = pts[n.part.name];
    if (!o || n.part.blend === 'add' || !n.visible || n.alpha < .05) continue;
    for (let i = 0; i < o.length; i += 2) {
      if (o[i] < x0) x0 = o[i]; if (o[i + 1] < y0) y0 = o[i + 1]; if (o[i] > x1) x1 = o[i]; if (o[i + 1] > y1) y1 = o[i + 1];
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1 - x0, y1 - y0];
}

export function simuler(PIXI, rig, tex, anim, { bornes = true } = {}) {
  const a = rig.anims[anim];
  const sym = buildSymbol(PIXI, rig, tex);
  sym.resetPhysics();
  const images = [];
  const n = Math.ceil(a.dur / DT);
  sym.play(anim, { mix: 0, then: null, loop: false });
  sym.update(0);
  for (let i = 0; i <= n; i++) {
    if (i) sym.update(DT);
    const t = Math.min(a.dur, i * DT);
    const monde = {};
    for (const [nm, M] of Object.entries(sym.worldOf)) monde[nm] = M.slice();
    const pts = points(sym);
    images.push({ t, monde, pts, bornes: bornes ? boite(sym, pts) : null, pose: sym.pose() });
  }
  sym.destroy({ children: true });
  return images;
}

/* Le bruit organique (wiggle) est un tremblement VOULU : on le retire pour
   juger les mouvements clés (sinon « finit en mouvement » partout). */
function sansBruit(rig) {
  if (!rig.parts.some((p) => p.wiggle)) return rig;
  const r = JSON.parse(JSON.stringify(rig));
  for (const p of r.parts) delete p.wiggle;
  return r;
}
const norm = (rig) => Math.max(...rig.size);
const f0 = (x) => Math.round(x);

export function analyser(PIXI, rig, tex, anim) {
  rig = sansBruit(rig);
  const a = rig.anims[anim];
  const points = [];
  const P = (niveau, titre, detail = '', extra = {}) => points.push({ niveau, titre, detail, ...extra });
  if (!a) return { note: 0, points: [{ niveau: 'erreur', titre: `animation « ${anim} » introuvable` }] };
  const S = norm(rig);
  const tracks = a.tracks || {};
  const parts = rig.parts.map((p) => p.name);

  // ---------- 1. les clés : courbes, simultanéité ----------
  let nKeys = 0, nLin = 0, nBez = 0;
  const tempsParPiece = {};
  for (const [pn, tr] of Object.entries(tracks)) {
    for (const k of tr) {
      const props = Object.keys(k).filter((p) => p !== 't' && p !== 'ease');
      if (!props.length) continue;
      nKeys++;
      for (const p of props) {
        const e = easeOf(k, p);
        if (e === 'linear') nLin++;
        if (Array.isArray(e) || ['outBack', 'outBackBig', 'outElastic', 'outBounce', 'inBack'].includes(e)) nBez++;
      }
      if (k.t > 0 && k.t < a.dur && props.some((p) => MOVE.includes(p))) (tempsParPiece[k.t] ||= new Set()).add(pn);
    }
  }
  if (!nKeys) { P('erreur', 'Animation vide', 'aucune clé'); return { note: 0, points }; }
  // (14/10/2026) animation de teinte seule (piste « @symbole ») : rien à juger en mouvement
  if (Object.keys(tracks).every((pn) => pn === '@symbole')) {
    P('info', 'Teinte du symbole seule', 'Piste « @symbole » : à jouer sur la piste 1, ou à remplacer par sym.setTeinte() côté jeu.');
    return { anim, note: 10, points, cles: nKeys, duree: a.dur, boucle: !!a.loop };
  }
  if (nLin) P('attention', `${nLin} segment(s) en courbe linéaire`, "Rien de linéaire : une entrée décélère, une sortie accélère, un impact dépasse.");
  // pièces qui bougent à la même milliseconde (hors os et surimpressions qui suivent le corps)
  const suiveurs = new Set(rig.parts.filter((p) => p.mesh && p.mesh.follow).map((p) => p.name));
  const simult = Object.entries(tempsParPiece)
    .map(([t, s]) => [+t, [...s].filter((x) => !suiveurs.has(x))])
    .filter(([, s]) => s.length >= 3);
  if (simult.length) {
    const [t, s] = simult[0];
    P('attention', `${s.length} pièces changent de mouvement ensemble à ${t} ms`, `Rien de simultané : décaler de 30 à 60 ms (${s.join(', ')}). Recette « Décaler ».`, { t });
  }

  // ---------- 2. simulation ----------
  const im = simuler(PIXI, rig, tex, anim);
  const last = im.length - 1;
  // pièces visibles, non additives
  const vis = rig.parts.filter((p) => (p.src || p.frames) && p.blend !== 'add').map((p) => ({ nm: p.name }));
  // mouvement d'une pièce entre deux images : le plus grand déplacement d'un de ses points
  const delta = (i, j, v) => {
    const A = im[i].pts[v.nm], B = im[j].pts[v.nm];
    if (!A || !B) return 0;
    // (14/10/2026) une pièce qui CHANGE D'IMAGE (clé img, séquence) ne bouge pas : sa boîte change, c'est tout
    const pi = im[i].pose[v.nm] || {}, pj = im[j].pose[v.nm] || {};
    if (pi.img !== pj.img || pi.frame !== pj.frame || (pi.seq && pi.seq[0]) !== (pj.seq && pj.seq[0])) return 0;
    let m = 0;
    for (let q = 0; q < A.length; q += 2) { const d = Math.hypot(B[q] - A[q], B[q + 1] - A[q + 1]); if (d > m) m = d; }
    return m;
  };
  const visible = (i, nm) => (im[i].pose[nm]?.alpha ?? 1) > .05;
  const vit = im.map((_, i) => (i ? Math.max(0, ...vis.filter((v) => visible(i, v.nm)).map((v) => delta(i - 1, i, v))) : 0));
  // activité : mouvement + lumière (flash, opacité, reflet) de toutes les pièces
  const act = im.map((f, i) => {
    if (!i) return 0;
    let x = vit[i];
    for (const [nm, v] of Object.entries(f.pose)) {
      const u = im[i - 1].pose[nm] || {};
      x += (Math.abs((v.flash || 0) - (u.flash || 0)) + Math.abs((v.alpha ?? 1) - (u.alpha ?? 1)) + Math.abs((v.shine || 0) - (u.shine || 0))) * S * .15;
    }
    return x;
  });
  const maxV = Math.max(...vit);
  const bougeAuFond = maxV > S * .002;

  // ---------- 3. boucle : le début et la fin se rejoignent ----------
  if (a.loop) {
    let pire = 0, qui = '';
    for (const [pn, tr] of Object.entries(tracks)) {
      for (const p of [...MOVE, 'alpha', 'flash']) {
        const v0 = sampleTrack(tr, p, 0), v1 = sampleTrack(tr, p, a.dur);
        if (v0 === undefined || v1 === undefined) continue;
        // un tour complet (2π) revient au même dessin : pas un saut
        const ecart = p === 'rot' ? Math.abs(Math.atan2(Math.sin(v1 - v0), Math.cos(v1 - v0))) : Math.abs(v1 - v0);
        const d = ecart * (p === 'x' || p === 'y' ? 1 : p === 'rot' ? S * .35 : S * .2);
        if (d > pire) { pire = d; qui = `${pn}.${p}`; }
      }
    }
    if (pire > .8) P('erreur', `La boucle saute (${qui})`, `La fin ne rejoint pas le début (écart ${pire.toFixed(1)} px). Recette « Fermer la boucle ».`, { t: a.dur });
    else {
      // élan : la vitesse de la fin doit être celle du début
      const vA = vit[1] || 0, vB = vit[last] || 0;
      if (Math.abs(vA - vB) > Math.max(.6, .5 * Math.max(vA, vB))) P('attention', 'La boucle accroche', `Vitesse au début ${vA.toFixed(2)} px/image, à la fin ${vB.toFixed(2)} : on voit la reprise.`, { t: 0 });
      else P('ok', 'Boucle sans couture');
    }
  }

  // ---------- 4. arrêts secs : une pièce lancée qui s'immobilise en une image ----------
  for (let i = 2; i < last; i++) {
    // une pièce qui disparaît (explosion « en une image ») ne s'arrête pas : elle s'en va
    const disparait = vis.some((v) => visible(i - 1, v.nm) && !visible(i, v.nm));
    if (!disparait && vit[i - 1] > Math.max(.3 * maxV, S * .006) && vit[i] < .08 * vit[i - 1] && vit[i + 1] < .15 * vit[i - 1]) {
      const qui = vis.reduce((b, v) => (delta(i - 2, i - 1, v) > delta(i - 2, i - 1, b) ? v : b), vis[0]).nm;
      P('attention', `Arrêt sec à ${f0(im[i].t)} ms (${qui})`, 'Lancée à pleine vitesse, la pièce s\'immobilise en une image. Arriver en décélérant ou dépasser puis revenir (recette « Amorti »).', { t: im[i].t, piece: qui });
      break;
    }
  }

  // ---------- 5. anticipation, dépassement (animations qui ne bouclent pas) ----------
  const sortie = /remove|dispar|sortie|exit|hide|out$|^pop$/i.test(anim);
  // une animation qui enchaîne sur une autre que le repos (win → pop) finit
  // volontairement en tension : pas de raccord avec le repos à juger
  const suite = !a.loop && Object.keys(rig.mixes || {}).find((m) => m.startsWith(anim + '>') && !m.endsWith('>idle'));
  if (suite) P('info', `Enchaîne sur « ${suite.split('>')[1]} »`, 'Finit en tension, par construction.');
  if (!a.loop && bougeAuFond) {
    let antic = false, depasse = false;
    for (const [pn, tr] of Object.entries(tracks)) {
      if (rig.parts.find((q) => q.name === pn)?.blend === 'add') continue;
      for (const p of [...MOVE, ...DEFORM]) {
        const ks = tr.filter((k) => p in k);
        if (ks.length < 2) continue;
        const rest = DEFAULTS[p];
        const vals = ks.map((k) => k[p] - rest);
        const amp = Math.max(...vals.map(Math.abs));
        if (amp * (p === 'x' || p === 'y' ? 1 / S : p === 'rot' ? .35 : 1) < .01) continue; // négligeable
        const iPic = vals.findIndex((v) => Math.abs(v) === amp);
        if (vals.slice(0, iPic).some((v) => v * vals[iPic] < 0 && Math.abs(v) > amp * .08)) antic = true;
        if (vals.slice(iPic + 1).some((v) => v * vals[iPic] < 0 && Math.abs(v) > amp * .02)) depasse = true;
        if (ks.slice(1).some((k) => { const e = easeOf(k, p); return Array.isArray(e) ? e[1] > 1 || e[3] > 1 : ['outBack', 'outBackBig', 'outElastic', 'outBounce'].includes(e); })) depasse = true;
      }
    }
    if (/win|gain|land|pose|saut|jump|pacte|bonus|declench|trigger/i.test(anim)) {
      if (!antic) P('attention', 'Pas d\'anticipation', 'Rien sans anticipation : un petit recul de 80 à 120 ms avant le temps fort (recette « Anticipation »).');
      else P('ok', 'Anticipation présente');
    }
    if (!sortie) {
      if (!depasse) P('attention', 'Rien ne dépasse', 'Rien ne s\'arrête net : dépasser de 8 à 14 % puis revenir (recette « Amorti »).');
      else P('ok', 'Dépassement et retour');
    }
  }
  if (!a.loop) {
    // temps mort : plus de 450 ms sans rien qui bouge ni ne brille, avant la fin
    let calme = 0, debut = 0, mort = null;
    im.forEach((f, i) => {
      if (i && act[i] < .05) { if (!calme) debut = f.t; calme += DT; } else calme = 0;
      if (calme > 450 && f.t < a.dur - 120 && mort === null) mort = debut;
    });
    if (mort !== null) P('attention', `Temps mort à ${f0(mort)} ms`, 'Plus de 450 ms sans mouvement ni lumière au milieu de l\'animation : le symbole paraît figé.', { t: mort });
    if (!sortie && !suite && vit[last] > S * .004) P('attention', 'Finit en mouvement', 'À la dernière image, le symbole bouge encore : le raccord avec l\'animation suivante va sauter.', { t: a.dur });
    if (!bougeAuFond) P('info', 'Effet de lumière seul', 'Aucune pièce ne bouge : animation à superposer (piste 1) ou à compléter.');
  } else {
    // repos : ni figé, ni agité
    const maxA = Math.max(...act);
    if (maxA < .02 && /idle|repos/i.test(anim)) P('attention', 'Repos figé', 'Le symbole ne respire pas : un repos doit vivre (respiration, lueur, bruit).');
    else if (maxV > S * .02 && /idle|repos/i.test(anim)) P('attention', 'Repos trop agité', `Jusqu'à ${maxV.toFixed(1)} px par image : au repos, le symbole doit rester discret à côté des autres.`);
  }

  // ---------- 6. case : combien le symbole grandit hors de sa place ----------
  const b0 = simuler(PIXI, rig, tex, rig.anims.idle ? 'idle' : anim)[0].bornes;
  if (b0) {
    let deb = 0, tDeb = 0;
    for (const f of im) {
      if (!f.bornes) continue;
      const [x, y, w, h] = f.bornes;
      const d = Math.max(b0[0] - x, x + w - (b0[0] + b0[2]), b0[1] - y, y + h - (b0[1] + b0[3])) / S;
      if (d > deb) { deb = d; tDeb = f.t; }
    }
    if (deb > .2 && !/win|gain|max|big|bonus|pop|explo|declench|trigger|suspense|anticip/i.test(anim)) P('attention', `Sort de sa place de ${f0(deb * 100)} %`, 'Il va recouvrir ses voisins sur la grille : à garder pour le gain.', { t: tDeb });
    else if (deb > .04) P('info', `Grandit de ${f0(deb * 100)} % hors de sa place au plus fort`, '', { t: tDeb });
    // (14/10/2026) pic d'échelle d'un gain, comparé à Cybersaurus (×1.2 à 100 ms, puis ×1.28 à 533 ms)
    if (/win|gain/i.test(anim) && !a.loop) {
      let pic = 1, tPic = 0, premier = null;
      // échelle du holder (la pièce racine) si elle est animée, sinon la boîte du symbole
      const racine = rig.parts.find((p) => !p.parent)?.name;
      const sc = (f) => { const M = f.monde[racine]; return M ? Math.hypot(M[0], M[1]) : 1; };
      const parHolder = racine && im.some((f) => Math.abs(sc(f) - 1) > .01);
      const ech = im.map((f) => (parHolder ? sc(f) : f.bornes ? Math.max(f.bornes[2] / b0[2], f.bornes[3] / b0[3]) : 1));
      ech.forEach((e, i) => { if (e > pic) { pic = e; tPic = im[i].t; } if (premier === null && i > 1 && i < ech.length - 1 && ech[i] > 1.04 && ech[i] >= ech[i - 1] && ech[i] > ech[i + 1]) premier = [e, im[i].t]; });
      if (pic > 1.02) {
        const C = CYBERSAURUS.picGain;
        P('info', `Pic d'échelle ×${pic.toFixed(2)} à ${f0(tPic)} ms` + (premier && premier[1] < tPic - 60 ? ` (premier pic ×${premier[0].toFixed(2)} à ${f0(premier[1])} ms)` : ''),
          `Cybersaurus : ×${C.premier[0]} à ${C.premier[1]} ms (impact), puis ×${C.second[0]} à ${C.second[1]} ms, retour en ${C.retour} ms. Recette « Gain d'un personnage ».`, { t: tPic });
      }
    }
  }
  // (14/10/2026) chevauchement dans la hiérarchie : un enfant qui change de mouvement à la même milliseconde que son parent
  {
    const par = Object.fromEntries(rig.parts.map((p) => [p.name, p.parent]));
    const temps = (pn) => new Set((tracks[pn] || []).filter((k) => k.t > 0 && k.t < a.dur && Object.keys(k).some((p) => p === 'rot')).map((k) => k.t));
    const paires = [];
    for (const pn of Object.keys(tracks)) {
      const pp = par[pn]; if (!pp || !tracks[pp]) continue;
      const A = temps(pn), B = temps(pp); if (A.size < 2 || B.size < 2) continue;
      const com = [...A].filter((t) => B.has(t)).length;
      if (com >= Math.min(A.size, B.size) * .6) paires.push(`${pp} → ${pn}`);
    }
    if (paires.length) P('info', `Rotation en bloc : ${paires.slice(0, 3).join(', ')}`, `L'enfant tourne aux mêmes instants que son parent. Décaler de ${CYBERSAURUS.decalageChaine[0]} à ${CYBERSAURUS.decalageChaine[1]} ms et grandir vers le bout (recette « Fouet »).`);
  }

  // ---------- 7. durée comparée aux studios ----------
  const ref = REFERENCES[anim];
  const cy = CYBERSAURUS.duree[anim];
  if (ref && (a.dur < ref[0] || a.dur > ref[1])) P('info', `Durée ${a.dur} ms`, `Les studios mesurés : ${ref[0]}–${ref[1]} ms pour « ${anim} »` + (cy ? ` ; Cybersaurus : ${cy[0] === cy[1] ? cy[0] : cy.join('–')} ms.` : '.'));

  // ---------- 8. raccord avec le repos ----------
  if (!a.loop && rig.anims.idle && anim !== 'idle' && !sortie && !suite && bougeAuFond) {
    const fin = im[last].monde, sIdle = simuler(PIXI, rig, tex, 'idle', { bornes: false })[0].monde;
    let pire = 0, qui = '';
    for (const v of vis) {
      const d = Math.hypot(fin[v.nm][4] - sIdle[v.nm][4], fin[v.nm][5] - sIdle[v.nm][5]);
      if (d > pire) { pire = d; qui = v.nm; }
    }
    const mix = (rig.mixes && rig.mixes[anim + '>idle']) ?? a.mix ?? rig.mix ?? 120;
    if (pire > S * .03 && mix < 200) P('attention', `Raccord avec le repos : ${qui} saute de ${pire.toFixed(0)} px`, `Le fondu (${mix} ms) est court pour cet écart.`);
  }

  // ---------- note ----------
  let note = 10;
  for (const p of points) note -= p.niveau === 'erreur' ? 3 : p.niveau === 'attention' ? 1.2 : 0;
  note = Math.max(0, Math.min(10, note));
  const ordre = { erreur: 0, attention: 1, info: 2, ok: 3 };
  points.sort((x, y) => ordre[x.niveau] - ordre[y.niveau]);
  return { anim, note: Math.round(note * 10) / 10, points, cles: nKeys, duree: a.dur, boucle: !!a.loop, vitesseMax: +maxV.toFixed(2), courbesStudio: +(nBez / nKeys).toFixed(2) };
}
