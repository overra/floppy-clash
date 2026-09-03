import type { LevelDef } from '../sim/level/schema';
import { buildArenas } from './generator';
import { TEST_LEVELS } from './testLevels';

/** Seventy themed arenas from the archetype generator plus the per-hazard test rooms. */
export const GENERATED_LEVELS: LevelDef[] = [...buildArenas(), ...TEST_LEVELS];
