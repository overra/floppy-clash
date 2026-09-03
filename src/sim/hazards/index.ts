import type { Entity, World } from 'koota';
import type { LevelObject } from '../level/schema';
import { HazardKind } from '../traits';
import { barrel } from './barrel';
import { bounce } from './bounce';
import { chain } from './chain';
import { spawnHazardEntity } from './common';
import { conveyor } from './conveyor';
import { crate } from './crate';
import { crusher } from './crusher';
import { destructible } from './destructible';
import { ice } from './ice';
import { laser } from './laser';
import { lava } from './lava';
import { collapsingPlatform } from './platform-collapsing';
import { disappearingPlatform } from './platform-disappearing';
import { momentumPlatform } from './platform-momentum';
import { movingPlatform } from './platform-moving';
import { rotatingPlatform } from './platform-rotating';
import { saw } from './saw';
import { solid } from './solid';
import { spikeball } from './spikeball';
import { spikes } from './spikes';
import { triggerDrop } from './trigger-drop';
import type { HazardModule } from './types';
import { voidHazard } from './void';

/** Every Appendix D type id, one module file each. */
export const HAZARD_MODULES: HazardModule[] = [
  solid,
  destructible,
  crate,
  spikes,
  lava,
  saw,
  movingPlatform,
  rotatingPlatform,
  disappearingPlatform,
  collapsingPlatform,
  momentumPlatform,
  chain,
  barrel,
  laser,
  conveyor,
  ice,
  bounce,
  spikeball,
  crusher,
  triggerDrop,
  voidHazard,
];

export const APPENDIX_D_TYPE_IDS = [
  'solid',
  'block.destructible',
  'crate',
  'spikes',
  'lava',
  'saw',
  'platform.moving',
  'platform.rotating',
  'platform.disappearing',
  'platform.collapsing',
  'platform.momentum',
  'chain',
  'barrel.explosive',
  'laser',
  'conveyor',
  'ice',
  'bounce',
  'spikeball',
  'crusher',
  'trigger.drop',
  'void',
] as const;

export const HAZARDS_BY_TYPE = new Map(HAZARD_MODULES.map((m) => [m.typeId, m]));
export const HAZARDS_BY_KIND = new Map(HAZARD_MODULES.filter((m) => m.kind >= 0).map((m) => [m.kind, m]));

export function moduleForType(typeId: string): HazardModule | undefined {
  return HAZARDS_BY_TYPE.get(typeId);
}

export function moduleForKind(kind: number): HazardModule | undefined {
  return HAZARDS_BY_KIND.get(kind);
}

export function createHazard(world: World, obj: LevelObject): Entity | undefined {
  const mod = HAZARDS_BY_TYPE.get(obj.type);
  if (!mod) return spawnHazardEntity(world, obj, HazardKind.Solid);
  return mod.create(world, obj);
}

export type { HazardModule, HazardView } from './types';
