/* SYMBOL-RIG v2 — rig et animation des symboles, fait maison (Vantrel).

   Ce que fait Spine, sans Spine : os hiérarchiques, maillages déformés et
   PONDÉRÉS sur plusieurs os, courbes de Bézier, mélange entre animations,
   pistes superposées, teinte et flash, ordre de dessin animé, séquences
   d'images, événements, ressorts (rotation et position), bruit organique,
   émetteurs de particules. Tout est décrit par un rig.json (voir
   rig-lab/README.md pour le format complet).

   Rendu À PLAT : chaque pièce est un enfant direct du symbole et reçoit sa
   matrice calculée ici. Les parents ne servent qu'au calcul ; l'ordre de
   dessin est donc global (comme Spine) et animable.

   Coordonnées : tout est en pixels DE L'IMAGE COMPLÈTE (size). Les pièces
   partagent le même cadrage, on ne recale rien à la main. */

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

/* ---------- propriétés ---------- */
// défauts ; les « deformers » (bend…) n'agissent que sur les pièces en maillage
export const DEFAULTS = {
  rot: 0, x: 0, y: 0, sx: 1, sy: 1, skx: 0, sky: 0, alpha: 1,
  flash: 0, wig: 1, bend: 0, wave: 0, bulge: 0, bulge2: 0, bulge3: 0, bulge4: 0, taper: 0,
};
const STEPPED = new Set(['frame', 'z', 'visible']);
const ADDITIVE = new Set(['rot', 'x', 'y', 'skx', 'sky', 'flash', 'bend', 'wave', 'bulge', 'bulge2', 'bulge3', 'bulge4', 'taper']);
export const ANIM_PROPS = [...Object.keys(DEFAULTS), 'tint', 'frame', 'z', 'visible'];

