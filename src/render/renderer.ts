// Canvas orchestrator: responsive layout, render loop, background + board.

import { clock } from './anim';
import { renderLogo } from './art';
import { Background } from './background';
import { Board, type Rect } from './board';

export interface Layout {
  w: number;
  h: number;
  dpr: number;
  portrait: boolean;
  board: Rect;
  logo: Rect;
}

export class Renderer {
  readonly bg = new Background();
  readonly board = new Board();
  layout!: Layout;
  showLogo = true;
  private ctx: CanvasRenderingContext2D;
  private logo: HTMLCanvasElement | null = null;
  private last = 0;
  private onResize: ((l: Layout) => void)[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  onLayout(fn: (l: Layout) => void) {
    this.onResize.push(fn);
    fn(this.layout);
  }

  resize() {
    const w = Math.max(240, window.innerWidth);
    const h = Math.max(160, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const portrait = w / h < 0.9;
    let board: Rect;
    let logo: Rect;
    let barH: number;
    let featH = 0;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    if (portrait) {
      const bottomH = clamp(h * 0.25, 150, 240);
      featH = clamp(h * 0.075, 44, 64);
      barH = bottomH;
      const logoH = clamp(h * 0.12, 48, 120);
      const avail = h - bottomH - featH - logoH - 28;
      const B = Math.max(120, Math.min(w - 28, avail));
      board = { x: (w - B) / 2, y: logoH + 12 + Math.max(0, (avail - B) / 2), w: B, h: B };
      logo = { x: (w - Math.min(w * 0.86, B * 1.1)) / 2, y: 4, w: Math.min(w * 0.86, B * 1.1), h: logoH };
    } else {
      const bottomH = clamp(h * 0.13, 58, 96);
      barH = bottomH;
      const logoH = clamp(h * 0.15, 34, 130);
      const side = clamp(w * 0.15, 110, 210);
      const availH = h - bottomH - logoH - 24;
      const B = Math.max(120, Math.min(availH, w - 2 * (side + 28)));
      board = { x: (w - B) / 2, y: logoH + 8 + Math.max(0, (availH - B) / 2), w: B, h: B };
      const lw = Math.min(B * 1.05, w * 0.6, logoH / 0.3);
      logo = { x: (w - lw) / 2, y: 2, w: lw, h: lw * 0.3 };
    }
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.layout = { w, h, dpr, portrait, board, logo };
    this.bg.resize(w, h, dpr);
    this.board.layout(board, dpr);
    this.logo = renderLogo(logo.w * dpr);
    const root = document.documentElement.style;
    root.setProperty('--bx', board.x + 'px');
    root.setProperty('--by', board.y + 'px');
    root.setProperty('--bs', board.w + 'px');
    root.setProperty('--logo-h', logo.h + 'px');
    root.setProperty('--logo-y', logo.y + 'px');
    root.setProperty('--bar-h', barH + 'px');
    root.setProperty('--feat-h', featH + 'px');
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);
    this.onResize.forEach((fn) => fn(this.layout));
  }

  private frame(ts: number) {
    const dtReal = this.last ? Math.min(50, ts - this.last) : 16;
    this.last = ts;
    const dt = clock.tick(dtReal);
    this.bg.update(dtReal);
    this.board.update(dt);

    const { ctx } = this;
    const { dpr, logo } = this.layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.draw(ctx);
    if (this.showLogo && this.logo) {
      const bob = Math.sin(ts / 900) * 2;
      ctx.drawImage(this.logo, logo.x, logo.y + bob, logo.w, logo.w * 0.3);
    }
    this.board.draw(ctx);
    requestAnimationFrame((t) => this.frame(t));
  }
}
