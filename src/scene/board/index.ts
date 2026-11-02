// Board module entry: createBoard(ctx, kit) -> Board3D.

import type { Board3D, SceneContext, SymbolKit } from '../contracts';
import { Board } from './board';

export function createBoard(ctx: SceneContext, kit: SymbolKit): Board3D {
  return new Board(ctx, kit);
}

export { Board };