const hex = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));
function lerpColor(a, b, e) {
  a = hex(a); b = hex(b);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * e;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * e;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * e;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/* Valeur d'une piste à t (ms), ou undefined si la propriété n'y est pas clée.
   La courbe d'un segment est celle de la clé d'ARRIVÉE (comme Spine). */
export function sampleTrack(track, prop, t) {
  let prev = null;
  for (const k of track) {
    if (!(prop in k)) continue;
    if (k.t >= t) {
      if (!prev) return k[prop];
      if (STEPPED.has(prop) || k.ease === 'step') return k.t === t ? k[prop] : prev[prop];
      const p = Math.max(0, Math.min(1, (t - prev.t) / Math.max(1, k.t - prev.t)));
      const e = easeFn(k.ease)(p);
      if (prop === 'tint') return lerpColor(prev[prop], k[prop], Math.max(0, Math.min(1, e)));
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

/* ======================================================================
   buildSymbol(PIXI, rig, textures) → conteneur avec :
     .play(name, { track=0, mix=rig.mix??120, loop, then, speed })
     .stop(track)            .update(dtMs)           .seek(t, track=0)
     .current(track)         .time(track)            .onEvent = (ev) => {}
     .emit(emitterName, n)   .pose()                 .nodes / .bones
     .paused (bool)          .timeScale (nombre)
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
    byName[part.name] = part;
    nodes[part.name] = node;
    root.addChild(node);
  });

  // matrice de repos d'une pièce (espace du symbole, origine au centre)
  const restLocal = (part) => {
    const par = part.parent ? byName[part.parent] : null;
    return [part.pivot[0] - (par ? par.pivot[0] : W / 2), part.pivot[1] - (par ? par.pivot[1] : H / 2)];
  };
  for (const part of parts) nodes[part.name].base = restLocal(part);
  // ordre de calcul : parents d'abord
  const order = [];
  const seen = new Set();
  const visit = (p) => { if (seen.has(p.name)) return; if (p.parent) visit(byName[p.parent]); seen.add(p.name); order.push(p.name); };
  parts.forEach(visit);

  const worldOf = {}; // matrices courantes
  const restWorld = {};
  for (const name of order) {
    const p = byName[name], n = nodes[name];
    const L = local(n.base[0], n.base[1], 0, 1, 1, 0, 0);
    restWorld[name] = p.parent ? mul(restWorld[p.parent], L) : L;
  }

  // --- pondération des maillages sur plusieurs os ---
  for (const part of parts) {
    const n = nodes[part.name];
    if (!part.mesh || !part.mesh.bones || !n.rest) continue;
    const bones = part.mesh.bones.map((b) => (typeof b === 'string' ? { name: b } : b));
    const invSelf = inv(restWorld[part.name]);
    n.skin = bones.map((b) => ({ ...b, bind: inv(mul(invSelf, restWorld[b.name])) }));
    const nv = n.rest.length / 2;
    n.weights = new Float32Array(nv * bones.length);
    const pw = part.mesh.falloff ?? 2;
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
        spin: rnd(e.spin ?? 0), rot: Math.random() * Math.PI * 2, e,
      };
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
      const a = k < fi ? k / fi : 1 - (k - fi) / (1 - fi);
      q.sp.alpha = q.a0 * Math.max(0, a);
      q.sp.scale.set(q.s0 + (q.s1 - q.s0) * EASE.outQuad(k));
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

  const fullPose = () => { const o = {}; for (const p of parts) o[p.name] = { ...DEFAULTS }; return o; };
  function samplePose(anim, t) {
    const out = {};
    for (const [pname, tr] of Object.entries(anim.tracks || {})) {
      if (!nodes[pname]) continue;
      const o = {};
      for (const k of ANIM_PROPS) { const v = sampleTrack(tr, k, t); if (v !== undefined) o[k] = v; }
      out[pname] = o;
    }
    return out;
  }
  const lastPose = {}; // pose affichée à la frame précédente (pour les fondus)

  root.play = (name, opts = {}) => {
    const a = rig.anims[name];
    if (!a) return;
    const ti = opts.track ?? 0;
    const mix = opts.mix ?? a.mix ?? rig.mix ?? 120;
    tracks[ti] = {
      name, anim: a, t: 0, loop: opts.loop ?? a.loop, speed: opts.speed ?? 1,
      then: opts.then !== undefined ? opts.then : (a.loop || ti > 0 ? null : (rig.anims.idle ? 'idle' : null)),
      mix, mixT: 0, from: ti === 0 ? JSON.parse(JSON.stringify(lastPose)) : null,
      weight: ti > 0 ? (mix > 0 ? 0 : 1) : 1, fired: new Set(), ending: false,
    };
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
  root.clearParticles = () => { for (const q of live) q.sp.destroy(); live.length = 0; };

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
          const target = c[k] !== undefined ? c[k] : (k in DEFAULTS ? DEFAULTS[k] : undefined);
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
          else if (w >= .5) o[k] = v;
        }
      }
    }
    return pose;
  }

  const pick = (o) => ({ bend: o.bend, wave: o.wave, bulge: o.bulge, bulge2: o.bulge2, bulge3: o.bulge3, bulge4: o.bulge4, taper: o.taper });
  function deformMesh(n, v, M) {
    const part = n.part, rest = n.rest, m = n.sprite;
    const pos = m.geometry.positions;
    const [px, py] = part.pivot, [ox, oy] = n.off;
    const L = part.mesh.length || H / 2;
    const dir = part.mesh.dir ?? 1; // +1 : la pièce pend sous son pivot, -1 : elle monte (flamme)
    const hasDef = v.bend || v.wave || v.bulge || v.bulge2 || v.bulge3 || v.bulge4 || v.taper;
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

  function applyPose(pose, dt) {
    const h = dt / 1000;
    for (const name of order) {
      const n = nodes[name], part = n.part, v = pose[name];
      const par = part.parent ? worldOf[part.parent] : null;
      let rot = v.rot, x = v.x, y = v.y;
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
          s.v += (sp.k * d - sp.damp * s.v) * h; s.a += s.v * h;
        }
        let lag = s.a - target; lag = Math.atan2(Math.sin(lag), Math.cos(lag));
        rot += lag * (sp.gain ?? 1);
      }
      const L = local(n.base[0] + x, n.base[1] + y, rot, v.sx, v.sy, v.skx, v.sky);
      let M = par ? mul(par, L) : L;
      // ressort de position : la pièce traîne derrière le mouvement (gelée, chaîne)
      if (n.jiggle) {
        const j = n.jiggle, jp = part.jiggle;
        if (!j.init) { j.p = [M[4], M[5]]; j.init = true; }
        if (h > 0) for (let a = 0; a < 2; a++) { j.v[a] += (jp.k * (M[4 + a] - j.p[a]) - jp.damp * j.v[a]) * h; j.p[a] += j.v[a] * h; }
        const g = jp.gain ?? 1;
        M = [...M]; M[4] += (j.p[0] - M[4]) * g; M[5] += (j.p[1] - M[5]) * g;
      }
      worldOf[name] = M;
    }
    for (const name of order) {
      const n = nodes[name], v = pose[name], M = worldOf[name];
      n.setFromMatrix(new PIXI.Matrix(M[0], M[1], M[2], M[3], M[4], M[5]));
      n.alpha = Math.max(0, Math.min(1, v.alpha));
      n.visible = v.visible !== undefined ? !!v.visible : true;
      n.zIndex = v.z !== undefined ? v.z : n.index;
      if (n.sprite) {
        if (v.tint !== undefined) n.sprite.tint = v.tint;
        else if (n.part.tint == null) n.sprite.tint = 0xffffff;
        if (n.frames) {
          let f = v.frame;
          if (f === undefined && n.part.fps) f = Math.floor(clock / 1000 * n.part.fps);
          f = Math.floor(f || 0) % n.frames.length;
          if (n.sprite.texture !== n.frames[f]) { n.sprite.texture = n.frames[f]; n.flashSp.texture = n.frames[f]; }
        }
        n.flashSp.visible = v.flash > .001;
        n.flashSp.alpha = Math.min(1, v.flash);
        // mesh.follow : la pièce reprend les déformations d'une autre (une
        // surimpression qui doit gonfler et onduler exactement comme le corps)
        if (n.part.mesh) deformMesh(n, n.part.mesh.follow && pose[n.part.mesh.follow] ? { ...v, ...pick(pose[n.part.mesh.follow]) } : v, M);
      }
    }
  }

  root.update = (dtMs) => {
    const dt = root.paused ? 0 : Math.min(50, dtMs) * root.timeScale;
    clock += dt;
    advance(dt);
    const pose = compose();
    applyPose(pose, dt);
    for (const [k, v] of Object.entries(pose)) lastPose[k] = v;
    stepParticles(dt);
  };
  root.pose = () => JSON.parse(JSON.stringify(lastPose));
  root.worldOf = worldOf;
  root.boneWorld = (name) => worldOf[name];
  root.update(0);
  return root;
}

/* Charge un rig depuis un dossier (rig.json + images). */
export async function loadRig(PIXI, base, { bust = false } = {}) {
  const rig = await (await fetch(`${base}/rig.json`, { cache: 'no-store' })).json();
  const srcs = new Set();
  for (const p of rig.parts) { if (p.src) srcs.add(p.src); (p.frames || []).forEach((f) => srcs.add(f)); }
  for (const e of Object.values(rig.emitters || {})) if (e.tex && /\.(png|webp)$/.test(e.tex)) srcs.add(e.tex);
  const tex = {};
  await Promise.all([...srcs].map(async (s) => { tex[s] = await PIXI.Assets.load(`${base}/${s}${bust ? `?v=${Date.now()}` : ''}`); }));
  return { rig, tex };
}
