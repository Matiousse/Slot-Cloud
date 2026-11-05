// Tony animé par vidéos (Google Flow), sans aucun raccord visible.
// Toutes les animations passent par la pose « pivot » P (l'image de départ commune des vidéos Flow) et chaque raccord
// est une vraie séquence de mouvement calculée par flux optique (atelier/pizza-rush/tony_transitions.py) :
//   repos (respiration, aller-retour) ──sortie vers P (toutes les 12 images)──▶ P
//   P ──entrée──▶ réaction ──retour──▶ P ──▶ repos (image 0 = P)
// Une réaction demandée attend donc au plus 1 s la prochaine sortie du repos. Suspense et perte peuvent être coupés
// (ils ont aussi des sorties) ; gain, gros gain, presque, bonus et rush vont au bout (bras levé jusqu'à la fin).
// Aucun fondu : une seule image affichée à la fois, à 12 images/s.
import { PIXI } from './rigs';

type Cell = [number, number, number];
interface Reaction { entree: string; corps: string; retour: string; sorties: Record<string, string> }
interface Meta {
  fps: number; w: number; h: number; planches: number; repos: string;
  sortiesRepos: Record<string, string>; reactions: Record<string, Reaction>; segments: Record<string, Cell[]>;
}

/** Plus c'est haut, plus la demande est importante (une demande en attente n'est jamais remplacée par une moindre). */
const PRIORITE: Record<string, number> = { bonus: 7, grosgain: 6, rush: 5, gain: 4, presque: 3, perte: 2, suspense: 1 };

export class VideoTony extends PIXI.Container {
  private sprite: any;
  private seg: Record<string, any[]> = {};
  private meta: Meta;
  private acc = 0;
  /** repos : position dans l'aller-retour ; sinon file de segments à jouer jusqu'au retour en P. */
  private idlePos = 0;
  private file: { nom: string; reaction?: string }[] = [];
  private i = 0;
  private enCours: string | null = null; // réaction en cours (corps ou entrée/retour)
  private attente: string | null = null; // réaction demandée, pas encore commencée
  readonly w: number;
  readonly h: number;

  static async load(base = 'anims/tony-video') {
    const meta: Meta = await (await fetch(`${base}/tony-video.json`)).json();
    const sheets = await Promise.all(Array.from({ length: meta.planches }, (_, i) => PIXI.Assets.load(`${base}/planche-${i}.webp`)));
    return new VideoTony(meta, sheets);
  }

  private constructor(meta: Meta, sheets: any[]) {
    super();
    this.meta = meta;
    this.w = meta.w;
    this.h = meta.h;
    for (const [nom, cells] of Object.entries(meta.segments)) {
      this.seg[nom] = cells.map(([s, x, y]) => new PIXI.Texture({ source: sheets[s].source, frame: new PIXI.Rectangle(x, y, meta.w, meta.h) }));
    }
    this.sprite = new PIXI.Sprite(this.seg[meta.repos][0]);
    this.addChild(this.sprite);
    this.pivot.set(meta.w / 2, meta.h); // ancré aux pieds
  }

  /** Animation en cours (« repos » au calme). */
  get current() { return this.enCours ?? 'repos'; }

  has(name: string) { return name in this.meta.reactions; }

  update(dt: number) {
    this.acc += dt;
    const pas = 1000 / this.meta.fps;
    while (this.acc >= pas) {
      this.acc -= pas;
      this.step();
    }
  }

  private idleFrame() {
    const n = this.seg[this.meta.repos].length;
    const period = 2 * n - 2;
    const k = this.idlePos % period;
    return k >= n ? period - k : k;
  }

  /** Lance la réaction en attente depuis la pose P. */
  private demarrer() {
    const nom = this.attente!;
    const r = this.meta.reactions[nom];
    this.attente = null;
    this.enCours = nom;
    this.file = [{ nom: r.entree, reaction: nom }, { nom: r.corps, reaction: nom }, { nom: r.retour, reaction: nom }];
    this.i = 0;
  }

  private step() {
    // ---- au repos
    if (!this.file.length) {
      const k = this.idleFrame();
      if (this.attente) {
        if (k === 0) {
          this.demarrer();
        } else {
          const sortie = this.meta.sortiesRepos[String(k)];
          if (sortie) {
            this.file = [{ nom: sortie }];
            this.i = 0;
          }
        }
      }
      if (!this.file.length) {
        this.idlePos++;
        this.sprite.texture = this.seg[this.meta.repos][this.idleFrame()];
        return;
      }
    }
    // ---- dans une séquence
    let cur = this.file[0];
    // une réaction interruptible peut être coupée à l'une de ses sorties
    if (this.attente && cur.reaction && cur.nom === this.meta.reactions[cur.reaction].corps) {
      const sortie = this.meta.reactions[cur.reaction].sorties[String(this.i)];
      if (sortie) {
        this.file = [{ nom: sortie }];
        this.i = 0;
        this.enCours = null;
        cur = this.file[0];
      }
    }
    const frames = this.seg[cur.nom];
    this.sprite.texture = frames[this.i];
    this.i++;
    if (this.i >= frames.length) {
      this.file.shift();
      this.i = 0;
      if (!this.file.length) {
        // arrivé en P : la réaction suivante, sinon le repos repart de son image 0 (= P)
        this.enCours = null;
        if (this.attente) this.demarrer();
        else this.idlePos = 0;
      }
    }
  }

  /** Demande une réaction ; elle commence dès que Tony passe par la pose P. 'idle' annule la demande en attente. */
  play(name?: string, _opts?: unknown) {
    if (!name || !this.has(name)) {
      this.attente = null;
      return;
    }
    if (name === this.enCours || name === this.attente) return;
    if (this.attente && (PRIORITE[this.attente] ?? 0) > (PRIORITE[name] ?? 0)) return;
    this.attente = name;
  }
}
