// The 3D reel board: spinning reels (ported from the proven 2D logic of
// src/render/board.ts), Thunder Wild pillars, win presentation, scatter
// glows and anticipation. Implements Board3D (src/scene/contracts.ts).

import * as THREE from 'three';
import { PAYLINES, REELS, ROWS, SYMBOLS, type LineWin, type SymbolCode } from '../../../shared/game';
import { BASE_REELS, FS_REELS, MULT_BASE, MULT_FS } from '../../../shared/reels';
import { clock, ease } from '../../render/anim';
import type { Board3D, SceneContext, SymbolKit, SymbolState, SymbolView } from '../contracts';
import { PALETTE } from '../materials';
import { warmCoinText } from './coin';
import { Anticipation, Bursts, ReelOverlays, ScatterGlows, windowShade } from './fx';
import { Pillar } from './pillar';
import { SLOTS, SymbolPool } from './pool';
import { WinFx } from './wins';

type Phase = 'idle' | 'windup' | 'spin' | 'stopping' | 'bounce';

/** Cells per second at full speed. */
const SPEED = 24;
const QCAP = 40;
/** Drum radius used to bend the reel strip while it spins. */
const DRUM_R = 6.5;
/** Window half-height (clipping planes). */
const WIN_H = 2.5;

interface Reel {
  index: number;
  locked: boolean;
  codes: SymbolCode[];
  views: SymbolView[];
  states: SymbolState[];
  y: number;
  speed: number;
  phase: Phase;
  t: number;
  queue: SymbolCode[];
  qHead: number;
  qLen: number;
  strip: number[];
  stripPos: number;
  bounceFrom: number;
  anticipate: boolean;
  onStop: (() => void) | null;
  /** board time at which the stop sequence begins (-1 = none pending) */
  beginAt: number;
  pendingBoard: SymbolCode[] | null;
  pendingAnt: boolean;
  curve: number;
  scroll: number;
  /** ms left of the scatter landing "trigger" pulse */
  scTimer: number;
}

interface StormState {
  reel: number;
  row: number;
  mult: number;
  sticky: boolean;
  pillar: Pillar;
}

export class Board implements Board3D {
  readonly object = new THREE.Group();
  readonly reels: Reel[] = [];
  readonly storms = new Map<number, StormState>();
  private pool: SymbolPool;
  private symbols = new THREE.Group();
  private pillars: Pillar[] = [];
  private wins = new WinFx();
  private antic = new Anticipation();
  private scatters = new ScatterGlows();
  private bursts = new Bursts(12);
  private overlays = new ReelOverlays();
  private light = new THREE.PointLight(0x9feaff, 0, 7, 2);
  private lightK = 0;
  private fsReels = false;
  private time = 0;
  private glowAll = false;
  private winCells = new Uint8Array(REELS * ROWS);
  private winsShown = false;
  private tmpV2 = new THREE.Vector2();
  /** frames left of the shader warm-up (everything rendered invisibly once) */
  private warmFrames = 2;

  constructor(
    private ctx: SceneContext,
    kit: SymbolKit,
  ) {
    this.object.name = 'board';
    this.symbols.name = 'symbols';
    kit.setClipping([new THREE.Plane(new THREE.Vector3(0, -1, 0), WIN_H), new THREE.Plane(new THREE.Vector3(0, 1, 0), WIN_H)]);
    this.pool = new SymbolPool(kit, this.symbols);
    this.pool.warmup();
    warmCoinText([...new Set([...MULT_BASE, ...MULT_FS[1], ...MULT_FS[2], ...MULT_FS[3]].map(([m]) => m))]);

    for (let r = 0; r < REELS; r++) {
      const strip = BASE_REELS[r];
      const pos = Math.floor(Math.random() * strip.length);
      const reel: Reel = {
        index: r,
        locked: false,
        codes: [],
        views: [],
        states: [],
        y: 0,
        speed: 0,
        phase: 'idle',
        t: 0,
        queue: new Array<SymbolCode>(QCAP).fill('L5'),
        qHead: 0,
        qLen: 0,
        strip,
        stripPos: pos,
        bounceFrom: 0,
        anticipate: false,
        onStop: null,
        beginAt: -1,
        pendingBoard: null,
        pendingAnt: false,
        curve: 0,
        scroll: 0,
        scTimer: 0,
      };
      for (let i = 0; i < SLOTS; i++) {
        const code = SYMBOLS[strip[(pos + i) % strip.length]];
        reel.codes.push(code);
        reel.views.push(this.pool.acquire(code));
        reel.states.push('idle');
      }
      this.reels.push(reel);
    }
    for (let r = 0; r < REELS; r++) {
      const p = new Pillar(r);
      this.pillars.push(p);
    }

    this.light.position.set(0, 0, 1.4);
    this.object.add(
      this.antic.group,
      this.scatters.group,
      this.symbols,
      this.overlays.group,
      windowShade(),
      ...this.pillars.map((p) => p.group),
      this.wins.group,
      this.bursts.group,
      this.light,
    );
    this.layoutSymbols(0);
  }

