/* SYMBOL-RIG v3 — rig et animation des symboles, fait maison (Vantrel).

   Ce que fait Spine, sans Spine : os hiérarchiques, maillages déformés et
   PONDÉRÉS sur plusieurs os, DÉFORMATION LIBRE des sommets (clés ffd),
   courbes de Bézier (une courbe par propriété si on veut), mélange entre
   animations (et table de mélanges par paire), pistes superposées, teinte et
   flash, REFLET qui balaie la pièce, DÉCOUPE d'une pièce par une autre,
   ordre de dessin animé, séquences d'images, SKINS, événements, IK à un ou
   deux os, contraintes « suivre », ressorts (rotation et position), bruit
   organique, émetteurs de particules. Tout est décrit par un rig.json (voir
   la documentation de Rig Lab pour le format complet).

   Compatible avec les rigs v2 : un rig qui n'utilise pas les nouveautés
   s'affiche au pixel près comme avant, avec la même API.

   Rendu À PLAT : chaque pièce est un enfant direct du symbole et reçoit sa
   matrice calculée ici. Les parents ne servent qu'au calcul ; l'ordre de
   dessin est donc global (comme Spine) et animable.

   Coordonnées : tout est en pixels DE L'IMAGE COMPLÈTE (size). Les pièces
   partagent le même cadrage, on ne recale rien à la main. */

export const VERSION = 3;

