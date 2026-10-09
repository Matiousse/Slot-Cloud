// The 5x5 board: spinning reels, Storm Wild columns, win highlights, particles.

import { PAYLINES, REELS, ROWS, SYMBOLS, type LineWin, type SymbolCode } from '../../shared/game';
import { BASE_REELS, FS_REELS } from '../../shared/reels';
import { clock, ease } from './anim';
import {
  blurVertical,
  makeCanvas,
  outlinedText,
  renderMultBadge,
  renderScatterBanner,
  renderStormColumn,
  renderSymbol,
} from './art';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Phase = 'idle' | 'windup' | 'spin' | 'stopping' | 'bounce';

interface Reel {
  list: SymbolCode[]; // ROWS + 2 entries: [above, row0..row4, below]
  y: number; // scroll offset in cells
  speed: number;
  phase: Phase;
  t: number;
  queue: SymbolCode[];
  strip: number[];
  stripPos: number;
  bounceFrom: number;
  anticipate: boolean;
  locked: boolean; // sticky Storm Wild: does not spin
  onStop?: () => void;
}

interface Storm {
  reel: number;
  row: number;
  mult: number;
  grow: number; // 0..1 expansion
  badge: number; // 0..1 badge scale-in
  sticky: boolean;
  flash: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: 'spark' | 'coin' | 'star';
  color: string;
  rot: number;
  vr: number;
}

const LINE_COLORS = ['#ffe14d', '#4cf2ff', '#ff6be6', '#7dff8a', '#ffa64d', '#b88cff', '#ff5470', '#5ab8ff'];
const SPEED = 24; // cells per second

export class Board {
  rect: Rect = { x: 0, y: 0, w: 100, h: 100 };
  cell = 20;
  private dpr = 1;
  private sprites = new Map<string, HTMLCanvasElement>();
  private blurred = new Map<string, HTMLCanvasElement>();
  private scatterBanner: HTMLCanvasElement | null = null;
  private column: HTMLCanvasElement | null = null;
  private badges = new Map<number, HTMLCanvasElement>();
  private frame: HTMLCanvasElement | null = null;
  reels: Reel[] = [];
  storms = new Map<number, Storm>();
  private highlight: { cells: Set<number>; lines: { line: number; count: number; color: string }[]; label?: { text: string; x: number; y: number }; t0: number } | null = null;
  private scatterGlow = new Set<number>();
  private particles: Particle[] = [];
  private strikes: { pts: [number, number][]; life: number }[] = [];
  private shakeAmp = 0;
  private boardFlash = 0;
  private fsReels = false;
  time = 0;

  constructor() {
    for (let r = 0; r < REELS; r++) {
      const strip = BASE_REELS[r];
      const pos = Math.floor(Math.random() * strip.length);
      const list: SymbolCode[] = [];
      for (let i = 0; i < ROWS + 2; i++) list.push(SYMBOLS[strip[(pos + i) % strip.length]]);
      this.reels.push({
        list,
        y: 0,
        speed: 0,
        phase: 'idle',
        t: 0,
        queue: [],
        strip,
        stripPos: pos,
        bounceFrom: 0,
        anticipate: false,
        locked: false,
      });
    }
  }

  layout(rect: Rect, dpr: number) {
    const changed = rect.w !== this.rect.w || dpr !== this.dpr;
    this.rect = rect;
    this.cell = rect.w / REELS;
    this.dpr = dpr;
    if (changed || !this.sprites.size) this.buildSprites();
  }

  private buildSprites() {
    const px = Math.round(this.cell * 0.96 * this.dpr);
    this.sprites.clear();
    this.blurred.clear();
    for (const code of SYMBOLS) {
      const s = renderSymbol(code, px);
      this.sprites.set(code, s);
      this.blurred.set(code, blurVertical(s, px * 0.18));
    }
    this.scatterBanner = renderScatterBanner(px);
    this.column = renderStormColumn(this.cell * this.dpr, this.rect.h * this.dpr);
    this.badges.clear();
    this.frame = this.renderFrame();
  }

