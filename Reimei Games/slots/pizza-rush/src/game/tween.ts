// Mini moteur de tween piloté par le ticker Pixi (aucune dépendance).
// Courbes : mêmes lois que Rig Lab (rien de linéaire, dépassement puis retour).

export type Ease = (p: number) => number;

export const EASE = {
  linear: (p: number) => p,
  outQuad: (p: number) => 1 - (1 - p) * (1 - p),
  inQuad: (p: number) => p * p,
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  outCubic: (p: number) => 1 - (1 - p) ** 3,
  inCubic: (p: number) => p * p * p,
  outBack: (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
  outBackBig: (p: number) => 1 + 3.6 * (p - 1) ** 3 + 2.6 * (p - 1) ** 2,
  outElastic: (p: number) => (p === 0 || p === 1 ? p : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

interface Job {
  t: number;
  dur: number;
  tick: (k: number) => void;
  done: () => void;
}

const jobs = new Set<Job>();
let speed = 1;
export const setTweenSpeed = (s: number) => (speed = s);

export function updateTweens(dtMs: number) {
  for (const j of [...jobs]) {
    j.t += dtMs * speed;
    const k = Math.min(1, j.t / j.dur);
    j.tick(k);
    if (k >= 1) {
      jobs.delete(j);
      j.done();
    }
  }
}

/** Anime des propriétés numériques (chemins « a.b » acceptés : 'scale.x'). */
export function tween(obj: any, to: Record<string, number>, dur: number, ease: Ease = EASE.outCubic): Promise<void> {
  const keys = Object.keys(to);
  const get = (k: string) => k.split('.').reduce((o, p) => o[p], obj) as number;
  const set = (k: string, v: number) => {
    const path = k.split('.');
    const last = path.pop()!;
    path.reduce((o, p) => o[p], obj)[last] = v;
  };
  const from = keys.map(get);
  return new Promise((resolve) => {
    if (dur <= 0) {
      keys.forEach((k) => set(k, to[k]));
      return resolve();
    }
    jobs.add({
      t: 0,
      dur,
      tick: (k) => {
        const e = ease(k);
        keys.forEach((key, i) => set(key, from[i] + (to[key] - from[i]) * e));
      },
      done: resolve,
    });
  });
}

/** Fonction appelée à chaque image pendant dur ms (k de 0 à 1). */
export function animate(dur: number, fn: (k: number) => void): Promise<void> {
  return new Promise((resolve) => jobs.add({ t: 0, dur, tick: fn, done: resolve }));
}

export function clearTweens() {
  for (const j of jobs) {
    j.tick(1);
    j.done();
  }
  jobs.clear();
}
