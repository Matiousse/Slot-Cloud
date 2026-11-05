// Tony animé par vidéos (Google Flow) : planches de sprites à 12 images/s, un recadrage commun à toutes les vidéos
// (atelier/pizza-rush/tony_videos.py). Le repos boucle en aller-retour (aucun saut au raccord) ; chaque réaction
// (gain, grosgain, presque, perte, bonus, rush, suspense) se joue une fois puis revient au repos.
// Les raccords se font en fondu court : l'image quittée reste par-dessus et s'efface pendant FONDU ms.
import { PIXI } from './rigs';

type Cell = [number, number, number];
interface Meta { fps: number; w: number; h: number; planches: number; repos: string; anims: Record<string, Cell[]> }

const FONDU = 250;

export class VideoTony extends PIXI.Container {
  private sprite: any;
  private ghost: any;
  private anims: Record<string, any[]> = {};
  private repos: string;
  private cur: string;
  private t = 0;
  private fade = 0;
  private fps = 12;
  readonly w: number;
  readonly h: number;

  static async load(base = 'anims/tony-video') {
    const meta: Meta = await (await fetch(`${base}/tony-video.json`)).json();
    const sheets = await Promise.all(Array.from({ length: meta.planches }, (_, i) => PIXI.Assets.load(`${base}/planche-${i}.webp`)));
    return new VideoTony(meta, sheets);
  }

  private constructor(meta: Meta, sheets: any[]) {
    super();
    this.fps = meta.fps;
    this.w = meta.w;
    this.h = meta.h;
    for (const [name, cells] of Object.entries(meta.anims)) {
      this.anims[name] = cells.map(([s, x, y]) => new PIXI.Texture({ source: sheets[s].source, frame: new PIXI.Rectangle(x, y, meta.w, meta.h) }));
    }
    this.repos = meta.repos;
    this.cur = meta.repos;
    this.sprite = new PIXI.Sprite(this.anims[this.repos][0]);
    this.ghost = new PIXI.Sprite(this.anims[this.repos][0]);
    this.ghost.visible = false;
    this.addChild(this.sprite, this.ghost);
    this.pivot.set(meta.w / 2, meta.h); // ancré aux pieds
  }

  /** Animation en cours (« repos » au calme). */
  get current() { return this.cur; }

  has(name: string) { return name in this.anims; }

  private switchTo(name: string) {
    this.ghost.texture = this.sprite.texture; // l'image quittée s'efface par-dessus
    this.ghost.visible = true;
    this.ghost.alpha = 1;
    this.fade = FONDU;
    this.cur = name;
    this.t = 0;
  }

  update(dt: number) {
    this.t += dt;
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt);
      this.ghost.alpha = this.fade / FONDU;
      this.ghost.visible = this.fade > 0;
    }
    const tex = this.anims[this.cur];
    const n = tex.length;
    let k = Math.floor((this.t / 1000) * this.fps);
    if (this.cur === this.repos) {
      const period = 2 * n - 2; // aller-retour
      k %= period;
      if (k >= n) k = period - k;
    } else if (k >= n) {
      this.switchTo(this.repos); // réaction finie : retour au repos
      k = 0;
    }
    this.sprite.texture = this.anims[this.cur][k];
  }

  /** Joue une réaction une fois puis revient au repos. 'idle' / nom inconnu = retour au repos. */
  play(name?: string, _opts?: unknown) {
    const target = name && this.has(name) ? name : this.repos;
    if (target === this.cur) return; // déjà en train (pas de redémarrage saccadé)
    this.switchTo(target);
  }
}
