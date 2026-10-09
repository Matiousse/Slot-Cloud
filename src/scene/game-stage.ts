// GameStage: composes every 3D module for the real game and exposes the
// presentation API used by the game controller (src/game/controller.ts).

import * as THREE from 'three';
import { audio } from '../audio/audio';
import { clock } from '../render/anim';
import type { Board3D, Cabinet, Character, Environment, Fx, ReactKind, SceneContext, SceneMode, SymbolKit } from './contracts';
import { Stage, type ScreenLayout } from './core';
import * as stubs from './stubs';

// Real modules (falls back to stubs if a module is missing, e.g. in partial dev builds).
const mods = import.meta.glob('./*/index.ts', { eager: true }) as Record<string, Record<string, unknown>>;
function make<T>(dir: string, fn: string, fallback: () => T, ...args: unknown[]): T {
  const m = mods[`./${dir}/index.ts`];
  const f = m?.[fn] as ((...a: unknown[]) => T) | undefined;
  return f ? f(...args) : fallback();
}

const TIER_MODE: Record<number, SceneMode> = { 0: 'base', 1: 'overcharge', 2: 'lock', 3: 'god' };

export class GameStage {
  readonly stage: Stage;
  readonly env: Environment;
  readonly kit: SymbolKit;
  readonly cabinet: Cabinet;
  readonly board: Board3D;
  readonly character: Character;
  readonly fx: Fx;
  onThunder: (strength: number) => void = () => {};
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private last = 0;
  private paused = false;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    const ctx: SceneContext = this.stage.ctx;
    this.env = make('environment', 'createEnvironment', () => stubs.createEnvironmentStub(ctx), ctx);
    this.kit = make('symbols', 'createSymbolKit', () => stubs.createSymbolKitStub(), ctx);
    this.cabinet = make('cabinet', 'createCabinet', () => stubs.createCabinetStub(), ctx);
    this.board = make('board', 'createBoard', () => stubs.createBoardStub(ctx, this.kit), ctx, this.kit);
    this.character = make('character', 'createCharacter', () => stubs.createCharacterStub(), ctx);
    this.fx = make('fx', 'createFx', () => stubs.createFxStub(ctx), ctx);
    for (const m of [this.env, this.cabinet, this.board, this.character, this.fx]) this.stage.add(m);
    this.env.onThunder = (s) => {
      this.onThunder(s);
      audio.rumble(s);
    };
    this.stage.onLayout((l) => {
      this.env.setLayout(l.kind);
      this.character.setLayout(l.kind);
    });
    document.addEventListener('visibilitychange', () => (this.paused = document.hidden));
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    const dtReal = this.last ? Math.min(50, t - this.last) : 16;
    this.last = t;
    if (!this.paused) {
      const dt = clock.tick(dtReal);
      this.stage.step(dt, dtReal);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  get layout(): ScreenLayout {
    return this.stage.layout;
  }

  // ------------------------------------------------------------ presentation API

  /** Raijin strikes a cell with lightning, then the Thunder Wild expands. */
  async strike(reel: number, row: number, mult: number, sticky: boolean) {
    const target = this.board.cellWorld(reel, Math.max(0, row < 0 ? 2 : row), this.tmpA).clone();
    target.z += 0.3;
    audio.charge();
    this.character.anticipate(false);
    const side = await this.character.strike(target);
    const from = this.character.getFistWorld(side, this.tmpB);
    this.fx.bolt(from, target, { branches: 3, duration: 460 });
    this.fx.shockwave(target, 0x9ff6ff, 1.4);
    this.fx.sparks(target, 70, 0xbff8ff);
    this.env.flash(1);
    this.stage.flash(0.35);
    this.stage.shake(0.7);
    this.cabinet.pulse(1, 0x38e8ff);
    audio.strikeHit(mult);
    await this.board.expandStorm(reel, row, mult, sticky);
    audio.multiplier(mult);
    if (mult >= 10) {
      this.fx.sparks(target, 50, 0xffd36b);
      this.stage.shake(0.35);
    }
  }

  /** Free spins tier (0 = base game). */
  setMode(tier: number) {
    const mode = TIER_MODE[tier] ?? 'base';
    this.env.setMode(mode);
    this.character.setMode(mode);
    this.cabinet.setMode(mode);
    this.cabinet.showLogo(tier === 0);
  }

  react(kind: ReactKind) {
    this.character.react(kind);
    if (kind === 'trigger' || kind === 'bigWin' || kind === 'megaWin' || kind === 'maxWin') {
      this.env.flash(kind === 'maxWin' ? 1 : 0.7);
      this.cabinet.pulse(1, kind === 'maxWin' ? 0xffd36b : 0x38e8ff);
    }
    if (kind === 'trigger' || kind === 'maxWin') audio.roar();
  }

  anticipate(reel: number) {
    this.cabinet.anticipation(reel);
    this.character.anticipate(reel >= 0);
    if (reel >= 0) {
      const p = this.board.cellWorld(reel, 2, this.tmpA);
      this.fx.aura(p, 900, 0xff5fd0);
    }
  }

  scatterLanded(reel: number, count: number) {
    this.board.scatterLanded(reel);
    for (let y = 0; y < 5; y++)
      if (this.board.symbolAt(reel, y) === 'SC') {
        const p = this.board.cellWorld(reel, y, this.tmpA);
        this.fx.shockwave(p, 0xff3b30, 0.9);
        this.fx.sparks(p, 30, 0xffc93c);
      }
    audio.drum(count);
    if (count >= 2) this.character.react('scatter');
  }

  coins(count: number, mode: 'rain' | 'fountain' = 'rain') {
    this.fx.coins(count, mode);
  }

  shake(amount: number) {
    this.stage.shake(amount);
  }

  thunder(strength = 1) {
    this.env.flash(strength);
    this.stage.flash(0.25 * strength);
    audio.thunder(strength);
  }

  intro() {
    return this.character.intro();
  }
}