  // ------------------------------------------------------------ board state

  useFreeSpinReels(tier: 0 | 1 | 2 | 3) {
    this.fsReels = tier > 0;
    this.reels.forEach((r, i) => {
      r.strip = tier ? FS_REELS[tier][i] : BASE_REELS[i];
      r.stripPos = Math.floor(Math.random() * r.strip.length);
    });
  }

  setBoard(board: SymbolCode[][]) {
    board.forEach((col, r) => {
      const reel = this.reels[r];
      this.setSlot(reel, 0, this.filler(reel));
      for (let y = 0; y < ROWS; y++) this.setSlot(reel, y + 1, col[y]);
      this.setSlot(reel, SLOTS - 1, this.filler(reel));
      reel.y = 0;
      reel.phase = 'idle';
      reel.speed = 0;
      reel.curve = 0;
      reel.qLen = 0;
      for (let i = 0; i < SLOTS; i++) this.applyState(reel, i, 'idle', true);
    });
    this.layoutSymbols(0);
  }

  symbolAt(reel: number, row: number): SymbolCode {
    return this.reels[reel].codes[row + 1];
  }

  private filler(reel: Reel): SymbolCode {
    reel.stripPos = (reel.stripPos - 1 + reel.strip.length) % reel.strip.length;
    let s = SYMBOLS[reel.strip[reel.stripPos]];
    // never spin a Thunder Wild past a locked/expanded view; keep fillers calm
    if (s === 'SW' && this.fsReels) s = 'WD';
    return s;
  }

  private setSlot(reel: Reel, i: number, code: SymbolCode) {
    if (reel.codes[i] === code && reel.views[i]) return;
    this.pool.release(reel.views[i]);
    reel.codes[i] = code;
    reel.views[i] = this.pool.acquire(code);
    reel.states[i] = 'idle';
    reel.views[i].setState('idle');
  }

  /** Scroll one cell: a new symbol enters at the top, the bottom one leaves. */
  private shiftIn(reel: Reel, code: SymbolCode) {
    this.pool.release(reel.views[SLOTS - 1]);
    for (let i = SLOTS - 1; i > 0; i--) {
      reel.codes[i] = reel.codes[i - 1];
      reel.views[i] = reel.views[i - 1];
      reel.states[i] = reel.states[i - 1];
    }
    reel.codes[0] = code;
    reel.views[0] = this.pool.acquire(code);
    reel.states[0] = 'idle';
    reel.views[0].setState('idle');
  }

  private applyState(reel: Reel, i: number, s: SymbolState, force = false) {
    if (!force && reel.states[i] === s) return;
    reel.states[i] = s;
    reel.views[i].setState(s);
  }

  lockReel(reel: number, locked: boolean) {
    this.reels[reel].locked = locked;
  }

  // ------------------------------------------------------------ spinning

  startSpin(turbo: boolean) {
    this.clearWins();
    this.glowAll = false;
    this.scatters.clear();
    this.scatters.boost = 0;
    for (const [reel, st] of this.storms)
      if (!st.sticky) {
        st.pillar.collapse();
        this.storms.delete(reel);
      }
    this.reels.forEach((r, i) => {
      r.scTimer = 0;
      if (r.locked) return;
      r.phase = 'windup';
      r.t = -i * (turbo ? 0.02 : 0.05);
      r.speed = 0;
      r.qLen = 0;
      r.anticipate = false;
      r.beginAt = -1;
      for (let k = 0; k < SLOTS; k++) if (r.states[k] !== 'spin') this.applyState(r, k, 'idle');
    });
  }

