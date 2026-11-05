// Scène : fond unique (teinté « nuit » pendant les free spins), cadre, logo, rouleaux, Tony, compteur des free spins, bannières.
// Mise en page responsive : paysage (1920×1080) ou portrait (1080×1920), fond toujours plein écran.
import { PIXI, makeRig, rigSize, updateRigs } from './rigs';
import { Reels } from './reels';
import { VideoTony } from './tony-video';
import { EASE, tween, updateTweens } from './tween';
import { MAX_TIPS, TIP_MULT } from '../../shared/game';

export const FONT = 'Modak'; // police « ballon » (OFL)
export const FONT2 = 'Lilita One';

export function textStyle(size: number, fill: string | string[] = '#ffffff', stroke = 10): any {
  return new PIXI.TextStyle({
    fontFamily: FONT,
    fontSize: size,
    fill: Array.isArray(fill)
      ? new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: fill.map((c, i) => ({ offset: i / (fill.length - 1), color: c })), textureSpace: 'local' })
      : new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: '#ffffff' }, { offset: 0.5, color: fill }, { offset: 1, color: '#e9d2b4' }], textureSpace: 'local' }),
    stroke: { color: '#1b0f14', width: stroke, join: 'round' },
    dropShadow: { color: '#000000', alpha: 0.55, blur: 2, distance: Math.max(3, size / 14), angle: Math.PI / 2 },
    align: 'center',
    letterSpacing: 2,
    padding: Math.round(size * 0.25),
  });
}

export class Stage {
  app: any;
  private bgDay: any;
  private bgNight: any;
  readonly world = new PIXI.Container();
  readonly frame: any;
  readonly logo: any;
  readonly reels: Reels;
  readonly tony: any;
  readonly fx = new PIXI.Container();
  readonly fsPanel = new PIXI.Container();
  private fsSpins: any;
  private fsMult: any;
  private jar: any;
  private pips: any[] = [];
  private win: [number, number, number, number];
  portrait = false;
  onTap: () => void = () => {};