/* ---------- courbes ---------- */
const back = (c) => (p) => 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
export const EASE = {
  linear: (p) => p,
  step: (p) => (p < 1 ? 0 : 1),
  inQuad: (p) => p * p,
  outQuad: (p) => 1 - (1 - p) * (1 - p),
  inOutQuad: (p) => (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  inCubic: (p) => p * p * p,
  outCubic: (p) => 1 - (1 - p) ** 3,
  inOutCubic: (p) => (p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  inQuart: (p) => p ** 4,
  outQuart: (p) => 1 - (1 - p) ** 4,
  inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  inBack: (p) => 2.70158 * p ** 3 - 1.70158 * p * p,
  outBack: back(1.70158),
  outBackBig: back(2.6),
  outElastic: (p) => (p === 0 || p === 1 ? p : 2 ** (-10 * p) * Math.sin((p * 10 - .75) * (2 * Math.PI / 3)) + 1),
  outBounce: (p) => {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375;
    return n * (p -= 2.625 / d) * p + .984375;
  },
};
export const EASE_NAMES = Object.keys(EASE);

/* cubic-bezier(x1,y1,x2,y2) comme en CSS / dans l'éditeur de courbes de Spine */
const bezCache = new Map();
export function cubicBezier(x1, y1, x2, y2) {
  const key = `${x1},${y1},${x2},${y2}`;
  if (bezCache.has(key)) return bezCache.get(key);
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const f = (p) => {
    let s = p;
    for (let i = 0; i < 8; i++) { const e = X(s) - p, d = dX(s); if (Math.abs(e) < 1e-5) break; if (Math.abs(d) < 1e-6) break; s -= e / d; }
    if (s < 0 || s > 1) { let lo = 0, hi = 1; s = p; for (let i = 0; i < 30; i++) { if (X(s) < p) lo = s; else hi = s; s = (lo + hi) / 2; } }
    return Y(s);
  };
  bezCache.set(key, f);
  return f;
}
export function easeFn(e) {
  if (Array.isArray(e)) return cubicBezier(...e);
  return EASE[e] || EASE.inOutQuad;
}
/* La courbe d'une clé pour une propriété : `ease` peut être un nom, un
   tableau de Bézier, ou un objet { rot: …, x: …, '*': … } (une courbe par
   propriété, comme dans le graphe de Spine). */
export function easeOf(k, prop) {
  const e = k.ease;
  if (e && typeof e === 'object' && !Array.isArray(e)) return e[prop] ?? e['*'];
  return e;
}

/* ---------- propriétés ---------- */
// défauts ; les « deformers » (bend…) n'agissent que sur les pièces en maillage
export const DEFAULTS = {
  rot: 0, x: 0, y: 0, sx: 1, sy: 1, skx: 0, sky: 0, alpha: 1,
  flash: 0, wig: 1, bend: 0, wave: 0, bulge: 0, bulge2: 0, bulge3: 0, bulge4: 0, taper: 0,
};
// (14/10/2026) seq : (re)démarre la séquence d'images de la pièce à cette clé, à l'image donnée ; img : change son image
const STEPPED = new Set(['frame', 'z', 'visible', 'seq', 'img']);
const ADDITIVE = new Set(['rot', 'x', 'y', 'skx', 'sky', 'flash', 'bend', 'wave', 'bulge', 'bulge2', 'bulge3', 'bulge4', 'taper']);
// ffd : décalage de chaque sommet du maillage ; shine : position du reflet (0 → 1)
export const ANIM_PROPS = [...Object.keys(DEFAULTS), 'tint', 'frame', 'z', 'visible', 'shine', 'ffd', 'seq', 'img', 'phys'];

const hex = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));
function lerpColor(a, b, e) {
  a = hex(a); b = hex(b);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * e;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * e;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * e;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
function mulColor(a, b) {
  a = hex(a); b = hex(b);
  return (Math.round(((a >> 16) & 255) * ((b >> 16) & 255) / 255) << 16) | (Math.round(((a >> 8) & 255) * ((b >> 8) & 255) / 255) << 8) | Math.round((a & 255) * (b & 255) / 255);
}
function lerpArr(a, b, e) {
  const n = Math.max(a ? a.length : 0, b ? b.length : 0), o = new Array(n);
  for (let i = 0; i < n; i++) { const x = a ? a[i] || 0 : 0; o[i] = x + ((b ? b[i] || 0 : 0) - x) * e; }
  return o;
}

/* Valeur d'une piste à t (ms), ou undefined si la propriété n'y est pas clée.
   La courbe d'un segment est celle de la clé d'ARRIVÉE (comme Spine). */
export function sampleTrack(track, prop, t) {
  let prev = null;
  for (const k of track) {
    if (!(prop in k)) continue;
    if (k.t >= t) {
      if (!prev) return k[prop];
      const ez = easeOf(k, prop);
      if (STEPPED.has(prop) || ez === 'step') return k.t === t ? k[prop] : prev[prop];
      const p = Math.max(0, Math.min(1, (t - prev.t) / Math.max(1, k.t - prev.t)));
      const e = easeFn(ez)(p);
      if (prop === 'tint') return lerpColor(prev[prop], k[prop], Math.max(0, Math.min(1, e)));
      if (prop === 'ffd') return lerpArr(prev[prop], k[prop], e);
      return prev[prop] + (k[prop] - prev[prop]) * e;
    }
    prev = k;
  }
  return prev ? prev[prop] : undefined;
}

/* ---------- matrices 2D maison [a, b, c, d, tx, ty] ---------- */
const I = () => [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [ // A puis appliquer B d'abord : A·B
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const inv = (M) => {
  const det = M[0] * M[3] - M[1] * M[2] || 1e-9;
  return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det,
    (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det];
};
const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const local = (x, y, rot, sx, sy, skx, sky) => [
  Math.cos(rot + sky) * sx, Math.sin(rot + sky) * sx,
  -Math.sin(rot - skx) * sy, Math.cos(rot - skx) * sy, x, y,
];
export const MAT = { mul, inv, apply, local, I };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* bruit doux (somme de sinus à phases propres à chaque pièce) */
const noise = (t, seed) => (Math.sin(t * 1.0 + seed) * .5 + Math.sin(t * 2.31 + seed * 1.7) * .3 + Math.sin(t * 4.13 + seed * 2.9) * .2);

/* ---------- textures de particules générées (douces, jamais « sale ») ---------- */
const genTex = {};
function particleTexture(PIXI, kind) {
  if (genTex[kind]) return genTex[kind];
  const s = kind === 'smoke' ? 96 : 48, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d'), r = s / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  if (kind === 'dot') { grd.addColorStop(0, '#fff'); grd.addColorStop(.55, '#fff'); grd.addColorStop(.75, 'rgba(255,255,255,0)'); }
  else if (kind === 'smoke') { grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(.6, 'rgba(255,255,255,.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else if (kind === 'star') {
    g.translate(r, r); g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, l = i % 2 ? r * .22 : r * .95; g.lineTo(Math.cos(a) * l, Math.sin(a) * l); }
    g.fill();
    return (genTex[kind] = PIXI.Texture.from(cv));
  } else { grd.addColorStop(0, '#fff'); grd.addColorStop(.25, 'rgba(255,255,255,.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  return (genTex[kind] = PIXI.Texture.from(cv));
}
const rnd = (v) => (Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v ?? 0);

/* ---------- reflet : un filtre qui fait passer une bande de lumière sur la
   pièce, seulement là où elle est opaque (il suit donc les déformations) ---------- */
const SHINE_FRAG = `in vec2 vTextureCoord;
in vec2 vFrame;
in vec2 vSize;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uPos;
uniform float uWidth;
uniform float uAngle;
uniform vec3 uColor;
uniform float uStrength;
void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  float asp = vSize.x / max(1.0, vSize.y);
  vec2 q = (vFrame - 0.5) * vec2(asp, 1.0);
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  float d = dot(q, dir);
  float ext = 0.5 * (abs(dir.x) * asp + abs(dir.y));
  float center = mix(-ext - uWidth, ext + uWidth, uPos);
  float b = 1.0 - smoothstep(0.0, uWidth, abs(d - center));
  b *= b;
  vec3 rgb = c.rgb + uColor * (b * uStrength * c.a);
  finalColor = vec4(min(rgb, vec3(c.a)), c.a);
}`;
const SHINE_VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFrame;
out vec2 vSize;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vFrame = aPosition;
  vSize = uOutputFrame.zw;
}`;
function makeShine(PIXI, cfg) {
  try {
    const col = hex(cfg.color ?? '#fff4d6');
    const f = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: SHINE_VERT, fragment: SHINE_FRAG, name: 'rig-shine' }),
      resources: {
        shineUniforms: {
          uPos: { value: 0, type: 'f32' },
          uWidth: { value: cfg.width ?? .16, type: 'f32' },
          uAngle: { value: ((cfg.angle ?? 20) * Math.PI) / 180, type: 'f32' },
          uColor: { value: new Float32Array([((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255]), type: 'vec3<f32>' },
          uStrength: { value: cfg.strength ?? .85, type: 'f32' },
        },
      },
      resolution: 'inherit', antialias: 'inherit', padding: 0,
    });
    return f;
  } catch (e) { return null; }
}

/* (14/10/2026) MAILLAGE AJUSTÉ À LA SILHOUETTE : mesh.ajuste = true (ou { seuil, marge }). Les cases de la grille entièrement
   transparentes (avec une marge de cases autour du dessin) ne sont plus dessinées : on peut monter la grille (16×16, 24×24)
   pour des plis plus fins sans payer les sommets vides. Les sommets restent ceux de la grille : ffd, poids et épingles
   gardent les mêmes index. Image illisible (pas de canvas) : grille entière, comme avant. */
function ajusteMaillage(m, tex, cols, rows, cfg) {
  try {
    const seuil = (cfg && cfg.seuil) ?? 8, marge = (cfg && cfg.marge) ?? 1;
    const fr = tex.frame, cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(fr.width)); cv.height = Math.max(1, Math.round(fr.height));
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(tex.source.resource, fr.x, fr.y, fr.width, fr.height, 0, 0, cv.width, cv.height);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const plein = new Uint8Array(cols * rows);
    const pas = Math.max(1, Math.floor(Math.min(cv.width / cols, cv.height / rows) / 6));
    for (let y = 0; y < cv.height; y += pas) for (let x = 0; x < cv.width; x += pas) {
      if (d[(y * cv.width + x) * 4 + 3] <= seuil) continue;
      plein[Math.min(rows - 1, Math.floor(y / cv.height * rows)) * cols + Math.min(cols - 1, Math.floor(x / cv.width * cols))] = 1;
    }
    const garde = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (!plein[j * cols + i]) continue;
      for (let dj = -marge; dj <= marge; dj++) for (let di = -marge; di <= marge; di++) {
        const J = j + dj, I2 = i + di; if (J >= 0 && I2 >= 0 && J < rows && I2 < cols) garde[J * cols + I2] = 1;
      }
    }
    const vx = cols + 1, idx = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (!garde[j * cols + i]) continue;
      const v = j * vx + i;
      idx.push(v, v + 1, v + vx, v + 1, v + vx + 1, v + vx);
    }
    if (!idx.length) return;
    const T = m.geometry.indices && m.geometry.indices.constructor || Uint32Array;
    m.geometry.indices = new T(idx);
    m.cellsGardees = idx.length / 6;
  } catch (e) { /* grille entière */ }
}

/* ======================================================================
   buildSymbol(PIXI, rig, textures) → conteneur avec :
     .play(name, { track=0, mix=rig.mix??120, loop, then, speed })
     .stop(track)            .update(dtMs)           .seek(t, track=0)
     .current(track)         .time(track)            .onEvent = (ev) => {}
     .emit(emitterName, n)   .pose()                 .nodes / .bones
     .paused (bool)          .timeScale (nombre)     .setSkin(nom|null)
     .swapTextures(tex)      .clearParticles()       .worldOf[nom]
   ====================================================================== */
export function buildSymbol(PIXI, rig, textures) {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const [W, H] = rig.size;
  const parts = rig.parts;
  const byName = {};
  const nodes = {};

  // --- construction des pièces (rendu à plat) ---
  parts.forEach((part, i) => {
    const node = new PIXI.Container();
    node.part = part; node.index = i;
    node.zIndex = i;
    const src = part.frames ? part.frames[0] : part.src;
    const tex = src ? textures[src] : null;
    // offset : où tombe le coin haut-gauche de l'image dans le cadrage complet
    // (images rognées = plus légères ; images plus grandes que le cadre = lueurs)
    const off = part.offset || [0, 0];
    node.off = off;
    if (tex) {
      if (part.mesh) {
        const [cols, rows] = part.mesh.grid || [8, 8];
        const m = new PIXI.MeshPlane({ texture: tex, verticesX: cols + 1, verticesY: rows + 1 });
        m.x = off[0] - part.pivot[0]; m.y = off[1] - part.pivot[1];
        node.addChild(m); node.sprite = m;
        node.rest = Float32Array.from(m.geometry.positions);
        if (part.mesh.ajuste) ajusteMaillage(m, tex, cols, rows, part.mesh.ajuste);
        const fl = new PIXI.Mesh({ geometry: m.geometry, texture: tex });
        fl.x = m.x; fl.y = m.y; fl.blendMode = 'add'; fl.alpha = 0; fl.visible = false;
        node.addChild(fl); node.flashSp = fl;
      } else {
        const sp = new PIXI.Sprite(tex);
        sp.x = off[0] - part.pivot[0]; sp.y = off[1] - part.pivot[1];
        node.addChild(sp); node.sprite = sp;
        const fl = new PIXI.Sprite(tex);
        fl.x = sp.x; fl.y = sp.y; fl.blendMode = 'add'; fl.alpha = 0; fl.visible = false;
        node.addChild(fl); node.flashSp = fl;
      }
      if (part.blend) node.sprite.blendMode = part.blend;
      if (part.tint != null) node.sprite.tint = hex(part.tint);
    }
    if (part.frames) { node.frames = part.frames.map((s) => textures[s]); node.framesBase = node.frames.slice(); }
    node.texBase = tex;
    node.seed = i * 12.9898 + 3.1;
    node.spring = part.spring ? { a: 0, v: 0, init: false } : null;
    node.jiggle = part.jiggle ? { p: [0, 0], v: [0, 0], init: false } : null;
    node.phys = part.physique ? { init: false, tip: [0, 0], tv: [0, 0], o: [0, 0], ov: [0, 0], last: [0, 0] } : null;
    byName[part.name] = part;
    nodes[part.name] = node;
    root.addChild(node);
  });

  // --- découpe : une pièce n'est visible qu'à l'intérieur d'une autre (clip) ---
  for (const part of parts) {
    if (!part.clip || !nodes[part.clip] || !nodes[part.name].sprite) continue;
    const tgt = byName[part.clip], tn = nodes[part.clip];
    if (!tn.texBase) continue;
    const mk = new PIXI.Sprite(tn.texBase);
    const off = tgt.offset || [0, 0];
    mk.x = off[0] - tgt.pivot[0]; mk.y = off[1] - tgt.pivot[1];
    const holder = new PIXI.Container();
    holder.addChild(mk); holder.zIndex = -1;
    root.addChild(holder);
    nodes[part.name].clipHolder = holder;
    nodes[part.name].mask = mk;
  }

  // matrice de repos d'une pièce (espace du symbole, origine au centre)
  const restLocal = (part) => {
    const par = part.parent ? byName[part.parent] : null;
    return [part.pivot[0] - (par ? par.pivot[0] : W / 2), part.pivot[1] - (par ? par.pivot[1] : H / 2)];
  };
  for (const part of parts) nodes[part.name].base = restLocal(part);
  // ordre de calcul : parents d'abord
  const order = [];
  const seen = new Set();
  /* (14/10/2026) CONTRAINTE « transform » (os pilote, comme Spine) : rig.constraints = [{ type: 'transform', nom, part,
     cible, x, y, rot, sx, sy }]. La pièce reçoit, dans l'espace MONDE, une fraction du mouvement que la cible fait par
     ses PROPRES clés (pas celui de ses parents : pas de double compte). Un seul os pilote animé et des fractions
     dégressives (tête 0.9, épaules 0.7, bras 0.5, 0.3) donnent tout le chevauchement avec une seule piste de clés.
     La fraction est animable : anim.contraintes = { nom: [{ t, mix, ease }] } (multiplie x, y, rot, sx, sy). */
  const transfos = {};
  for (const c of rig.constraints || []) if (c.type === 'transform' && byName[c.part] && byName[c.cible] && c.part !== c.cible) (transfos[c.part] ||= []).push(c);
  const visit = (p, pile = new Set()) => {
    if (seen.has(p.name) || pile.has(p.name)) return; pile.add(p.name);
    if (p.parent) visit(byName[p.parent], pile);
    for (const c of transfos[p.name] || []) visit(byName[c.cible], pile);
    seen.add(p.name); order.push(p.name);
  };
  parts.forEach((p) => visit(p));

  const worldOf = {}; // matrices courantes
  const restWorld = {};
  for (const name of order) {
    const p = byName[name], n = nodes[name];
    const L = local(n.base[0], n.base[1], 0, 1, 1, 0, 0);
    restWorld[name] = p.parent ? mul(restWorld[p.parent], L) : L;
  }

  /* (13/10/2026) POIDS PEINTS : part.mesh.peint = { os: { indexSommet: poids 0..1 } } (pinceau de l'éditeur). Le poids peint
     remplace celui de cet os sur ce sommet ; les autres os se partagent le reste en gardant leurs proportions. */
  function appliquePeinture(part, n, bones) {
    const pe = part.mesh.peint; if (!pe) return;
    const nb = bones.length;
    for (const [os, pts] of Object.entries(pe)) {
      const j = bones.findIndex((b) => b.name === os); if (j < 0) continue;
      for (const [vs, w] of Object.entries(pts)) { const v = +vs; if (v * nb >= n.weights.length) continue;
        const base = v * nb, autres = 1 - n.weights[base + j], cible = Math.max(0, Math.min(1, w));
        for (let k = 0; k < nb; k++) n.weights[base + k] = k === j ? cible : (autres > 1e-6 ? n.weights[base + k] / autres * (1 - cible) : (1 - cible) / (nb - 1)); }
    }
  }
  // --- pondération des maillages sur plusieurs os ---
  for (const part of parts) {
    const n = nodes[part.name];
    if (!part.mesh || !part.mesh.bones || !n.rest) continue;
    const bones = part.mesh.bones.map((b) => (typeof b === 'string' ? { name: b } : b)).filter((b) => byName[b.name]);
    if (!bones.length) continue;
    const invSelf = inv(restWorld[part.name]);
    n.skin = bones.map((b) => ({ ...b, bind: inv(mul(invSelf, restWorld[b.name])) }));
    const nv = n.rest.length / 2;
    n.weights = new Float32Array(nv * bones.length);
    const pw = part.mesh.falloff ?? 2;
    if (part.mesh.weights === 'os') {
      /* (13/10/2026) POIDS LE LONG DES OS (mieux que Spine en automatique) : la distance se mesure au SEGMENT de l'os (de son pivot
         au pivot de son os enfant, ou à son « tip »), pas à son seul pivot ; un bras entier suit donc son os sans pincement. Puis
         lissage de Laplace sur la grille (mesh.smooth passes, 6 par défaut) : les plis deviennent doux, aucune couture possible. */
      const enfant = (nom) => { const b = bones.find((o) => byName[o.name].parent === nom); return b ? byName[b.name].pivot : null; };
      const segs = bones.map((b) => { const a0 = byName[b.name].pivot, t = b.tip ? (typeof b.tip === 'string' ? byName[b.tip].pivot : b.tip) : enfant(b.name);
        return { a: a0, b: t || a0 }; });
      const distSeg = (x, y, sg) => { const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((x - sg.a[0]) * dx + (y - sg.a[1]) * dy) / l2)) : 0; return Math.hypot(x - sg.a[0] - u * dx, y - sg.a[1] - u * dy); };
      for (let v = 0; v < nv; v++) {
        const x = n.rest[v * 2] + (part.offset?.[0] || 0), y = n.rest[v * 2 + 1] + (part.offset?.[1] || 0);
        bones.forEach((b, j) => { const d = distSeg(x, y, segs[j]); n.weights[v * bones.length + j] = (b.weight ?? 1) / (Math.pow(d / (b.radius ?? 100), pw) + 1e-3); });
      }
      const [gc, gr] = part.mesh.grid || [8, 8], NX = gc + 1, NY = gr + 1, nb = bones.length, passes = part.mesh.smooth ?? 6;
      const norm = () => { for (let v = 0; v < nv; v++) { let sm = 0; for (let j = 0; j < nb; j++) sm += n.weights[v * nb + j]; for (let j = 0; j < nb; j++) n.weights[v * nb + j] /= sm || 1; } };
      norm();
      for (let it = 0; it < passes; it++) {
        const w2 = new Float32Array(n.weights);
        for (let yy = 0; yy < NY; yy++) for (let xx = 0; xx < NX; xx++) { const v = yy * NX + xx; let c = 0; const acc = new Float32Array(nb);
          for (const [ax, ay] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = xx + ax, Y = yy + ay; if (X < 0 || Y < 0 || X >= NX || Y >= NY) continue; const k = (ax || ay) ? 1 : 2; c += k; for (let j = 0; j < nb; j++) acc[j] += k * n.weights[(Y * NX + X) * nb + j]; }
          for (let j = 0; j < nb; j++) w2[v * nb + j] = acc[j] / c; }
        n.weights = w2;
      }
      norm();
      appliquePeinture(part, n, bones);
      continue;
    }
    for (let v = 0; v < nv; v++) {
      const x = n.rest[v * 2] + (part.offset?.[0] || 0) - part.pivot[0], y = n.rest[v * 2 + 1] + (part.offset?.[1] || 0) - part.pivot[1];
      let sum = 0;
      bones.forEach((b, j) => {
        const bp = byName[b.name].pivot;
        const d = Math.hypot(x + part.pivot[0] - bp[0], y + part.pivot[1] - bp[1]);
        const w = (b.weight ?? 1) / (Math.pow(d / (b.radius ?? 100), pw) + 1e-3);
        n.weights[v * bones.length + j] = w; sum += w;
      });
      for (let j = 0; j < bones.length; j++) n.weights[v * bones.length + j] /= sum;
    }
    appliquePeinture(part, n, bones);
  }

  // --- reflets ---
  for (const part of parts) {
    if (!part.shine || !nodes[part.name].sprite) continue;
    nodes[part.name].shineFx = makeShine(PIXI, part.shine);
  }

  // --- particules ---
  const fxLayer = new PIXI.Container();
  fxLayer.zIndex = 10000; root.addChild(fxLayer);
  const emitters = {};
  for (const [name, e] of Object.entries(rig.emitters || {})) {
    emitters[name] = { ...e, name, acc: 0, rate: e.rate || 0, tex: textures[e.tex] || particleTexture(PIXI, e.tex || 'soft') };
    if (e.z != null) { emitters[name].layer = new PIXI.Container(); emitters[name].layer.zIndex = e.z; root.addChild(emitters[name].layer); }
  }
  const live = [];
  const emitterOrigin = (e) => {
    const M = worldOf[e.part] || I();
    const p = byName[e.part];
    const at = e.at || (p ? p.pivot : [W / 2, H / 2]);
    return { pos: apply(M, at[0] - (p ? p.pivot[0] : W / 2), at[1] - (p ? p.pivot[1] : H / 2)), rot: Math.atan2(M[1], M[0]) };
  };
  function spawn(e, count) {
    const { pos, rot } = emitterOrigin(e);
    const area = e.area || [0, 0];
    for (let i = 0; i < count; i++) {
      const sp = new PIXI.Sprite(e.tex);
      sp.anchor.set(.5);
      sp.blendMode = e.blend || 'add';
      sp.tint = hex(Array.isArray(e.color) ? e.color[Math.floor(Math.random() * e.color.length)] : e.color ?? 0xffffff);
      const ang = ((e.angle ?? -90) + (Math.random() - .5) * (e.spread ?? 360)) * Math.PI / 180 + (e.local ? rot : 0);
      const spd = rnd(e.speed ?? [60, 160]);
      const q = {
        sp, age: 0, life: rnd(e.life ?? [500, 900]),
        x: pos[0] + (Math.random() - .5) * area[0], y: pos[1] + (Math.random() - .5) * area[1],
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        s0: rnd(e.scale ?? [.3, .6]), s1: e.scaleEnd ?? 0, a0: e.alpha ?? 1,
        spin: rnd(e.spin ?? 0), rot: e.rot0 !== undefined ? rnd(e.rot0) * Math.PI / 180 : Math.random() * Math.PI * 2, e,
        fl: e.flutter ? Math.random() * Math.PI * 2 : 0,
      };
      // shrink : la particule finit à (1 - shrink) de sa taille de départ
      if (e.shrink !== undefined) q.s1 = q.s0 * (1 - e.shrink);
      sp.rotation = q.rot;
      (e.layer || fxLayer).addChild(sp);
      live.push(q);
    }
  }
  function stepParticles(dt) {
    const h = dt / 1000;
    for (const e of Object.values(emitters)) {
      if (e.rate > 0) { e.acc += e.rate * h; const n = Math.floor(e.acc); if (n) { e.acc -= n; spawn(e, n); } }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i], e = q.e;
      q.age += dt;
      const k = q.age / q.life;
      if (k >= 1) { q.sp.destroy(); live.splice(i, 1); continue; }
      const drag = Math.exp(-(e.drag ?? 1) * h);
      q.vx *= drag; q.vy = q.vy * drag + (e.gravity ?? 0) * h;
      q.x += q.vx * h; q.y += q.vy * h; q.rot += q.spin * h;
      const fi = e.fadeIn ?? .08;
      // fadeOut : particule nette jusqu'à la fin, puis effacée sur cette fraction de sa vie
      const a = e.fadeOut !== undefined ? (k < fi ? k / fi : k > 1 - e.fadeOut ? (1 - k) / e.fadeOut : 1) : (k < fi ? k / fi : 1 - (k - fi) / (1 - fi));
      q.sp.alpha = q.a0 * Math.max(0, a);
      let sc = q.s0 + (q.s1 - q.s0) * EASE.outQuad(k);
      // popOut : la particule reste opaque et disparaît en rétrécissant d'un
      // coup sur la fin de sa vie (un pop-corn dessiné ne devient jamais gris)
      if (e.popOut && k > 1 - e.popOut) sc *= EASE.inQuad(Math.max(0, (1 - k) / e.popOut));
      // flutter : un confetti qui virevolte (il se retourne en tombant)
      if (e.flutter) { q.fl += e.flutter * Math.PI * 2 * h; q.sp.scale.set(sc * Math.cos(q.fl), sc); }
      else q.sp.scale.set(sc);
      q.sp.position.set(q.x, q.y); q.sp.rotation = q.rot;
    }
  }

  // --- pistes (0 = base, 1+ = superposées, additives) ---
  const tracks = [];
  let clock = 0;
  root.timeScale = 1;
  root.paused = false;
  root.onEvent = null;
  root.nodes = nodes;
  root.rig = rig;
  root.order = order;

  // part.alpha : opacité de repos d'une pièce quand aucune clé ne la règle
  // (un pop-corn caché jusqu'à l'explosion, une lueur discrète)
  const defOf = (p, k) => (k === 'alpha' && p.alpha != null ? p.alpha : DEFAULTS[k]);
  const fullPose = () => { const o = {}; for (const p of parts) { o[p.name] = { ...DEFAULTS }; if (p.alpha != null) o[p.name].alpha = p.alpha; } return o; };
  function samplePose(anim, t) {
    const out = {};
    for (const [pname, tr] of Object.entries(anim.tracks || {})) {
      if (!nodes[pname]) continue;
      const o = {};
      for (const k of ANIM_PROPS) { if (k === 'seq') continue; const v = sampleTrack(tr, k, t); if (v !== undefined) o[k] = v; }
      // seq : [image de départ, ms écoulées depuis la clé] ; avant la première clé, la séquence n'a pas démarré
      let ks = null;
      for (const k of tr) if ('seq' in k && k.t <= t) ks = k;
      if (ks) o.seq = [ks.seq, t - ks.t];
      else if (tr.some((k) => 'seq' in k)) o.seq = null;
      out[pname] = o;
    }
    return out;
  }
  const lastPose = {}; // pose affichée à la frame précédente (pour les fondus)

  root.play = (name, opts = {}) => {
    const a = rig.anims[name];
    if (!a) return;
    const ti = opts.track ?? 0;
    const prev = tracks[ti] ? tracks[ti].name : null;
    const pairMix = prev && rig.mixes ? rig.mixes[`${prev}>${name}`] : undefined;
    const mix = opts.mix ?? pairMix ?? a.mix ?? rig.mix ?? 120;
    tracks[ti] = {
      name, anim: a, t: 0, loop: opts.loop ?? a.loop, speed: opts.speed ?? 1,
      then: opts.then !== undefined ? opts.then : (a.loop || ti > 0 ? null : (rig.anims.idle ? 'idle' : null)),
      mix, mixT: 0, from: ti === 0 ? JSON.parse(JSON.stringify(lastPose)) : null,
      weight: ti > 0 ? (mix > 0 ? 0 : 1) : 1, fired: new Set(), ending: false,
    };
    // start : 'hasard' (deux cases ne respirent jamais ensemble) ou un temps en ms
    if (opts.start !== undefined) {
      const st = opts.start === 'hasard' || opts.start === 'random' ? Math.random() * a.dur : +opts.start;
      tracks[ti].t = Math.max(0, Math.min(a.dur, st || 0));
      for (const ev of a.events || []) if (ev.t <= tracks[ti].t) tracks[ti].fired.add(ev);
      return;
    }
    // (14/10/2026) anim.physiqueReinit : les os de anim.physique repartent au repos quand l'animation commence
    if (ti === 0 && a.physiqueReinit && a.physique) for (const nm of Object.keys(a.physique)) if (nodes[nm] && nodes[nm].phys) nodes[nm].phys.init = false;
    fireEvents(tracks[ti], -1, 0);
  };
  root.stop = (ti = 0, mix = 120) => { const tr = tracks[ti]; if (tr) { if (ti > 0 && mix > 0) { tr.ending = true; tr.fade = mix; } else tracks[ti] = null; } };
  root.current = (ti = 0) => (tracks[ti] ? tracks[ti].name : null);
  root.time = (ti = 0) => (tracks[ti] ? tracks[ti].t : 0);
  root.seek = (t, ti = 0) => { const tr = tracks[ti]; if (tr) { tr.t = Math.max(0, Math.min(t, tr.anim.dur)); tr.mixT = tr.mix; tr.weight = 1; } };
  root.emit = (name, n = 10) => { const e = emitters[name]; if (e) spawn(e, n); };
  root.emitters = emitters;
  /* Change les images de toutes les pieces d'un coup : `tex` = { src: Texture }
     (une version ternie ou grise du meme dessin, meme taille). Les sequences
     d'images suivent. Les pieces sans version dans `tex` gardent la leur. */
  root.swapTextures = (tex) => {
    for (const n of Object.values(nodes)) {
      const p = n.part;
      if (p.frames && n.frames) {
        n.frames = p.frames.map((s, i) => tex[s] || n.framesBase[i]);
        continue;
      }
      if (!n.sprite || !p.src) continue;
      const t = tex[p.src] || n.texBase;
      if (n.sprite.texture !== t) { n.sprite.texture = t; n.flashSp.texture = t; }
    }
  };
  /* Skins nommés du rig : rig.skins = { gris: { 'corps.webp': 'corps-gris.webp' } } */
  /* Deux sortes de skins, combinables :
     - rig.skins[nom] = { 'image.webp': 'autre-image.webp' } : mêmes pièces, autres images ;
     - part.skin = 'nom' : la pièce n'est visible que quand ce skin est actif
       (chaque skin a ses propres pièces, avec leurs pivots). Sans skin choisi,
       c'est rig.skinDefaut (ou le premier groupe) qui s'affiche. */
  const groupes = [...new Set(parts.map((p) => p.skin).filter(Boolean))];
  root.skin = null;
  root.skins = () => [...new Set([...Object.keys(rig.skins || {}), ...groupes])];
  root.setSkin = (name) => {
    root.skin = name && ((rig.skins && rig.skins[name]) || groupes.includes(name)) ? name : null;
    const map = {};
    if (root.skin && rig.skins && rig.skins[root.skin]) for (const [a, b] of Object.entries(rig.skins[root.skin])) if (textures[b]) map[a] = textures[b];
    root.swapTextures(map);
  };
  const groupeActif = () => root.skin && groupes.includes(root.skin) ? root.skin : (rig.skinDefaut || groupes[0]);
  /* Teinte d'une pièce imposée par le jeu (couleur d'un médaillon selon la
     valeur…) ; null rend la teinte de l'animation. */
  root.setTint = (name, color) => { const n = nodes[name]; if (n) n.tintOverride = color == null ? null : hex(color); };
  /* (14/10/2026) Teinte du SYMBOLE ENTIER imposée par le jeu, avec fondu : root.setTeinte(0x7a8c90, 150) assombrit un
     non-gagnant pendant un gain (Cybersaurus), root.setTeinte(null) revient au blanc. Se multiplie à la teinte de chaque
     pièce et à la piste « @symbole » de l'animation. */
  const tj = { de: 0xffffff, vers: 0xffffff, t: 0, dur: 0 };
  root.setTeinte = (color, ms = 0) => {
    const cur = tj.dur > 0 ? lerpColor(tj.de, tj.vers, Math.min(1, tj.t / tj.dur)) : tj.vers;
    tj.de = cur; tj.vers = color == null ? 0xffffff : hex(color); tj.t = 0; tj.dur = Math.max(0, ms);
  };
  root.teinte = () => tj.vers;
  function teinteGlobale(dt) {
    tj.t += dt;
    let g = tj.dur > 0 && tj.t < tj.dur ? lerpColor(tj.de, tj.vers, EASE.inOutQuad(tj.t / tj.dur)) : tj.vers;
    if (teinteAnim !== undefined) g = mulColor(g, teinteAnim);
    return g;
  }
  /* Accroche un objet du jeu (un texte, un sprite) à une pièce : il suit sa
     position, sa rotation et son échelle, et se dessine juste devant elle. */
  const attached = [];
  root.attach = (name, obj, { z = null } = {}) => {
    if (!nodes[name]) return;
    root.addChild(obj);
    attached.push({ name, obj, z });
  };
  root.detach = (obj) => { const i = attached.findIndex((a) => a.obj === obj); if (i >= 0) { attached.splice(i, 1); obj.parent && obj.parent.removeChild(obj); } };
  root.clearParticles = () => { for (const q of live) q.sp.destroy(); live.length = 0; };
  /* nombre de particules encore en vol (garder le symbole tant qu'il en reste) */
  root.particleCount = () => live.length;

  function fireEvents(tr, from, to) {
    for (const ev of tr.anim.events || []) {
      if (ev.t > from && ev.t <= to && !tr.fired.has(ev)) {
        tr.fired.add(ev);
        if (ev.emit) root.emit(ev.emit, ev.n ?? 12);
        if (ev.rate && emitters[ev.rate[0]]) emitters[ev.rate[0]].rate = ev.rate[1];
        if (root.onEvent) root.onEvent({ ...ev, anim: tr.name });
      }
    }
  }

  function advance(dt) {
    tracks.forEach((tr, ti) => {
      if (!tr) return;
      const d = dt * tr.speed;
      const before = tr.t;
      tr.t += d; tr.mixT += dt;
      if (ti > 0) tr.weight = tr.ending ? Math.max(0, tr.weight - dt / tr.fade) : Math.min(1, tr.mix > 0 ? tr.mixT / tr.mix : 1);
      if (tr.ending && tr.weight <= 0) { tracks[ti] = null; return; }
      fireEvents(tr, before, Math.min(tr.t, tr.anim.dur));
      if (tr.t >= tr.anim.dur) {
        if (tr.loop) { tr.t %= tr.anim.dur; tr.fired.clear(); fireEvents(tr, -1, tr.t); }
        else if (tr.then) { const q = tr.then; root.play(q, { track: ti }); }
        else if (ti > 0) { tr.t = tr.anim.dur; if (!tr.ending) { tr.ending = true; tr.fade = tr.mix || 1; } }
        else tr.t = tr.anim.dur;
      }
    });
  }

  function compose() {
    const pose = fullPose();
    const t0 = tracks[0];
    if (t0) {
      const cur = samplePose(t0.anim, t0.t);
      const w = t0.mix > 0 && t0.from ? Math.min(1, t0.mixT / t0.mix) : 1;
      const ew = EASE.inOutQuad(w);
      for (const p of parts) {
        const o = pose[p.name], c = cur[p.name] || {}, f = (t0.from && t0.from[p.name]) || {};
        for (const k of ANIM_PROPS) {
          if (k === 'ffd') { // tableau : fondu vers zéro s'il n'est plus clé
            if (w >= 1 || (!c.ffd && !f.ffd)) { if (c.ffd) o.ffd = c.ffd; }
            else o.ffd = lerpArr(f.ffd, c.ffd, ew);
            continue;
          }
          const target = c[k] !== undefined ? c[k] : (k in DEFAULTS ? defOf(p, k) : undefined);
          if (target === undefined) { if (w < 1 && f[k] !== undefined && STEPPED.has(k)) o[k] = f[k]; continue; }
          if (w >= 1 || f[k] === undefined) { o[k] = target; continue; }
          if (STEPPED.has(k)) o[k] = ew < .5 ? f[k] : target;
          else if (k === 'tint') o[k] = lerpColor(f[k], target, ew);
          else o[k] = f[k] + (target - f[k]) * ew;
        }
      }
    }
    for (let ti = 1; ti < tracks.length; ti++) {
      const tr = tracks[ti];
      if (!tr || tr.weight <= 0) continue;
      const cur = samplePose(tr.anim, tr.t), w = EASE.inOutQuad(tr.weight);
      for (const [pn, c] of Object.entries(cur)) {
        const o = pose[pn];
        for (const [k, v] of Object.entries(c)) {
          if (ADDITIVE.has(k)) o[k] += v * w;
          else if (k === 'sx' || k === 'sy' || k === 'alpha' || k === 'wig') o[k] *= 1 + (v - 1) * w;
          else if (k === 'tint') o[k] = lerpColor(o.tint ?? 0xffffff, v, w);
          else if (k === 'ffd') o.ffd = o.ffd ? o.ffd.map((x, i) => x + (v[i] || 0) * w) : v.map((x) => x * w);
          else if (k === 'shine') { if (w > .01) o.shine = v; }
          else if (w >= .5) o[k] = v;
        }
      }
    }
    // contraintes « suivre » : une pièce reprend une part du mouvement d'une autre
    for (const c of rig.constraints || []) {
      if (c.type !== 'suivre' || !pose[c.part] || !pose[c.cible]) continue;
      const o = pose[c.part], s = pose[c.cible];
      for (const k of ['rot', 'x', 'y', 'skx', 'sky']) if (c[k]) o[k] += s[k] * c[k];
      for (const k of ['sx', 'sy']) if (c[k]) o[k] *= 1 + (s[k] - 1) * c[k];
    }
    // (14/10/2026) état de l'animation de base pour ce qui n'est pas une pièce
    const a0 = t0 ? t0.anim : null;
    animT = t0 ? t0.t : 0;
    // fraction animée des contraintes « transform » : anim.contraintes = { nom: [{ t, mix }] }
    mixC = {};
    if (a0 && a0.contraintes) for (const [nm, tr] of Object.entries(a0.contraintes)) { const m = sampleTrack(tr, 'mix', t0.t); if (m !== undefined) mixC[nm] = m; }
    // réglages de physique propres à l'animation (Spine change inertie/amortissement par animation) : anim.physique = { pièce: {…} }
    physOv = (a0 && a0.physique) || null;
    // teinte du symbole entier : piste « @symbole » (clés tint / alpha), multipliée par celle imposée par le jeu
    const ts = a0 && a0.tracks && a0.tracks['@symbole'];
    teinteAnim = ts ? sampleTrack(ts, 'tint', t0.t) : undefined;
    return pose;
  }
  let animT = 0, mixC = {}, physOv = null, teinteAnim;

  const pick = (o) => ({ bend: o.bend, wave: o.wave, bulge: o.bulge, bulge2: o.bulge2, bulge3: o.bulge3, bulge4: o.bulge4, taper: o.taper, ffd: o.ffd });
  function deformMesh(n, v, M) {
    const part = n.part, rest = n.rest, m = n.sprite;
    const pos = m.geometry.positions;
    const [px, py] = part.pivot, [ox, oy] = n.off;
    const L = part.mesh.length || H / 2;
    const dir = part.mesh.dir ?? 1; // +1 : la pièce pend sous son pivot, -1 : elle monte (flamme)
    const ffd = v.ffd && v.ffd.length ? v.ffd : null;
    const hasDef = v.bend || v.wave || v.bulge || v.bulge2 || v.bulge3 || v.bulge4 || v.taper || ffd;
    const skin = n.skin;
    let invSelf, rel;
    if (skin) {
      invSelf = inv(M);
      rel = skin.map((b) => mul(mul(invSelf, worldOf[b.name]), b.bind));
    }
    if (!hasDef && !skin && !n.dirty) return;
    // zones de gonflement : mesh.bulges = [{ center, radius }, …] pilotées par
    // les clés bulge, bulge2, bulge3 (un œil, une gemme, un orbe qui pulse)
    const zones = (part.mesh.bulges || [{ center: part.mesh.center, radius: part.mesh.radius }]).map((z, j) => ({
      cx: z.center ? z.center[0] - px : 0, cy: z.center ? z.center[1] - py : 0,
      R: z.radius || L / 2, amt: [v.bulge, v.bulge2, v.bulge3, v.bulge4][j] || 0,
    })).filter((z) => z.amt);
    const wf = part.mesh.waveFreq ?? 1.5, ws = part.mesh.waveSpeed ?? 1.2;
    const nb = skin ? skin.length : 0;
    for (let i = 0; i < rest.length; i += 2) {
      let x = rest[i] + ox - px, y = rest[i + 1] + oy - py;
      if (ffd) { x += ffd[i] || 0; y += ffd[i + 1] || 0; }
      const u = Math.max(0, Math.min(1.5, (y * dir) / L));
      if (v.taper) x *= 1 + v.taper * u;
      for (const z of zones) {
        const dx = x - z.cx, dy = y - z.cy, r2 = (dx * dx + dy * dy) / (z.R * z.R);
        if (r2 < 1) { const f = 1 + z.amt * (1 - r2) * (1 - r2); x = z.cx + dx * f; y = z.cy + dy * f; }
      }
      if (v.bend) x += v.bend * L * u * u;
      if (v.wave) x += v.wave * L * .06 * u * Math.sin(Math.PI * 2 * (u * wf - clock / 1000 * ws));
      if (skin) {
        let sx = 0, sy = 0;
        const vi = (i / 2) * nb;
        for (let j = 0; j < nb; j++) { const w = n.weights[vi + j]; if (w < 1e-4) continue; const p = apply(rel[j], x, y); sx += p[0] * w; sy += p[1] * w; }
        x = sx; y = sy;
      }
      pos[i] = x + px - ox; pos[i + 1] = y + py - oy;
    }
    m.geometry.getBuffer('aPosition').update();
    n.dirty = hasDef || !!skin;
  }

  /* Matrices monde de toutes les pièces. `extra` = rotations ajoutées par
     l'IK ; `h` > 0 seulement pour la passe finale (les ressorts n'avancent
     qu'une fois par image). */
  function computeWorld(pose, h, extra) {
    for (const name of order) {
      const n = nodes[name], part = n.part, v = pose[name];
      const par = part.parent ? worldOf[part.parent] : null;
      let rot = v.rot + (extra[name] || 0), x = v.x, y = v.y;
      // bruit organique (respiration, flamme, plume)
      if (part.wiggle && v.wig) {
        const wg = part.wiggle, f = (wg.freq ?? 1) * clock / 1000 * Math.PI * 2 / 3;
        rot += (wg.rot || 0) * v.wig * noise(f, n.seed);
        x += (wg.x || 0) * v.wig * noise(f, n.seed + 7);
        y += (wg.y || 0) * v.wig * noise(f, n.seed + 13);
      }
      // ressort de rotation : suit la rotation monde du parent avec retard
      if (n.spring && par) {
        const target = Math.atan2(par[1], par[0]);
        const s = n.spring, sp = part.spring;
        if (!s.init) { s.a = target; s.init = true; }
        if (h > 0) {
          let d = target - s.a; d = Math.atan2(Math.sin(d), Math.cos(d));
          /* (13/10/2026) PHYSIQUE type Spine 4.2, en option : gravity (la pièce penche vers le bas du monde, rad/s²),
             wind (souffle organique, bruit lent), et la traîne reste bornée à « limit » radians */
          let f = sp.k * d - sp.damp * s.v;
          if (sp.gravity) f += sp.gravity * Math.cos(s.a + (sp.restAngle ?? 0));   // couple qui ramène la pièce vers le bas
          if (sp.wind) f += sp.wind * noise(clock / 1000 * (sp.windFreq ?? .6) * Math.PI, n.seed + 31);
          s.v += f * h; s.a += s.v * h;
          if (sp.limit) { let l = s.a - target; l = Math.atan2(Math.sin(l), Math.cos(l)); if (Math.abs(l) > sp.limit) { s.a = target + Math.sign(l) * sp.limit; s.v *= .5; } }
        }
        let lag = s.a - target; lag = Math.atan2(Math.sin(lag), Math.cos(lag));
        rot += lag * (sp.gain ?? 1);
      }
      // (14/10/2026) contraintes « transform » : part du mouvement PROPRE de l'os pilote, en espace monde
      let tsx = v.sx, tsy = v.sy;
      if (transfos[name]) for (const c of transfos[name]) {
        const Mc = worldOf[c.cible]; if (!Mc) continue;
        const tg = byName[c.cible], parC = tg.parent ? worldOf[tg.parent] : I(), bc = nodes[c.cible].base;
        const mix = (c.nom && mixC[c.nom] !== undefined ? mixC[c.nom] : 1) * (c.mix ?? 1);
        if (!mix) continue;
        if (c.x || c.y) {
          const rp = apply(parC, bc[0], bc[1]), dW = [Mc[4] - rp[0], Mc[5] - rp[1]];
          let lx = dW[0], ly = dW[1];
          if (par) { const det = par[0] * par[3] - par[2] * par[1] || 1e-9; lx = (par[3] * dW[0] - par[2] * dW[1]) / det; ly = (-par[1] * dW[0] + par[0] * dW[1]) / det; }
          x += lx * (c.x || 0) * mix; y += ly * (c.y || 0) * mix;
        }
        if (c.rot) rot += wrap(Math.atan2(Mc[1], Mc[0]) - Math.atan2(parC[1], parC[0])) * c.rot * mix;
        if (c.sx) tsx *= 1 + (Math.hypot(Mc[0], Mc[1]) / (Math.hypot(parC[0], parC[1]) || 1) - 1) * c.sx * mix;
        if (c.sy) tsy *= 1 + (Math.hypot(Mc[2], Mc[3]) / (Math.hypot(parC[2], parC[3]) || 1) - 1) * c.sy * mix;
      }
      const L = local(n.base[0] + x, n.base[1] + y, rot, tsx, tsy, v.skx, v.sky);
      let M = par ? mul(par, L) : L;
      // ressort de position : la pièce traîne derrière le mouvement (gelée, chaîne)
      if (n.jiggle) {
        const j = n.jiggle, jp = part.jiggle;
        if (!j.init) { j.p = [M[4], M[5]]; j.init = true; }
        if (h > 0) for (let a = 0; a < 2; a++) { j.v[a] += (jp.k * (M[4 + a] - j.p[a]) - jp.damp * j.v[a]) * h; j.p[a] += j.v[a] * h; }
        const g = jp.gain ?? 1;
        M = [...M]; M[4] += (j.p[0] - M[4]) * g; M[5] += (j.p[1] - M[5]) * g;
      }
      /* (13/10/2026) PHYSIQUE type Spine 4.2 : part.physique = { longueur, inertie (0..1 : part du mouvement du parent que le bout
         subit en retard), raideur, amortissement, masse, gravite (px/s², vers le bas du symbole), vent (px/s², souffle organique),
         rotation (0..1), position (0..1 : le pivot traîne aussi), etirement (0..1 : l'os s'allonge en vitesse), limite (rad), mix }.
         Le BOUT de l'os est une masse au bout d'un ressort : il traîne quand le corps monte, descend, tourne ou s'arrête. */
      if (n.phys) {
        // (14/10/2026) anim.physique[pièce] remplace des réglages le temps de l'animation (inertie 0.2 / amortissement 0.8 en
        // palier pour une flamme pendant un gain, comme Cybersaurus) ; clé « phys » (0..1) = fondu de la physique
        const ph = physOv && physOv[name] ? { ...part.physique, ...physOv[name] } : part.physique, st = n.phys;
        const mix = (ph.mix ?? 1) * (v.phys ?? 1);
        const len = ph.longueur ?? 100, ux = M[0], uy = M[1], ul = Math.hypot(ux, uy) || 1;
        const tipT = [M[4] + ux / ul * len * ul, M[5] + uy / ul * len * ul];
        if (!st.init) { st.tip = [...tipT]; st.tv = [0, 0]; st.o = [M[4], M[5]]; st.ov = [0, 0]; st.last = [M[4], M[5], ...tipT]; st.init = true; }
        if (h > 0) {
          const inert = ph.inertie ?? .5, k = ph.raideur ?? 100, c = ph.amortissement ?? 8, m = Math.max(.05, ph.masse ?? 1);
          // le bout subit (1 - inertie) du déplacement de sa cible ; le reste, il le rattrape par le ressort
          st.tip[0] += (tipT[0] - st.last[2]) * (1 - inert); st.tip[1] += (tipT[1] - st.last[3]) * (1 - inert);
          const g = ph.gravite || 0, w = ph.vent ? ph.vent * noise(clock / 1000 * (ph.ventFreq ?? .6) * Math.PI, n.seed + 41) : 0;
          // (14/10/2026) ph.pas (ms) : intégration à pas fixe, le résultat ne dépend plus de la cadence d'affichage
          const ns = ph.pas ? Math.max(1, Math.round(h * 1000 / ph.pas)) : 1, hs = h / ns;
          for (let s = 0; s < ns; s++) for (let a = 0; a < 2; a++) { const f = k * (tipT[a] - st.tip[a]) - c * st.tv[a] + (a ? g : w); st.tv[a] += f / m * hs; st.tip[a] += st.tv[a] * hs; }
          if (ph.position) { st.o[0] += (M[4] - st.last[0]) * (1 - inert); st.o[1] += (M[5] - st.last[1]) * (1 - inert);
            for (let s = 0; s < ns; s++) for (let a = 0; a < 2; a++) { const f = k * (M[4 + a] - st.o[a]) - c * st.ov[a]; st.ov[a] += f / m * hs; st.o[a] += st.ov[a] * hs; } }
          else st.o = [M[4], M[5]];
          st.last = [M[4], M[5], ...tipT];
        }
        const ox = M[4] + ((ph.position ? st.o[0] : M[4]) - M[4]) * mix * (ph.position ?? 0), oy = M[5] + ((ph.position ? st.o[1] : M[5]) - M[5]) * mix * (ph.position ?? 0);
        let d = Math.atan2(st.tip[1] - oy, st.tip[0] - ox) - Math.atan2(tipT[1] - M[5], tipT[0] - M[4]); d = Math.atan2(Math.sin(d), Math.cos(d));
        if (ph.limite) d = Math.max(-ph.limite, Math.min(ph.limite, d));
        d *= (ph.rotation ?? 1) * mix;
        const etir = 1 + ((Math.hypot(st.tip[0] - ox, st.tip[1] - oy) / (len * ul)) - 1) * (ph.etirement ?? 0) * mix;
        const cs = Math.cos(d), sn = Math.sin(d);
        // rotation d autour du pivot, étirement le long de l'os
        const a0 = M[0] * etir, b0 = M[1] * etir;
        M = [a0 * cs - b0 * sn, a0 * sn + b0 * cs, M[2] * cs - M[3] * sn, M[2] * sn + M[3] * cs, ox, oy];
      }
      worldOf[name] = M;
    }
  }

  // point de l'image (pixels du cadrage) → position monde actuelle, porté par une pièce
  const pointOn = (name, pt) => apply(worldOf[name], pt[0] - byName[name].pivot[0], pt[1] - byName[name].pivot[1]);
  const tipOf = (c) => (typeof c.tip === 'string' ? byName[c.tip].pivot : c.tip);

  /* IK : un os vise la cible, ou deux os plient pour que le bout touche la
     cible (bras, jambe, chaîne). rig.ik = [{ bones: ['bras','avant'], target:
     'cible', tip: 'main' | [x, y], bend: 1 | -1, mix: 1 }] */
  function solveIK(pose, extra) {
    const list = rig.ik || [];
    if (!list.length) return;
    for (const c of list) {
      const bones = (c.bones || []).filter((b) => byName[b]);
      if (!bones.length || !byName[c.target] || !c.tip || (typeof c.tip === 'string' && !byName[c.tip])) continue;
      const mix = c.mix ?? 1;
      if (mix <= 0) continue;
      computeWorld(pose, 0, extra);
      const tgt = [worldOf[c.target][4], worldOf[c.target][5]];
      const A = bones[0];
      if (bones.length === 1) {
        const pa = [worldOf[A][4], worldOf[A][5]], tip = pointOn(A, tipOf(c));
        const d = wrap(Math.atan2(tgt[1] - pa[1], tgt[0] - pa[0]) - Math.atan2(tip[1] - pa[1], tip[0] - pa[0]));
        extra[A] = (extra[A] || 0) + d * mix;
        continue;
      }
      const B = bones[1];
      const pa = [worldOf[A][4], worldOf[A][5]], pb = [worldOf[B][4], worldOf[B][5]], tip = pointOn(B, tipOf(c));
      const l1 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), l2 = Math.hypot(tip[0] - pb[0], tip[1] - pb[1]);
      let d = Math.hypot(tgt[0] - pa[0], tgt[1] - pa[1]);
      d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d));
      const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d || 1)));
      const base = Math.atan2(tgt[1] - pa[1], tgt[0] - pa[0]);
      const want = base - (c.bend ?? 1) * Math.acos(cosA);
      const dA = wrap(want - Math.atan2(pb[1] - pa[1], pb[0] - pa[0]));
      extra[A] = (extra[A] || 0) + dA * mix;
      computeWorld(pose, 0, extra);
      const pb2 = [worldOf[B][4], worldOf[B][5]], tip2 = pointOn(B, tipOf(c));
      const dB = wrap(Math.atan2(tgt[1] - pb2[1], tgt[0] - pb2[0]) - Math.atan2(tip2[1] - pb2[1], tip2[0] - pb2[0]));
      extra[B] = (extra[B] || 0) + dB * mix;
    }
  }

  function applyPose(pose, dt) {
    const h = dt / 1000;
    const extra = {};
    solveIK(pose, extra);
    computeWorld(pose, h, extra);
    const G = teinteGlobale(dt);
    for (const name of order) {
      const n = nodes[name], v = pose[name], M = worldOf[name];
      n.setFromMatrix(new PIXI.Matrix(M[0], M[1], M[2], M[3], M[4], M[5]));
      n.alpha = Math.max(0, Math.min(1, v.alpha));
      // part.visible = false : pièce cachée au repos, montrée par une clé « visible »
      n.visible = (v.visible !== undefined ? !!v.visible : n.part.visible !== false) && (!n.part.skin || n.part.skin === groupeActif());
      n.zIndex = v.z !== undefined ? v.z : n.index;
      if (n.clipHolder) {
        const cm = worldOf[n.part.clip];
        n.clipHolder.setFromMatrix(new PIXI.Matrix(cm[0], cm[1], cm[2], cm[3], cm[4], cm[5]));
      }
      if (n.sprite) {
        if (n.tintOverride != null) { n.sprite.tint = n.tintOverride; n.flashSp.tint = n.tintOverride; }
        else if (v.tint !== undefined) n.sprite.tint = v.tint;
        else if (n.part.tint == null) n.sprite.tint = 0xffffff;
        if (G !== 0xffffff) { // teinte du symbole entier (assombrir les non-gagnants…) : multipliée à celle de la pièce
          const b = n.tintOverride ?? (v.tint !== undefined ? v.tint : (n.part.tint != null ? hex(n.part.tint) : 0xffffff));
          n.sprite.tint = mulColor(b, G);
          n.teinteG = true;
        } else if (n.teinteG) { n.teinteG = false; n.sprite.tint = n.tintOverride ?? (v.tint !== undefined ? v.tint : (n.part.tint != null ? hex(n.part.tint) : 0xffffff)); }
        if (n.frames) {
          let f = v.frame;
          const sq = n.part.seq;
          /* (14/10/2026) SÉQUENCE PILOTÉE : part.seq = { fps, mode: 'boucle' | 'une-fois' | 'aller-retour', debut, fin: 'garde' | 'cache',
             horloge: 'anim' | 'globale' } et clé « seq » = image de départ (la séquence repart à cette clé). Une flamme de 42 images
             qui démarre à l'image 15 au bon moment, jouée une fois puis cachée : c'est ainsi que Spine joue ses effets. */
          if (f === undefined && (sq || v.seq !== undefined)) {
            const c = sq || {}, fps = c.fps ?? n.part.fps ?? 30, nf = n.frames.length;
            let i0 = c.debut ?? 0, el = null;
            if (Array.isArray(v.seq)) { i0 = v.seq[0]; el = v.seq[1]; }
            else if (v.seq === undefined) el = c.horloge === 'globale' ? clock : animT;
            let idx = el === null ? i0 : i0 + Math.floor(el / 1000 * fps + 1e-6);
            const mode = c.mode || 'boucle';
            if (mode === 'une-fois') { if (idx >= nf && c.fin === 'cache') n.visible = false; idx = Math.min(nf - 1, idx); }
            else if (mode === 'aller-retour') { const P = Math.max(1, 2 * nf - 2); idx = ((idx % P) + P) % P; if (idx >= nf) idx = P - idx; }
            f = idx;
          }
          if (f === undefined && n.part.fps) f = Math.floor(clock / 1000 * n.part.fps);
          f = ((Math.floor(f || 0) % n.frames.length) + n.frames.length) % n.frames.length;
          if (n.sprite.texture !== n.frames[f]) { n.sprite.texture = n.frames[f]; n.flashSp.texture = n.frames[f]; }
        } else if (v.img !== undefined || n.imgCle) {
          // (14/10/2026) clé « img » : la pièce change d'image à cet instant (œil fermé, bouche ouverte…), comme un attachment Spine
          const t = v.img !== undefined && textures[v.img] ? textures[v.img] : n.texBase;
          n.imgCle = v.img !== undefined;
          if (t && n.sprite.texture !== t) { n.sprite.texture = t; n.flashSp.texture = t; }
        }
        n.flashSp.visible = v.flash > .001;
        n.flashSp.alpha = Math.min(1, v.flash);
        if (n.shineFx) {
          const on = v.shine !== undefined && v.shine > 0 && v.shine < 1;
          if (on) { n.shineFx.resources.shineUniforms.uniforms.uPos = v.shine; if (!n.filters) n.filters = [n.shineFx]; }
          else if (n.filters) n.filters = null;
        }
        // mesh.follow : la pièce reprend les déformations d'une autre (une
        // surimpression qui doit gonfler et onduler exactement comme le corps)
        if (n.part.mesh) deformMesh(n, n.part.mesh.follow && pose[n.part.mesh.follow] ? { ...v, ...pick(pose[n.part.mesh.follow]) } : v, M);
      }
    }
  }

  /* (13/10/2026) ÉPINGLE SUR LA PEAU : part.epingle = { sur: 'corps', point: [x, y] } (pixels du cadrage). La pièce (et tout ce
     qu'elle porte) suit EXACTEMENT ce point du maillage déformé de « sur », avec la rotation et l'échelle locales de la peau à cet
     endroit : un œil reste posé sur la joue même quand le corps s'étire. Spine n'a pas d'équivalent (il faut tout pondérer à la main). */
  const epingles = parts.filter((p) => p.epingle && byName[p.epingle.sur] && byName[p.epingle.sur].mesh);
  const enfants = {}; for (const p of parts) if (p.parent) (enfants[p.parent] ||= []).push(p.name);
  const descend = (nom, out = []) => { for (const c of enfants[nom] || []) { out.push(c); descend(c, out); } return out; };
  function surPeau(meshName, pt) {
    const n = nodes[meshName], part = byName[meshName], m = n.sprite, pos = m.geometry.positions, rest = n.rest;
    const [gc, gr] = part.mesh.grid || [8, 8], NX = gc + 1, off = n.off;
    const lx = pt[0] - off[0], ly = pt[1] - off[1], cw = (rest[2] - rest[0]) || 1, ch = (rest[NX * 2 + 1] - rest[1]) || 1;
    const ci = Math.max(0, Math.min(gc - 1, Math.floor(lx / cw))), cj = Math.max(0, Math.min(gr - 1, Math.floor(ly / ch)));
    const u = lx / cw - ci, v = ly / ch - cj, I = (j, i) => (j * NX + i) * 2;
    const P = (j, i) => [pos[I(j, i)], pos[I(j, i) + 1]];
    const p00 = P(cj, ci), p10 = P(cj, ci + 1), p01 = P(cj + 1, ci), p11 = P(cj + 1, ci + 1);
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const q = lerp2(lerp2(p00, p10, u), lerp2(p01, p11, u), v);
    const ax = lerp2(lerp2(p00, p10, 0), lerp2(p01, p11, 0), v), bx = lerp2(lerp2(p00, p10, 1), lerp2(p01, p11, 1), v);
    const ay = lerp2(p00, p10, u), by = lerp2(p01, p11, u);
    const ex = [(bx[0] - ax[0]) / cw, (bx[1] - ax[1]) / cw], ey = [(by[0] - ay[0]) / ch, (by[1] - ay[1]) / ch];
    // repère local de la peau (dans l'espace du maillage), puis vers le monde
    const W = worldOf[meshName], mx = m.x, my = m.y;
    const L = [ex[0], ex[1], ey[0], ey[1], q[0] + mx, q[1] + my];
    return mul(W, L);
  }
  function placeEpingles() {
    for (const p of epingles) {
      const n = nodes[p.name], old = worldOf[p.name];
      const S0 = surPeau(p.epingle.sur, p.epingle.point || p.pivot);
      // la pièce garde sa rotation/échelle propres (clés) par-dessus le repère de la peau
      const par = p.parent ? worldOf[p.parent] : null, own = par ? mul(inv(par), old) : old;
      let neu = mul(S0, [own[0], own[1], own[2], own[3], 0, 0]);
      // epingle.mix < 1 : la pièce garde une part de sa propre physique (un visage qui ballotte un peu sur la peau)
      const mx = p.epingle.mix ?? 1; if (mx < 1) neu = neu.map((x, i) => old[i] + (x - old[i]) * mx);
      const D = mul(neu, inv(old));
      for (const nom of [p.name, ...descend(p.name)]) { const M = mul(D, worldOf[nom]); worldOf[nom] = M; nodes[nom].setFromMatrix(new PIXI.Matrix(M[0], M[1], M[2], M[3], M[4], M[5])); }
    }
  }
  function placeAttached() {
    for (const a of attached) {
      const M = worldOf[a.name], n = nodes[a.name];
      const sx = Math.hypot(M[0], M[1]), sy = Math.hypot(M[2], M[3]) * Math.sign(M[0] * M[3] - M[1] * M[2] || 1);
      a.obj.position.set(M[4], M[5]);
      a.obj.rotation = Math.atan2(M[1], M[0]);
      a.obj.scale.set(sx * (a.obj.baseScale ?? 1), sy * (a.obj.baseScale ?? 1));
      a.obj.alpha = n.alpha;
      a.obj.zIndex = (a.z ?? parts.length) + .5;   // par défaut : devant toutes les pièces
    }
  }
  root.update = (dtMs) => {
    const dt = root.paused ? 0 : Math.min(50, dtMs) * root.timeScale;
    clock += dt;
    advance(dt);
    const pose = compose();
    applyPose(pose, dt);
    if (epingles.length) placeEpingles();
    if (attached.length) placeAttached();
    for (const [k, v] of Object.entries(pose)) lastPose[k] = v;
    stepParticles(dt);
  };
  /* Remet les ressorts et le bruit à zéro (rendu image par image reproductible) */
  root.resetPhysics = () => {
    clock = 0;
    for (const n of Object.values(nodes)) {
      if (n.spring) { n.spring.init = false; n.spring.v = 0; }
      if (n.jiggle) { n.jiggle.init = false; n.jiggle.v = [0, 0]; }
      if (n.phys) n.phys.init = false;
    }
  };
  root.pose = () => JSON.parse(JSON.stringify(lastPose));
  root.worldOf = worldOf;
  root.boneWorld = (name) => worldOf[name];
  root.pointOn = pointOn;
  root.update(0);
  return root;
}

/* Liste des images dont un rig a besoin (pièces, séquences, skins, particules). */
export function rigImages(rig) {
  const srcs = new Set();
  for (const p of rig.parts) { if (p.src) srcs.add(p.src); (p.frames || []).forEach((f) => srcs.add(f)); }
  for (const e of Object.values(rig.emitters || {})) if (e.tex && /\.(png|webp)$/.test(e.tex)) srcs.add(e.tex);
  for (const s of Object.values(rig.skins || {})) for (const f of Object.values(s)) srcs.add(f);
  // images posées par des clés « img »
  for (const a of Object.values(rig.anims || {})) for (const tr of Object.values(a.tracks || {})) for (const k of tr) if (typeof k.img === 'string') srcs.add(k.img);
  return [...srcs];
}

/* Fonctions v3 utilisées par un rig (pour savoir si le jeu a besoin du moteur v3). */
export function rigFeatures(rig) {
  const f = new Set();
  for (const p of rig.parts) {
    if (p.shine) f.add('reflet'); if (p.clip) f.add('découpe');
    if (p.seq) f.add('séquence pilotée'); if (p.mesh && p.mesh.ajuste) f.add('maillage ajusté');
    if (p.physique) f.add('physique'); if (p.epingle) f.add('épingle');
    if (p.mesh && (p.mesh.weights === 'os' || p.mesh.peint)) f.add('poids le long des os');
  }
  if ((rig.ik || []).length) f.add('IK');
  for (const c of rig.constraints || []) f.add(c.type === 'transform' ? 'os pilote (transform)' : 'suivre');
  if (rig.skins && Object.keys(rig.skins).length) f.add('skins');
  if (rig.mixes && Object.keys(rig.mixes).length) f.add('mélanges');
  for (const a of Object.values(rig.anims || {})) {
    if (a.contraintes) f.add('os pilote (transform)');
    if (a.physique) f.add('physique');
    if (a.tracks && a.tracks['@symbole']) f.add('teinte du symbole');
  }
  for (const a of Object.values(rig.anims || {})) for (const tr of Object.values(a.tracks || {})) for (const k of tr) {
    if ('seq' in k) f.add('séquence pilotée');
    if ('img' in k) f.add('changement d\'image');
    if ('ffd' in k) f.add('déformation libre');
    if ('shine' in k) f.add('reflet');
    if (k.ease && typeof k.ease === 'object' && !Array.isArray(k.ease)) f.add('courbe par propriété');
  }
  return [...f];
}

/* Charge un rig depuis un dossier (rig.json + images). */
export async function loadRig(PIXI, base, { bust = false } = {}) {
  const rig = await (await fetch(`${base}/rig.json`, { cache: 'no-store' })).json();
  const tex = {};
  const v = bust ? `?v=${Date.now()}` : '';
  await Promise.all(rigImages(rig).map(async (s) => {
    try { tex[s] = await PIXI.Assets.load(`${base}/${s}${v}`); } catch (e) { console.warn('image manquante', s); }
  }));
  return { rig, tex };
}