  get spinning() {
    return this.reels.some((r) => r.phase !== 'idle');
  }

  stopReels(board: SymbolCode[][], delays: number[], anticipate: boolean[], onReelStop: (i: number) => void): Promise<void> {
    const promises = this.reels.map((reel, i) => {
      if (reel.locked) {
        for (let y = 0; y < ROWS; y++) this.setSlot(reel, y + 1, board[i][y]);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        reel.pendingBoard = board[i];
        reel.pendingAnt = anticipate[i];
        reel.beginAt = this.time + Math.max(0, delays[i]);
        reel.onStop = () => {
          onReelStop(i);
          resolve();
        };
        if (delays[i] <= 0) this.beginStop(reel);
      });
    });
    return Promise.all(promises).then(() => undefined);
  }

  private qPush(r: Reel, c: SymbolCode) {
    r.queue[(r.qHead + r.qLen) % QCAP] = c;
    r.qLen++;
  }

  private qShift(r: Reel): SymbolCode {
    const c = r.queue[r.qHead];
    r.qHead = (r.qHead + 1) % QCAP;
    r.qLen--;
    return c;
  }

  private beginStop(reel: Reel, slam = false) {
    const col = reel.pendingBoard;
    if (!col) return;
    reel.pendingBoard = null;
    reel.beginAt = -1;
    const ant = reel.pendingAnt && !slam;
    reel.anticipate = ant;
    const fillers = slam ? 1 : ant ? 18 : 2 + Math.floor(reel.index * 0.5);
    reel.qHead = 0;
    reel.qLen = 0;
    for (let k = 0; k < fillers; k++) this.qPush(reel, this.filler(reel));
    for (let k = ROWS - 1; k >= 0; k--) this.qPush(reel, col[k]);
    this.qPush(reel, this.filler(reel));
    reel.phase = 'stopping';
    if (slam) reel.speed = Math.max(reel.speed, SPEED * 2.2);
  }

  /** Slam stop: finish every reel as fast as possible. */
  slam() {
    for (const r of this.reels) {
      if (r.pendingBoard) this.beginStop(r, true);
      else if (r.phase === 'stopping') {
        while (r.qLen > ROWS + 1) this.qShift(r);
        r.speed = SPEED * 2.5;
        r.anticipate = false;
      }
    }
  }

  private updateReels(dt: number) {
    const sec = dt / 1000;
    for (const r of this.reels) {
      if (r.beginAt >= 0 && this.time >= r.beginAt) this.beginStop(r);
      switch (r.phase) {
        case 'windup':
          r.t += sec;
          if (r.t < 0) break;
          r.y = -0.18 * Math.sin(Math.min(1, r.t / 0.14) * Math.PI);
          if (r.t >= 0.14) {
            r.phase = 'spin';
            r.speed = SPEED * 0.4;
            r.y = 0;
          }
          break;
        case 'spin':
        case 'stopping': {
          const target = r.anticipate ? SPEED * 0.7 : SPEED;
          r.speed += (target - r.speed) * Math.min(1, sec * 8);
          const d = r.speed * sec;
          r.y += d;
          r.scroll += d;
          while (r.y >= 1) {
            r.y -= 1;
            const next = r.phase === 'stopping' && r.qLen > 0 ? this.qShift(r) : this.filler(r);
            this.shiftIn(r, next);
            if (r.phase === 'stopping' && r.qLen === 0) {
              r.phase = 'bounce';
              r.t = 0;
              r.bounceFrom = Math.min(0.35, r.y) + 0.12;
              r.anticipate = false;
              this.onLanded(r);
              break;
            }
          }
          break;
        }
        case 'bounce': {
          r.t += sec;
          const k = Math.min(1, r.t / 0.22);
          r.y = r.bounceFrom * (1 - ease.outBack(k));
          if (k >= 1) {
            r.y = 0;
            r.phase = 'idle';
          }
          break;
        }
      }
      if (r.scTimer > 0) {
        r.scTimer -= dt;
        if (r.scTimer <= 0) for (let i = 1; i <= ROWS; i++) if (r.codes[i] === 'SC' && r.states[i] === 'trigger' && !this.glowAll && !this.winsShown) this.applyState(r, i, 'idle');
      }
    }
  }

  private onLanded(r: Reel) {
    r.curve = Math.min(r.curve, 0.15);
    r.speed = 0;
    for (let i = 0; i < SLOTS; i++) this.applyState(r, i, i >= 1 && i <= ROWS ? 'land' : 'idle', true);
    this.overlays.stopImpact(r.index);
    const cb = r.onStop;
    r.onStop = null;
    cb?.();
  }

  // ------------------------------------------------------------ storm wilds

  async expandStorm(reel: number, row: number, mult: number, sticky: boolean) {
    const p = this.pillars[reel];
    const st: StormState = { reel, row: row < 0 ? 2 : row, mult, sticky, pillar: p };
    this.storms.set(reel, st);
    p.begin(row, mult, sticky);
    const y = 2 - st.row;
    this.bursts.emit(reel - 2, y, 0.36, PALETTE.lightning, 1.0, 380);
    this.flashLight(reel - 2, y, 1);
    this.ctx.shake(0.22);
    await clock.tween(320, (k) => p.setGrow(k), ease.outCubic);
    p.setGrow(1);
    await clock.tween(380, (k) => p.setCoin(k), ease.outBack);
    p.coinSettled();
    this.bursts.emit(reel - 2, -1.79, 0.46, 0xffc93c, 0.7, 320);
  }

  setStorm(reel: number, mult: number, sticky: boolean) {
    const p = this.pillars[reel];
    this.storms.set(reel, { reel, row: 2, mult, sticky, pillar: p });
    p.showInstant(mult, sticky);
  }

  clearStorms() {
    for (const st of this.storms.values()) st.pillar.collapse();
    this.storms.clear();
    this.reels.forEach((r) => (r.locked = false));
  }

  private flashLight(x: number, y: number, k: number) {
    this.light.position.set(x, y, 1.3);
    this.lightK = Math.max(this.lightK, k);
  }

  // ------------------------------------------------------------ wins

  showWins(wins: LineWin[], label?: string) {
    this.winsShown = true;
    this.winCells.fill(0);
    for (const [line, , count] of wins) for (let r = 0; r < count; r++) this.winCells[r * ROWS + PAYLINES[line][r]] = 1;
    for (let r = 0; r < REELS; r++) {
      const reel = this.reels[r];
      let reelWins = false;
      for (let y = 0; y < ROWS; y++) {
        const on = this.winCells[r * ROWS + y] === 1;
        if (on) reelWins = true;
        if (on) this.applyState(reel, y + 1, 'win', true);
        else this.applyState(reel, y + 1, 'dim');
      }
      this.storms.get(r)?.pillar.setWin(reelWins);
    }
    const withLines = wins.length <= 4 || !!label;
    this.wins.show(wins, withLines, label, (r) => this.storms.has(r));
    // a soft gold light pop on the board
    if (wins.length) {
      const [line, , count] = wins[0];
      this.flashLight(count - 1 - 2, 2 - PAYLINES[line][count - 1], 0.35);
    }
  }

  clearWins() {
    if (!this.winsShown) return;
    this.winsShown = false;
    this.wins.hide();
    for (const st of this.storms.values()) st.pillar.setWin(false);
    for (const reel of this.reels)
      for (let y = 1; y <= ROWS; y++) {
        const sc = reel.codes[y] === 'SC' && (this.glowAll || this.scatters.isOn(reel.index, y - 1));
        if (reel.states[y] === 'spin') continue;
        this.applyState(reel, y, sc && this.glowAll ? 'trigger' : 'idle');
      }
  }

  glowScatters(on: boolean) {
    this.glowAll = on;
    this.scatters.clear();
    this.scatters.boost = on ? 1 : 0;
    for (const reel of this.reels)
      for (let y = 0; y < ROWS; y++)
        if (reel.codes[y + 1] === 'SC') {
          this.scatters.set(reel.index, y, on);
          if (!this.winsShown || on) this.applyState(reel, y + 1, on ? 'trigger' : 'idle', on);
          if (on) this.bursts.emit(reel.index - 2, 2 - y, 0.34, 0xffb02e, 0.9, 520);
        }
  }

  scatterLanded(reel: number) {
    const r = this.reels[reel];
    for (let y = 0; y < ROWS; y++)
      if (r.codes[y + 1] === 'SC') {
        this.applyState(r, y + 1, 'trigger', true);
        r.scTimer = 1100;
        this.scatters.set(reel, y, true);
        this.bursts.emit(reel - 2, 2 - y, 0.34, 0xff5a3c, 0.95, 420);
        this.flashLight(reel - 2, 2 - y, 0.45);
      }
  }

  cellWorld(reel: number, row: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(reel - 2, 2 - row, 0);
    this.object.updateWorldMatrix(true, false);
    return this.object.localToWorld(out);
  }

  // ------------------------------------------------------------ frame

  private layoutSymbols(dt: number) {
    for (const r of this.reels) {
      const moving = r.phase === 'spin' || r.phase === 'stopping';
      const fast = moving && r.speed > SPEED * 0.5;
      // bend the strip into a drum while spinning, flat when settling
      const want = moving && !(r.phase === 'stopping' && r.qLen <= ROWS + 1) ? 1 : 0;
      r.curve += (want - r.curve) * Math.min(1, dt / (want ? 120 : 70));
      if (r.curve < 0.001) r.curve = 0;
      const k = r.curve;
      const x = r.index - 2;
      const pillar = this.storms.has(r.index) ? this.pillars[r.index] : null;
      for (let i = 0; i < SLOTS; i++) {
        const v = r.views[i];
        const s = 3 - i - r.y;
        let y = s, z = 0, rx = 0;
        if (k > 0) {
          const th = s / DRUM_R;
          y = s + (DRUM_R * Math.sin(th) - s) * k;
          z = (DRUM_R * Math.cos(th) - DRUM_R) * k;
          rx = -th * k;
        }
        const o = v.object;
        o.position.set(x, y, z);
        o.rotation.x = rx;
        const inWindow = y < WIN_H + 0.5 && y > -WIN_H - 0.5;
        o.visible = inWindow && !(pillar && pillar.covers(y));
        if (fast && r.states[i] !== 'spin') this.applyState(r, i, 'spin');
        else if (!fast && r.states[i] === 'spin') this.applyState(r, i, 'idle');
      }
    }
  }

  update(dt: number, t: number) {
    this.time += dt;
    this.updateReels(dt);
    this.layoutSymbols(dt);
    for (const r of this.reels) {
      for (let i = 0; i < SLOTS; i++) if (r.views[i].object.visible) r.views[i].update(dt, t);
      const moving = r.phase === 'spin' || r.phase === 'stopping';
      this.overlays.set(r.index, moving ? Math.min(1, r.speed / SPEED) : 0, r.scroll, dt);
      this.antic.set(r.index, r.anticipate && moving);
    }
    this.ctx.renderer.getDrawingBufferSize(this.tmpV2);
    const pointScale = (this.tmpV2.y * this.ctx.camera.projectionMatrix.elements[5]) / 2;
    for (const p of this.pillars) p.update(dt, t, pointScale);
    this.wins.update(dt);
    this.antic.update(dt);
    this.scatters.update(dt);
    this.bursts.update(dt);
    this.lightK = Math.max(0, this.lightK - dt / 420);
    this.light.intensity = this.lightK * this.lightK * 6;
    if (this.warmFrames > 0) this.warm(--this.warmFrames > 0);
  }

  private warm(on: boolean) {
    for (const p of this.pillars) p.warm(on);
    this.wins.warm(on);
    this.antic.warm(on);
    this.scatters.warm(on);
    this.bursts.warm(on);
    this.overlays.warm(on);
    this.pool.warmShow(on);
  }

  /** Debug: number of SymbolViews created after warmup (should stay 0). */
  get lateCreates() {
    return this.pool.lateCreates;
  }
}