  private badge(mult: number) {
    let b = this.badges.get(mult);
    if (!b) {
      b = renderMultBadge(mult, Math.round(this.cell * 0.9 * this.dpr));
      this.badges.set(mult, b);
    }
    return b;
  }

  private renderFrame(): HTMLCanvasElement {
    const pad = this.cell * 0.5;
    const { w, h } = this.rect;
    const [c, ctx] = makeCanvas((w + pad * 2) * this.dpr, (h + pad * 2) * this.dpr);
    ctx.scale(this.dpr, this.dpr);
    const r = this.cell * 0.22;
    const body = new Path2D();
    body.roundRect(pad - 8, pad - 8, w + 16, h + 16, r);
    ctx.save();
    ctx.shadowColor = 'rgba(255,90,230,0.85)';
    ctx.shadowBlur = this.cell * 0.45;
    ctx.lineWidth = 5;
    const g = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
    g.addColorStop(0, '#7ff3ff');
    g.addColorStop(0.5, '#b07bff');
    g.addColorStop(1, '#ff6be6');
    ctx.strokeStyle = g;
    ctx.stroke(body);
    ctx.restore();
    ctx.fillStyle = 'rgba(8,4,26,0.78)';
    ctx.fill(body);
    // column separators
    ctx.strokeStyle = 'rgba(160,140,255,0.13)';
    ctx.lineWidth = 1;
    for (let i = 1; i < REELS; i++) {
      const x = pad + i * this.cell;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + h);
      ctx.stroke();
    }
    // inner glass sheen
    const sheen = ctx.createLinearGradient(0, pad, 0, pad + h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill(body);
    return c;
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
      reel.list = [this.filler(reel), ...col, this.filler(reel)];
      reel.y = 0;
      reel.phase = 'idle';
    });
  }

  symbolAt(reel: number, row: number): SymbolCode {
    return this.reels[reel].list[row + 1];
  }

  private filler(reel: Reel): SymbolCode {
    reel.stripPos = (reel.stripPos - 1 + reel.strip.length) % reel.strip.length;
    let s = SYMBOLS[reel.strip[reel.stripPos]];
    // never spin a Storm Wild past a locked/expanded view; keep fillers calm
    if (s === 'SW' && this.fsReels) s = 'WD';
    return s;
  }

  lockReel(reel: number, locked: boolean) {
    this.reels[reel].locked = locked;
  }

  // ------------------------------------------------------------ spinning

  startSpin(turbo: boolean) {
    this.highlight = null;
    this.scatterGlow.clear();
    for (const [reel, st] of this.storms) if (!st.sticky) this.storms.delete(reel);
    this.reels.forEach((r, i) => {
      if (r.locked) return;
      r.phase = 'windup';
      r.t = -i * (turbo ? 0.02 : 0.05);
      r.speed = 0;
      r.queue = [];
      r.anticipate = false;
    });
  }

  get spinning() {
    return this.reels.some((r) => r.phase !== 'idle');
  }

  /**
   * Stop the reels on `board`. `delays[i]` = ms before reel i starts its stop
   * sequence; `anticipate[i]` adds suspense to that reel.
   */
  stopReels(board: SymbolCode[][], delays: number[], anticipate: boolean[], onReelStop: (i: number) => void): Promise<void> {
    const promises = this.reels.map((reel, i) => {
      if (reel.locked) {
        reel.list = [reel.list[0], ...board[i], reel.list[ROWS + 1]];
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const begin = () => {
          reel.anticipate = anticipate[i];
          const fillers = anticipate[i] ? 18 : 2 + Math.floor(i * 0.5);
          const q: SymbolCode[] = [];
          for (let k = 0; k < fillers; k++) q.push(this.filler(reel));
          for (let k = ROWS - 1; k >= 0; k--) q.push(board[i][k]);
          q.push(this.filler(reel));
          reel.queue = q;
          reel.phase = 'stopping';
          reel.onStop = () => {
            onReelStop(i);
            resolve();
          };
        };
        clock.wait(delays[i]).then(begin);
      });
    });
    return Promise.all(promises).then(() => undefined);
  }

  /** Slam stop: finish every reel as fast as possible. */
  slam() {
    for (const r of this.reels) {
      if (r.phase === 'stopping') {
        r.queue = r.queue.slice(Math.max(0, r.queue.length - ROWS - 1));
        r.speed = SPEED * 2.5;
      }
    }
  }

  private updateReels(dt: number) {
    const sec = dt / 1000;
    for (const r of this.reels) {
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
          r.y += r.speed * sec;
          while (r.y >= 1) {
            r.y -= 1;
            const next = r.phase === 'stopping' && r.queue.length ? r.queue.shift()! : this.filler(r);
            r.list.unshift(next);
            r.list.pop();
            if (r.phase === 'stopping' && r.queue.length === 0) {
              r.phase = 'bounce';
              r.t = 0;
              r.bounceFrom = Math.min(0.35, r.y) + 0.12;
              r.anticipate = false;
              r.onStop?.();
              r.onStop = undefined;
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
    }
  }

  // ------------------------------------------------------------ storm wilds

  /** Lightning strike + expansion of a Storm Wild on `reel`. */
  async expandStorm(reel: number, row: number, mult: number, sticky: boolean) {
    const { x, y } = this.rect;
    const cx = x + (reel + 0.5) * this.cell;
    const cy = y + (Math.max(0, row) + 0.5) * this.cell;
    // jagged bolt from the top of the screen
    const pts: [number, number][] = [];
    let px = cx + (Math.random() - 0.5) * this.cell * 2;
    for (let py = -20; py < cy; py += this.cell * 0.35) {
      pts.push([px, py]);
      px += (cx - px) * 0.35 + (Math.random() - 0.5) * this.cell * 0.5;
    }
    pts.push([cx, cy]);
    this.strikes.push({ pts, life: 0 });
    this.boardFlash = 1;
    this.shake(0.6);
    this.burst(cx, cy, 26, '#bff8ff', 'spark');
    const st: Storm = { reel, row: row < 0 ? 2 : row, mult, grow: row < 0 ? 0 : 0, badge: 0, sticky, flash: 1 };
    this.storms.set(reel, st);
    await clock.tween(320, (t) => (st.grow = t), ease.outCubic);
    await clock.tween(380, (t) => (st.badge = t), ease.outBack);
  }

  /** Show existing (sticky) Storm Wilds instantly. */
  setStorm(reel: number, mult: number, sticky: boolean) {
    this.storms.set(reel, { reel, row: 2, mult, grow: 1, badge: 1, sticky, flash: 0 });
  }

  clearStorms() {
    this.storms.clear();
    this.reels.forEach((r) => (r.locked = false));
  }

  // ------------------------------------------------------------ wins

  cellCenter(reel: number, row: number): [number, number] {
    return [this.rect.x + (reel + 0.5) * this.cell, this.rect.y + (row + 0.5) * this.cell];
  }

  showWins(wins: LineWin[], label?: string) {
    const cells = new Set<number>();
    const lines = wins.map(([line, , count], i) => {
      for (let r = 0; r < count; r++) cells.add(r * ROWS + PAYLINES[line][r]);
      return { line, count, color: LINE_COLORS[i % LINE_COLORS.length] };
    });
    let lab: { text: string; x: number; y: number } | undefined;
    if (label && wins.length === 1) {
      const [line, , count] = wins[0];
      const [lx, ly] = this.cellCenter(count - 1, PAYLINES[line][count - 1]);
      lab = { text: label, x: lx, y: ly };
    }
    this.highlight = { cells, lines, label: lab, t0: this.time };
    for (const c of cells) {
      if (Math.random() < 0.5) {
        const [px, py] = this.cellCenter(Math.floor(c / ROWS), c % ROWS);
        this.burst(px, py, 4, '#ffe9a0', 'star');
      }
    }
  }

  clearWins() {
    this.highlight = null;
  }

  glowScatters(on: boolean) {
    this.scatterGlow.clear();
    if (!on) return;
    for (let r = 0; r < REELS; r++)
      for (let y = 0; y < ROWS; y++) if (this.symbolAt(r, y) === 'SC') this.scatterGlow.add(r * ROWS + y);
  }

  /** Little pop when a scatter lands. */
  scatterLanded(reel: number) {
    for (let y = 0; y < ROWS; y++)
      if (this.symbolAt(reel, y) === 'SC') {
        const [px, py] = this.cellCenter(reel, y);
        this.burst(px, py, 16, '#ff9af0', 'spark');
        this.scatterGlow.add(reel * ROWS + y);
      }
  }

  // ------------------------------------------------------------ particles

  burst(x: number, y: number, n: number, color: string, kind: Particle['kind']) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.15 + Math.random() * 0.55) * this.cell * (kind === 'spark' ? 6 : 3);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (kind === 'star' ? this.cell : 0),
        life: 0,
        max: 450 + Math.random() * 500,
        size: this.cell * (kind === 'spark' ? 0.05 : 0.09) * (0.6 + Math.random()),
        kind,
        color,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  coinShower(n: number, w: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: w * (0.1 + Math.random() * 0.8),
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 60,
        vy: 150 + Math.random() * 250,
        life: 0,
        max: 2600 + Math.random() * 1400,
        size: this.cell * (0.12 + Math.random() * 0.08),
        kind: 'coin',
        color: '#ffd84a',
        rot: Math.random() * 6,
        vr: 3 + Math.random() * 6,
      });
    }
  }

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  // ------------------------------------------------------------ frame

  update(dt: number) {
    this.time += dt;
    this.updateReels(dt);
    const sec = dt / 1000;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.vy += (p.kind === 'coin' ? 300 : 500) * sec;
      p.vx *= 1 - sec * (p.kind === 'coin' ? 0.2 : 1.5);
      p.rot += p.vr * sec;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const s of this.strikes) s.life += dt;
    this.strikes = this.strikes.filter((s) => s.life < 420);
    this.shakeAmp = Math.max(0, this.shakeAmp - sec * 2.2);
    this.boardFlash = Math.max(0, this.boardFlash - sec * 3);
    for (const st of this.storms.values()) st.flash = Math.max(0, st.flash - sec * 2);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { x, y, w, h } = this.rect;
    const C = this.cell;
    const sx = (Math.random() - 0.5) * this.shakeAmp * C * 0.25;
    const sy = (Math.random() - 0.5) * this.shakeAmp * C * 0.25;
    ctx.save();
    ctx.translate(sx, sy);

    if (this.frame) {
      const pad = C * 0.5;
      ctx.drawImage(this.frame, x - pad, y - pad, w + pad * 2, h + pad * 2);
    }

    // anticipation glow behind reels
    this.reels.forEach((r, i) => {
      if (!r.anticipate) return;
      const pulse = 0.55 + 0.45 * Math.sin(this.time / 90);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, `rgba(255,90,230,${0.35 * pulse})`);
      g.addColorStop(0.5, `rgba(120,230,255,${0.25 * pulse})`);
      g.addColorStop(1, `rgba(255,90,230,${0.35 * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + i * C, y, C, h);
      ctx.restore();
    });

    // symbols
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const hl = this.highlight;
    const pulse = hl ? 1 + 0.07 * Math.sin((this.time - hl.t0) / 110) : 1;
    const size = C * 0.96;
    for (let r = 0; r < REELS; r++) {
      const reel = this.reels[r];
      const storm = this.storms.get(r);
      if (storm && storm.grow >= 1) continue; // fully covered
      const moving = reel.phase === 'spin' || reel.phase === 'stopping';
      const fast = moving && reel.speed > SPEED * 0.5;
      for (let i = 0; i < reel.list.length; i++) {
        const code = reel.list[i];
        const cy = y + (i - 1 + reel.y) * C;
        if (cy > y + h || cy + C < y) continue;
        const row = i - 1;
        const idx = r * ROWS + row;
        const isHl = !!hl && hl.cells.has(idx) && reel.phase === 'idle';
        const cx = x + r * C;
        const spr = fast ? this.blurred.get(code)! : this.sprites.get(code)!;
        let scale = isHl ? pulse : 1;
        if (code === 'SC' && this.scatterGlow.has(idx) && !moving) scale *= 1 + 0.06 * Math.sin(this.time / 120);
        const s = size * scale;
        const ox = cx + (C - s) / 2;
        const oy = cy + (C - s) / 2;
        if (fast) {
          const extra = (spr.height / spr.width - 1) * s;
          ctx.drawImage(spr, ox, oy - extra / 2, s, s + extra);
        } else if (code === 'SC') {
          if (this.scatterGlow.has(idx)) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(cx + C / 2, cy + C / 2, 0, cx + C / 2, cy + C / 2, C * 0.7);
            g.addColorStop(0, 'rgba(255,120,240,0.55)');
            g.addColorStop(1, 'rgba(255,120,240,0)');
            ctx.fillStyle = g;
            ctx.fillRect(cx - C * 0.2, cy - C * 0.2, C * 1.4, C * 1.4);
            ctx.restore();
          }
          // rotating vortex + fixed banner
          ctx.save();
          ctx.translate(ox + s * 0.5, oy + s * 0.46);
          ctx.rotate(this.time / (this.scatterGlow.has(idx) ? 300 : 1400));
          ctx.drawImage(spr, -s * 0.5, -s * 0.46, s, s);
          ctx.restore();
          if (this.scatterBanner) ctx.drawImage(this.scatterBanner, ox, oy, s, s);
        } else {
          ctx.drawImage(spr, ox, oy, s, s);
        }
        if (hl && !isHl && reel.phase === 'idle') {
          ctx.fillStyle = 'rgba(6,2,20,0.55)';
          ctx.fillRect(cx, cy, C, C);
        }
      }
    }
    ctx.restore();

    // storm wild columns
    for (const st of this.storms.values()) this.drawStorm(ctx, st);

    // win frames + lines (lines only when readable), then multiplier badges on top
    if (hl) this.drawLines(ctx, hl);
    for (const st of this.storms.values()) this.drawBadge(ctx, st);

    // strikes
    for (const s of this.strikes) {
      const a = 1 - s.life / 420;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (const [lw, col] of [
        [C * 0.28, `rgba(120,200,255,${0.25 * a})`],
        [C * 0.1, `rgba(200,245,255,${0.8 * a})`],
        [C * 0.035, `rgba(255,255,255,${a})`],
      ] as const) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = col;
        ctx.beginPath();
        s.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.boardFlash > 0) {
      ctx.fillStyle = `rgba(200,240,255,${this.boardFlash * 0.25})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    this.drawParticles(ctx);
  }

  private drawStorm(ctx: CanvasRenderingContext2D, st: Storm) {
    const { x, y, h } = this.rect;
    const C = this.cell;
    const cx = x + st.reel * C;
    const rowTop = y + st.row * C;
    const top = rowTop + (y - rowTop) * st.grow;
    const bottom = rowTop + C + (y + h - rowTop - C) * st.grow;
    if (this.column) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, top, C, bottom - top);
      ctx.clip();
      ctx.drawImage(this.column, cx, y, C, h);
      // living electricity
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(170,240,255,${0.35 + 0.25 * Math.sin(this.time / 70 + st.reel)})`;
      ctx.lineWidth = Math.max(1.5, C * 0.03);
      ctx.beginPath();
      let px = cx + C / 2;
      const seed = Math.floor(this.time / 90) + st.reel * 7;
      for (let i = 0, py = y; py <= y + h; i++, py += C * 0.25) {
        const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
        px = cx + C / 2 + (n - Math.floor(n) - 0.5) * C * 0.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (st.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.6})`;
        ctx.fillRect(cx, top, C, bottom - top);
      }
      ctx.restore();
    }
    // highlight when part of a win
    if (this.highlight && [...this.highlight.cells].some((c) => Math.floor(c / ROWS) === st.reel)) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,230,120,${0.6 + 0.4 * Math.sin(this.time / 110)})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd84a';
      ctx.shadowBlur = 14;
      ctx.strokeRect(cx + 2, y + 2, C - 4, h - 4);
      ctx.restore();
    }
  }

  private drawBadge(ctx: CanvasRenderingContext2D, st: Storm) {
    const { x, y, h } = this.rect;
    const C = this.cell;
    const cx = x + st.reel * C;
    if (st.badge > 0) {
      const b = this.badge(st.mult);
      const s = C * 0.9 * st.badge * (1 + 0.05 * Math.sin(this.time / 160 + st.reel));
      const by = y + h * 0.66;
      ctx.drawImage(b, cx + (C - s) / 2, by - s / 2, s, s);
      if (st.sticky) {
        outlinedText(ctx, '★', cx + C * 0.82, y + h - C * 0.22, C * 0.24, '#ffe14d', { inkWidth: C * 0.04 });
      }
    }
  }

  private drawLines(ctx: CanvasRenderingContext2D, hl: NonNullable<Board['highlight']>) {
    const C = this.cell;
    const appear = Math.min(1, (this.time - hl.t0) / 250);
    // neon frames around winning symbols (storm columns have their own frame)
    ctx.save();
    ctx.globalAlpha = appear * (0.75 + 0.25 * Math.sin((this.time - hl.t0) / 120));
    ctx.lineWidth = Math.max(2, C * 0.035);
    ctx.strokeStyle = '#ffe680';
    ctx.shadowColor = '#ffb800';
    ctx.shadowBlur = C * 0.18;
    for (const c of hl.cells) {
      const reel = Math.floor(c / ROWS);
      if (this.storms.get(reel)?.grow === 1) continue;
      const row = c % ROWS;
      const p = new Path2D();
      p.roundRect(this.rect.x + reel * C + C * 0.06, this.rect.y + row * C + C * 0.06, C * 0.88, C * 0.88, C * 0.14);
      ctx.stroke(p);
    }
    ctx.restore();
    if (hl.lines.length > 4 && !hl.label) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const { line, color } of hl.lines) {
      const pts = PAYLINES[line].map((row, reel) => this.cellCenter(reel, row));
      const first = [this.rect.x - C * 0.15, pts[0][1]] as [number, number];
      const last = [this.rect.x + this.rect.w + C * 0.15, pts[4][1]] as [number, number];
      const all = [first, ...pts, last];
      ctx.globalAlpha = appear;
      ctx.shadowColor = color;
      ctx.shadowBlur = C * 0.25;
      ctx.lineWidth = C * 0.09;
      ctx.strokeStyle = 'rgba(10,4,30,0.85)';
      ctx.beginPath();
      all.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.lineWidth = C * 0.05;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
    if (hl.label) {
      const { text, x, y } = hl.label;
      outlinedText(ctx, text, x, y + C * 0.32, C * 0.3, '#ffffff', { inkWidth: C * 0.07, glow: '#ffd84a' });
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    if (!this.particles.length) return;
    ctx.save();
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      if (p.kind === 'coin') {
        ctx.globalAlpha = Math.min(1, a * 3);
        ctx.save();
        ctx.translate(p.x, p.y);
        const sx = Math.abs(Math.cos(p.rot));
        ctx.scale(Math.max(0.15, sx), 1);
        const g = ctx.createRadialGradient(-p.size * 0.3, -p.size * 0.3, 1, 0, 0, p.size);
        g.addColorStop(0, '#fffbe0');
        g.addColorStop(0.5, '#ffcc33');
        g.addColorStop(1, '#a35a00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7a3d00';
        ctx.lineWidth = p.size * 0.15;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.kind === 'star') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            ctx.rotate(Math.PI / 2);
            ctx.lineTo(0, -p.size * 1.6);
            ctx.lineTo(p.size * 0.4, -p.size * 0.4);
          }
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }
}
