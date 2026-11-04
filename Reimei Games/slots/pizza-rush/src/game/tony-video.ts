// Tony animé par vidéo (Google Flow) : planches de sprites à 12 images/s, boucle aller-retour (aucun saut au raccord).
// Même interface que le rig Rig Lab (.play) pour que le jeu n'ait rien à changer : la vidéo n'a qu'une animation
// (respiration + clignement), donc .play() ne change rien pour l'instant.
import { PIXI } from './rigs';

interface Meta { fps: number; w: number; h: number; planches: number; frames: [number, number, number][] }

export class VideoTony extends PIXI.Container {
  private sprite: any;
  private tex: any[] = [];
  private t = 0;
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
    this.tex = meta.frames.map(([s, x, y]) => new PIXI.Texture({ source: sheets[s].source, frame: new PIXI.Rectangle(x, y, meta.w, meta.h) }));
    this.sprite = new PIXI.Sprite(this.tex[0]);
    this.addChild(this.sprite);
    this.pivot.set(meta.w / 2, meta.h); // ancré aux pieds
  }

  update(dt: number) {
    this.t += dt;
    const n = this.tex.length;
    const period = 2 * n - 2; // aller-retour
    let k = Math.floor((this.t / 1000) * this.fps) % period;
    if (k >= n) k = period - k;
    this.sprite.texture = this.tex[k];
  }

  play(_name?: string, _opts?: unknown) {
    /* une seule animation livrée pour l'instant (repos) */
  }
}
