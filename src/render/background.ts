// Animated storm sky: gradient, drifting cloud layers, skyline, rain and
// lightning. Palette blends between the base game and free spins.

import { makeCanvas } from './art';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

const SKY_BASE = ['#070319', '#1d0b45', '#4a1470', '#a02a8c'].map(hex);
const SKY_FS = ['#0a0208', '#3a0620', '#8a1630', '#ff6a3d'].map(hex);

interface Cloud {
  x: number;
  y: number;
  s: number;
  speed: number;
  layer: number;
  sprite: number;
}

interface Bolt {
  pts: [number, number][];
  branches: [number, number][][];
  life: number;
  max: number;
}

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
}

function cloudSprite(w: number, seed: number): HTMLCanvasElement {
  const h = w * 0.55;
  const [c, ctx] = makeCanvas(w, h);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = w * (0.15 + rnd() * 0.7);
    const y = h * (0.35 + rnd() * 0.4);
    const r = w * (0.08 + rnd() * 0.16);
    const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function skyline(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // two rows of floating towers
  for (const [alpha, base, scale] of [
    [0.55, 1, 0.75],
    [1, 1, 1],
  ] as const) {
    let x = -10;
    while (x < w) {
      const bw = (18 + rnd() * 40) * scale * (w / 900);
      const bh = (h * (0.25 + rnd() * 0.7)) * scale;
      ctx.fillStyle = `rgba(12,4,30,${alpha})`;
      ctx.fillRect(x, h * base - bh, bw, bh);
      // antenna
      if (rnd() > 0.7) ctx.fillRect(x + bw / 2 - 1, h * base - bh - bh * 0.15, 2, bh * 0.15);
      // windows
      for (let wy = h * base - bh + 6; wy < h - 4; wy += 7 * scale) {
        for (let wx = x + 4; wx < x + bw - 4; wx += 6 * scale) {
          if (rnd() > 0.72) {
            const hue = rnd() > 0.5 ? '255,120,230' : '120,230,255';
            ctx.fillStyle = `rgba(${hue},${(0.25 + rnd() * 0.6) * alpha})`;
            ctx.fillRect(wx, wy, 2.2 * scale, 3 * scale);
          }
        }
      }
      x += bw + rnd() * 6;
    }
  }
  return c;
}

export class Background {
  private w = 1;
  private h = 1;
  private dpr = 1;
  private clouds: Cloud[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private city: HTMLCanvasElement | null = null;
  private bolts: Bolt[] = [];
  private drops: Drop[] = [];
  private flash = 0;
  private nextBolt = 2500;
  /** 0 = base game palette, 1 = free spins palette */
  fsMix = 0;
  fsTarget = 0;
  onThunder: (strength: number) => void = () => {};

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const sw = Math.min(900, Math.max(w, h) * 0.6) * dpr;
    this.sprites = [11, 23, 37, 51].map((seed) => cloudSprite(sw, seed));
    this.city = skyline(w * dpr, h * 0.28 * dpr);
    if (!this.clouds.length) {
      for (let i = 0; i < 14; i++) {
        const layer = i % 3;
        this.clouds.push({
          x: Math.random() * 1.4 - 0.2,
          y: 0.05 + Math.random() * 0.75,
          s: 0.6 + Math.random() * 0.9 + layer * 0.25,
          speed: (0.004 + Math.random() * 0.006) * (layer + 1),
          layer,
          sprite: i % 4,
        });
      }
      for (let i = 0; i < 90; i++) this.drops.push(this.newDrop(true));
    }
  }

  private newDrop(anywhere = false): Drop {
    return {
      x: Math.random() * 1.2,
      y: anywhere ? Math.random() : -0.05,
      v: 0.7 + Math.random() * 0.8,
      l: 0.015 + Math.random() * 0.03,
    };
  }

  /** Trigger a lightning bolt now (strength 0..1). */
  strike(strength = 1, x = 0.15 + Math.random() * 0.7) {
    const pts: [number, number][] = [];
    let px = x;
    let py = -0.02;
    const end = 0.45 + Math.random() * 0.4;
    while (py < end) {
      pts.push([px, py]);
      py += 0.03 + Math.random() * 0.05;
      px += (Math.random() - 0.5) * 0.06;
    }
    const branches: [number, number][][] = [];
    for (let b = 0; b < 3; b++) {
      const start = pts[2 + Math.floor(Math.random() * (pts.length - 3))];
      const br: [number, number][] = [start];
      let [bx, by] = start;
      const dir = Math.random() > 0.5 ? 1 : -1;
      for (let k = 0; k < 4; k++) {
        bx += dir * (0.01 + Math.random() * 0.04);
        by += 0.02 + Math.random() * 0.04;
        br.push([bx, by]);
      }
      branches.push(br);
    }
    this.bolts.push({ pts, branches, life: 0, max: 380 });
    this.flash = Math.max(this.flash, 0.35 * strength + 0.15);
    this.onThunder(strength);
  }

  update(dt: number) {
    this.fsMix += (this.fsTarget - this.fsMix) * Math.min(1, dt / 600);
    for (const c of this.clouds) {
      c.x += (c.speed * dt) / 1000;
      if (c.x > 1.3) {
        c.x = -0.45;
        c.y = 0.05 + Math.random() * 0.75;
      }
    }
    const rain = 0.35 + this.fsMix * 0.65;
    for (const d of this.drops) {
      d.y += (d.v * dt) / 1000 * (0.8 + rain);
      d.x -= (d.v * dt) / 1000 * 0.25;
      if (d.y > 1.05 || d.x < -0.1) Object.assign(d, this.newDrop());
    }
    this.flash = Math.max(0, this.flash - dt / 380);
    for (const b of this.bolts) b.life += dt;
    this.bolts = this.bolts.filter((b) => b.life < b.max);
    this.nextBolt -= dt * (1 + this.fsMix * 1.5);
    if (this.nextBolt <= 0) {
      this.nextBolt = 3500 + Math.random() * 6500;
      this.strike(0.4 + Math.random() * 0.4);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { w, h } = this;
    const t = this.fsMix;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix(SKY_BASE[0], SKY_FS[0], t));
    g.addColorStop(0.45, mix(SKY_BASE[1], SKY_FS[1], t));
    g.addColorStop(0.8, mix(SKY_BASE[2], SKY_FS[2], t));
    g.addColorStop(1, mix(SKY_BASE[3], SKY_FS[3], t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // horizon glow
    const hg = ctx.createRadialGradient(w / 2, h * 1.05, 10, w / 2, h * 1.05, Math.max(w, h) * 0.7);
    hg.addColorStop(0, t > 0.5 ? 'rgba(255,140,60,0.45)' : 'rgba(255,80,200,0.35)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, w, h);

    // bolts behind clouds
    for (const b of this.bolts) {
      const a = 1 - b.life / b.max;
      const flick = Math.random() > 0.25 ? 1 : 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (const [width, color] of [
        [10, `rgba(140,120,255,${0.25 * a * flick})`],
        [4, `rgba(190,240,255,${0.7 * a * flick})`],
        [1.5, `rgba(255,255,255,${a * flick})`],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        ctx.stroke();
        ctx.lineWidth = width * 0.5;
        for (const br of b.branches) {
          ctx.beginPath();
          br.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // clouds (3 parallax layers)
    const tint = t > 0.5 ? 'rgba(255,120,90,' : 'rgba(170,140,255,';
    for (const c of this.clouds) {
      const spr = this.sprites[c.sprite];
      if (!spr) continue;
      const cw = (spr.width / this.dpr) * c.s;
      const ch = (spr.height / this.dpr) * c.s;
      ctx.globalAlpha = 0.1 + c.layer * 0.07 + this.flash * 0.5;
      ctx.drawImage(spr, c.x * w - cw / 2, c.y * h - ch / 2, cw, ch);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint + (0.06 + this.flash * 0.1) + ')';
    ctx.fillRect(0, 0, w, h);

    // skyline
    if (this.city) ctx.drawImage(this.city, 0, h * 0.72, w, h * 0.28);

    // rain
    ctx.save();
    ctx.strokeStyle = `rgba(190,210,255,${0.12 + t * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      const x = d.x * w;
      const y = d.y * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.l * h * 0.25, y + d.l * h);
    }
    ctx.stroke();
    ctx.restore();

    // flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
