// Audio sting for the REIMEI GAMES intro, synthesized with Web Audio:
// low dawn swell -> airy riser -> pentatonic bell chord as the sun crests ->
// taiko + koto pluck when the 黎明 seal stamps -> reverb tail.
// Browsers only allow sound after a user gesture; if the context cannot run,
// the sting is silently skipped.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const NOTE = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function playSting(volume = 0.9) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.05;

  const master = ac.createGain();
  master.gain.value = volume;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 3;
  master.connect(comp).connect(ac.destination);

  // reverb (generated impulse)
  const verb = ac.createConvolver();
  const len = Math.floor(ac.sampleRate * 3.2);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  verb.buffer = ir;
  const verbGain = ac.createGain();
  verbGain.gain.value = 0.42;
  verb.connect(verbGain).connect(master);

  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const env = (g: GainNode, start: number, attack: number, peak: number, end: number) => {
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  };

  // 1) dawn swell: detuned saws through an opening low-pass
  {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(140, t0);
    lp.frequency.exponentialRampToValueAtTime(1600, t0 + 1.6);
    lp.frequency.exponentialRampToValueAtTime(300, t0 + 4.2);
    const g = ac.createGain();
    env(g, t0, 1.4, 0.16, t0 + 4.4);
    lp.connect(g);
    g.connect(master);
    g.connect(verb);
    for (const [m, det] of [
      [38, -9],
      [38, 9],
      [45, 0],
      [50, -5],
    ] as const) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(m);
      o.detune.value = det;
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 4.5);
    }
  }

  // 2) airy riser
  {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(400, t0 + 0.3);
    bp.frequency.exponentialRampToValueAtTime(6000, t0 + 1.55);
    const g = ac.createGain();
    env(g, t0 + 0.3, 1.2, 0.1, t0 + 1.75);
    src.connect(bp).connect(g);
    g.connect(master);
    g.connect(verb);
    src.start(t0 + 0.3);
    src.stop(t0 + 1.9);
  }

  // 3) bell chord as the sun crests (D minor pentatonic / In-scale colour)
  const bell = (freq: number, start: number, dur: number, peak: number) => {
    [1, 2.76, 5.4].forEach((ratio, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const g = ac.createGain();
      env(g, start, 0.006, peak / (1 + i * 1.8), start + dur / (1 + i * 0.6));
      o.connect(g);
      g.connect(master);
      g.connect(verb);
      o.start(start);
      o.stop(start + dur + 0.1);
    });
  };
  [62, 65, 69, 74, 77].forEach((m, i) => bell(NOTE(m + 12), t0 + 1.5 + i * 0.07, 2.6, 0.06));

  // 4) seal stamp: taiko hit + koto pluck
  const hit = t0 + 2.3;
  {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, hit);
    o.frequency.exponentialRampToValueAtTime(48, hit + 0.35);
    const g = ac.createGain();
    env(g, hit, 0.004, 0.75, hit + 0.9);
    o.connect(g);
    g.connect(master);
    g.connect(verb);
    o.start(hit);
    o.stop(hit + 1);
    const src = ac.createBufferSource();
    src.buffer = noise;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const ng = ac.createGain();
    env(ng, hit, 0.002, 0.35, hit + 0.12);
    src.connect(lp).connect(ng);
    ng.connect(master);
    src.start(hit);
    src.stop(hit + 0.2);
  }
  {
    // Karplus-Strong pluck rendered into a buffer
    const f = NOTE(74);
    const n = Math.floor(ac.sampleRate * 1.6);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    const period = Math.round(ac.sampleRate / f);
    for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
    for (let i = period; i < n; i++) d[i] = 0.497 * (d[i - period] + d[i - period + 1]);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = 0.3;
    src.connect(g);
    g.connect(master);
    g.connect(verb);
    src.start(hit + 0.04);
  }

  // 5) soft shimmer tail for the final flare
  [69, 74, 81].forEach((m, i) => bell(NOTE(m + 12), t0 + 3.75 + i * 0.05, 1.8, 0.035));
}
