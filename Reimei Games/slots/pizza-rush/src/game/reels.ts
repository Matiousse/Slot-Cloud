// Les 5 rouleaux × 4 lignes : bandes floues pendant la rotation, rigs Rig Lab une fois posés.
import { PIXI, makeRig, destroyRig, symbolTexture } from './rigs';
import { EASE, tween, animate } from './tween';
import { REELS, ROWS, SYMBOLS, type SymbolCode } from '../../shared/game';

// les rigs Rig Lab ont leur origine au CENTRE de l'image (640×640) ; les sprites fixes, en haut à gauche
const PIVOT = { x: 320, y: 345 };
const RIG_PIVOT = { x: 0, y: 25 };
const STRIP = 6;
const RANDOM_POOL: SymbolCode[] = ['L5', 'L4', 'L3', 'L2', 'L1', 'L5', 'L4', 'L3', 'L2', 'L1', 'H4', 'H3', 'H2', 'H1', 'WD', 'SC'];
const rnd = () => RANDOM_POOL[(Math.random() * RANDOM_POOL.length) | 0];

interface ReelState {
  strip: any[];
  offset: number;
  speed: number;
  spinning: boolean;
}

export class Reels {
  readonly root = new PIXI.Container();
  private back = new PIXI.Graphics();
  private glow = new PIXI.Graphics();
  private spinLayer = new PIXI.Container();
  private symLayer = new PIXI.Container();
  private mask = new PIXI.Graphics();
  readonly cw: number;
  readonly ch: number;
  private scale: number;
  views: (any | null)[][] = [];
  codes: SymbolCode[][] = [];
  private reels: ReelState[] = [];
  private antic = new Set<number>();
  private t = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cw = w / REELS;
    this.ch = h / ROWS;
    this.scale = (this.ch * 0.98) / 538;
    // fond de la fenêtre : bordeaux sombre (laque rouge et or du cadre), colonnes séparées par des filets dorés
    this.back.roundRect(-6, -6, w + 12, h + 12, 26).fill({ color: 0x2a1016, alpha: 0.93 });
    for (let r = 1; r < REELS; r++) this.back.rect(r * this.cw - 2, 0, 4, h).fill({ color: 0xd9a441, alpha: 0.45 });
    for (let y = 1; y < ROWS; y++) this.back.rect(0, y * this.ch - 1, w, 2).fill({ color: 0x4a1d24, alpha: 0.7 });
    this.mask.rect(0, 0, w, h).fill(0xffffff);
    this.spinLayer.mask = this.mask;
    this.root.addChild(this.back, this.glow, this.spinLayer, this.mask, this.symLayer);
    for (let r = 0; r < REELS; r++) {
      this.views.push(Array(ROWS).fill(null));
      this.codes.push(Array(ROWS).fill('L5'));
      const strip: any[] = [];
      for (let i = 0; i < STRIP; i++) {
        const s = new PIXI.Sprite(symbolTexture(rnd()));
        s.pivot.set(PIVOT.x, PIVOT.y);
        s.scale.set(this.scale);
        s.x = this.cx(r);
        s.visible = false;
        this.spinLayer.addChild(s);
        strip.push(s);
      }
      this.reels.push({ strip, offset: 0, speed: 0, spinning: false });
    }
  }

  cx(r: number) {
    return (r + 0.5) * this.cw;
  }
  cy(y: number) {
    return (y + 0.5) * this.ch;
  }

  private place(sym: any, r: number, y: number) {
    sym.pivot.set(RIG_PIVOT.x, RIG_PIVOT.y);
    sym.scale.set(this.scale);
    sym.x = this.cx(r);
    sym.y = this.cy(y);
  }

  /** Pose une grille immédiatement (au démarrage, reprise d'un tour). */
  setBoard(board: SymbolCode[][]) {
    for (let r = 0; r < REELS; r++)
      for (let y = 0; y < ROWS; y++) {
        if (this.views[r][y]) destroyRig(this.views[r][y]);
        const v = makeRig(board[r][y]);
        this.place(v, r, y);
        v.play('idle', { loop: true });
        v.seek?.(Math.random() * 2000);
        this.symLayer.addChild(v);
        this.views[r][y] = v;
        this.codes[r][y] = board[r][y];
      }
  }

  /** Lance toutes les bandes (les symboles posés partent vers le bas). */
  startSpin(speed = 3.2) {
    this.clearHighlight();
    for (let r = 0; r < REELS; r++) {
      const st = this.reels[r];
      st.offset = 0;
      st.speed = speed * this.ch; // px par 100 ms
      st.spinning = true;
      // les premiers éléments de la bande reprennent les symboles visibles : pas de saut au départ
      st.strip.forEach((s, i) => {
        const y = i - 1;
        s.texture = symbolTexture(y >= 0 && y < ROWS ? this.codes[r][y] : rnd());
        s.visible = true;
        s.alpha = 1;
        s.y = this.cy(y);
      });
      for (let y = 0; y < ROWS; y++) {
        if (this.views[r][y]) destroyRig(this.views[r][y]);
        this.views[r][y] = null;
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    for (let r = 0; r < REELS; r++) {
      const st = this.reels[r];
      if (!st.spinning) continue;
      st.offset += (st.speed * dt) / 100;
      const span = STRIP * this.ch;
      st.strip.forEach((s, i) => {
        const base = (i - 1) * this.ch + st.offset;
        const wrapped = ((base + this.ch) % span) - this.ch;
        if (wrapped < s.y - this.ch * 2) s.texture = symbolTexture(rnd());
        s.y = wrapped + this.ch * 0.5;
        s.scale.y = this.scale * 1.12; // étirement de vitesse
      });
    }
    if (this.antic.size) {
      this.glow.clear();
      const a = 0.25 + 0.2 * Math.sin(this.t / 90);
      for (const r of this.antic) this.glow.roundRect(r * this.cw + 3, 3, this.cw - 6, this.h - 6, 16).fill({ color: 0xffc83a, alpha: a });
    }
  }

  setAnticipation(r: number, on: boolean) {
    if (on) this.antic.add(r);
    else this.antic.delete(r);
    if (!this.antic.size) this.glow.clear();
  }

  /** Arrête un rouleau sur ses 4 symboles : ils arrivent d'en haut, dépassent un peu, se posent (clip « land »). */
  async stopReel(r: number, col: SymbolCode[], fast = false): Promise<void> {
    const st = this.reels[r];
    st.spinning = false;
    const drop = this.ch * 2.2;
    const finals = col.map((code, y) => {
      const v = makeRig(code);
      this.place(v, r, y);
      v.y -= drop;
      v.play('idle', { loop: true });
      this.spinLayer.addChild(v);
      return v;
    });
    st.strip.forEach((s) => (s.scale.y = this.scale));
    const dur = fast ? 140 : 210;
    const objs = [...st.strip, ...finals];
    const from = objs.map((o) => o.y);
    await animate(dur, (k) => {
      const e = EASE.outBack(k);
      objs.forEach((o, i) => (o.y = from[i] + drop * e));
    });
    st.strip.forEach((s) => (s.visible = false));
    finals.forEach((v, y) => {
      this.spinLayer.removeChild(v);
      this.symLayer.addChild(v);
      this.place(v, r, y);
      this.views[r][y] = v;
      this.codes[r][y] = col[y];
      v.play('land', { then: 'idle' }); // le clip commence au contact, puis retour au repos
    });
  }

  /** Remplace une case par un nouveau symbole (wilds du Rush Hour) avec une arrivée. */
  async dropInto(r: number, y: number, code: SymbolCode) {
    const old = this.views[r][y];
    const v = makeRig(code);
    this.place(v, r, y);
    const ty = v.y;
    v.y -= this.ch * 0.9;
    v.alpha = 0;
    v.play('idle', { loop: true });
    this.symLayer.addChild(v);
    await tween(v, { y: ty, alpha: 1 }, 260, EASE.outBack);
    if (old) destroyRig(old);
    this.views[r][y] = v;
    this.codes[r][y] = code;
    v.play('land', { then: 'idle' });
  }

  play(r: number, y: number, clip: string, then = 'idle') {
    const v = this.views[r][y];
    if (v) v.play(clip, { then });
  }

  playLoop(r: number, y: number, clip: string) {
    const v = this.views[r][y];
    if (v) v.play(clip, { loop: true });
  }

  /** Cases gagnantes : les autres s'assombrissent, les gagnantes jouent « win ». */
  highlight(cells: [number, number][]) {
    const set = new Set(cells.map(([r, y]) => r * 10 + y));
    for (let r = 0; r < REELS; r++)
      for (let y = 0; y < ROWS; y++) {
        const v = this.views[r][y];
        if (!v) continue;
        const on = set.has(r * 10 + y);
        tween(v, { alpha: on ? 1 : 0.35 }, 160);
        if (on) {
          this.symLayer.addChild(v); // au-dessus des voisins
          v.play('win', { then: 'idle' });
        }
      }
  }

  clearHighlight() {
    for (const col of this.views) for (const v of col) if (v) v.alpha = 1;
  }

  cellsOf(code: SymbolCode): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) if (this.codes[r][y] === code) out.push([r, y]);
    return out;
  }

  randomBoard(): SymbolCode[][] {
    const regular = SYMBOLS.filter((s) => s !== 'SC' && s !== 'WD');
    return Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => regular[(Math.random() * regular.length) | 0]));
  }
}
