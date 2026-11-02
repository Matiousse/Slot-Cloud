import type { SymbolCode } from '../../../../shared/game';
import type { SymbolDef } from '../types';
import { L1, L2, L3, L4, L5 } from './letters';
import { H4 } from './cell';
import { SC } from './drum';
import { H2 } from './gem';
import { H1 } from './kabuto';
import { H3 } from './katana';
import { SW } from './thunder';
import { WD } from './wild';

export const DEFS: Record<SymbolCode, SymbolDef> = {
  L5,
  L4,
  L3,
  L2,
  L1,
  H4,
  H3,
  H2,
  H1,
  WD,
  SW,
  SC,
};