  static async create(parent: HTMLElement, preload: () => Promise<void> = async () => {}) {
    const tonyVideo = VideoTony.load();
    const app = new PIXI.Application();
    await app.init({ resizeTo: window, background: '#120b10', antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    parent.appendChild(app.canvas);
    const [day, night, frame, logo, cadre] = await Promise.all([
      PIXI.Assets.load('img/fond.webp'),
      PIXI.Assets.load('img/fond.webp'),
      PIXI.Assets.load('img/cadre.png'),
      PIXI.Assets.load('img/logo.png'),
      fetch('img/cadre.json').then((r) => r.json()),
      preload(),
    ]);
    return new Stage(app, day, night, frame, logo, cadre, await tonyVideo);
  }

  private constructor(app: any, day: any, night: any, frameTex: any, logoTex: any, cadre: { taille: number[]; fenetre: number[] }, tonyVideo: VideoTony) {
    this.app = app;
    this.bgDay = new PIXI.Sprite(day);
    this.bgNight = new PIXI.Sprite(night);
    this.bgNight.alpha = 0;
    this.bgNight.tint = 0x5a5fa8; // même pizzeria, ambiance de nuit pour les free spins
    for (const b of [this.bgDay, this.bgNight]) b.anchor.set(0.5);
    app.stage.addChild(this.bgDay, this.bgNight, this.world);

    this.win = cadre.fenetre as [number, number, number, number];
    const [fx, fy, fw, fh] = this.win;
    this.reels = new Reels(fw, fh);
    this.frame = new PIXI.Container();
    const frameSprite = new PIXI.Sprite(frameTex);
    this.reels.root.position.set(fx, fy);
    this.frame.addChild(this.reels.root, frameSprite);
    this.frame.pivot.set(cadre.taille[0] / 2, cadre.taille[1] / 2);

    this.logo = new PIXI.Sprite(logoTex);
    this.logo.anchor.set(0.5);

    // Tony : version vidéo (Google Flow). Le rig Rig Lab reste disponible : makeRig('tony'), pivot (0, rigSize('tony')[1] / 2).
    this.tony = tonyVideo;
    void rigSize;

    this.buildFsPanel();
    this.world.addChild(this.tony, this.frame, this.logo, this.fsPanel, this.fx);

    app.canvas.addEventListener('pointerdown', () => this.onTap());
    let last = performance.now();
    app.ticker.add(() => {
      const now = performance.now();
      const dt = Math.min(50, Math.max(0, now - last)); // temps réel écoulé (plafonné si l'onglet a dormi)
      last = now;
      updateTweens(dt);
      this.reels.update(dt);
      updateRigs(dt);
      this.tony.update?.(dt);
      this.idleBob += dt;
      this.logo.rotation = Math.sin(this.idleBob / 1400) * 0.015;
    });
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }
  private idleBob = 0;

  private buildFsPanel() {
    const p = this.fsPanel;
    const bg = new PIXI.Graphics().roundRect(-170, -150, 340, 300, 34).fill({ color: 0x1b0f14, alpha: 0.78 }).stroke({ color: 0xffc83a, width: 5 });
    const titre = new PIXI.Text({ text: 'FREE SPINS', style: textStyle(34, ['#fff6c2', '#ffc83a']) });
    titre.anchor.set(0.5);
    titre.y = -112;
    this.fsSpins = new PIXI.Text({ text: '1 / 10', style: textStyle(44) });
    this.fsSpins.anchor.set(0.5);
    this.fsSpins.y = -62;
    this.jar = makeRig('H1');
    this.jar.pivot.set(0, 25);
    this.jar.scale.set(0.2);
    this.jar.position.set(-80, 40);
    this.jar.play('idle', { loop: true });
    this.fsMult = new PIXI.Text({ text: 'x1', style: textStyle(64, ['#ffffff', '#ffd64a', '#ff9a1f']) });
    this.fsMult.anchor.set(0.5);
    this.fsMult.position.set(60, 30);
    const pips = new PIXI.Container();
    for (let i = 0; i < MAX_TIPS; i++) {
      const g = new PIXI.Graphics().circle(0, 0, 11).fill(0x3a2a20).stroke({ color: 0x1b0f14, width: 3 });
      g.position.set(-120 + i * 30, 112);
      pips.addChild(g);
      this.pips.push(g);
    }
    p.addChild(bg, titre, this.fsSpins, this.jar, this.fsMult, pips);
    p.visible = false;
  }

  setFreeSpins(cur: number, total: number) {
    this.fsSpins.text = `${cur} / ${total}`;
  }

  setTips(tips: number, pop = true) {
    const mult = TIP_MULT[tips];
    const was = this.fsMult.text;
    this.fsMult.text = `x${mult}`;
    this.pips.forEach((g, i) => {
      g.clear().circle(0, 0, 11).fill(i < tips ? 0xffc83a : 0x3a2a20).stroke({ color: 0x1b0f14, width: 3 });
    });
    if (pop && was !== this.fsMult.text) {
      this.fsMult.scale.set(1.6);
      tween(this.fsMult.scale, { x: 1, y: 1 }, 420, EASE.outBack);
      this.jar.play('win', { then: 'idle' });
    }
  }

  showFreeSpinsPanel(on: boolean) {
    this.fsPanel.visible = on;
    if (on) {
      this.fsPanel.scale.set(0.2);
      tween(this.fsPanel.scale, { x: 1, y: 1 }, 380, EASE.outBack);
    }
  }

  async setNight(on: boolean) {
    await tween(this.bgNight, { alpha: on ? 1 : 0 }, 900, EASE.inOutSine);
  }

  /** Taille de l'écran → disposition paysage ou portrait. */
  layout() {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.portrait = sh > sw * 1.05;
    for (const b of [this.bgDay, this.bgNight]) {
      const s = Math.max(sw / b.texture.width, sh / b.texture.height);
      b.scale.set(s);
      b.position.set(sw / 2, sh / 2);
    }
    const DW = this.portrait ? 1080 : 1920;
    const DH = this.portrait ? 1920 : 1080;
    const hud = this.portrait ? 230 : 120; // place réservée à la barre d'interface en bas
    const s = Math.min(sw / DW, (sh - hud * (sh / DH) * 0.0) / DH);
    this.world.scale.set(s);
    this.world.position.set((sw - DW * s) / 2, (sh - DH * s) / 2);
    if (this.portrait) {
      this.logo.scale.set(0.6);
      this.logo.position.set(540, 150);
      this.frame.scale.set(0.92);
      this.frame.position.set(540, 712);
      this.tony.scale.set(0.763);
      this.tony.position.set(540, 1420);
      this.fsPanel.scale.set(0.7);
      this.fsPanel.position.set(880, 1300);
    } else {
      // commandes en panneaux latéraux (DOM) : la scène se tient entre les deux
      this.logo.scale.set(0.4);
      this.logo.position.set(230, 120);
      this.frame.scale.set(0.86);
      this.frame.position.set(1000, 452);
      this.tony.scale.set(0.949);
      this.tony.position.set(455, 1080);
      this.fsPanel.scale.set(0.72);
      this.fsPanel.position.set(1720, 165);
    }
    void hud;
  }

  /** Position écran (dans world) du centre de la fenêtre des rouleaux. */
  get boardCenter() {
    const [fx, fy, fw, fh] = this.win;
    const p = this.frame.toGlobal(new PIXI.Point(fx + fw / 2, fy + fh / 2));
    return this.world.toLocal(p);
  }
}
