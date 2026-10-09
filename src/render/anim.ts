// Tiny animation clock: tweens, waits, global speed (turbo) and "skip".

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  start: number;
  dur: number;
  fn: (t: number) => void;
  ease: (t: number) => number;
  resolve: () => void;
}

interface Wait {
  until: number;
  resolve: () => void;
}

class Clock {
  /** animation time (ms), advanced by real dt × speed */
  now = 0;
  /** 1 = normal, >1 = turbo */
  speed = 1;
  private tweens: Tween[] = [];
  private waits: Wait[] = [];
  private skipping = false;

  tick(dtReal: number) {
    const dt = dtReal * (this.skipping ? 8 : this.speed);
    this.now += dt;
    for (const tw of this.tweens.slice()) {
      const t = Math.min(1, (this.now - tw.start) / tw.dur);
      tw.fn(tw.ease(t));
      if (t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    for (const w of this.waits.slice()) {
      if (this.now >= w.until) {
        this.waits.splice(this.waits.indexOf(w), 1);
        w.resolve();
      }
    }
    return dt;
  }

  tween(dur: number, fn: (t: number) => void, e: (t: number) => number = ease.outCubic): Promise<void> {
    if (dur <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => this.tweens.push({ start: this.now, dur, fn, ease: e, resolve }));
  }

  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ until: this.now + ms, resolve }));
  }

  /** Speed everything up until `endSkip` (player tapped during a presentation). */
  skip() {
    this.skipping = true;
  }
  endSkip() {
    this.skipping = false;
  }
  get isSkipping() {
    return this.skipping;
  }
}

export const clock = new Clock();
