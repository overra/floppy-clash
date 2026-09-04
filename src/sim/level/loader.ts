import type { Entity, World } from 'koota';
import { getContext } from '../context';
import { assignNetId, createPlayerCapsule } from '../physics/bodies';
import { spawnWeapon } from '../systems/weapons';
import { createHazard } from '../hazards';
import {
  Aim,
  Combat,
  Controller,
  HazardKind,
  Health,
  Player,
  PrevTransform,
  SpawnPoint,
  Status,
  Stocks,
  Transform,
} from '../traits';
import type { MatchSettings } from '../rules/settings';
import { moduleForType } from '../hazards';
import type { LevelDef, LevelObject } from './schema';

/** What survives "hazards off": plain ground, the void, and platforms that merely move. */
const NEUTRAL_TYPES = new Set(['solid', 'platform.moving', 'void']);

/**
 * The arena as the match settings want it: with hazards off every object that is not ground or a
 * moving platform is dropped (unknown types count as solids), and with items off the authored
 * starting weapons go too. Returns the level itself when nothing changes.
 */
export function applyLevelSwitches(level: LevelDef, settings: Pick<MatchSettings, 'hazards' | 'items'>): LevelDef {
  if (settings.hazards && settings.items !== 'off') return level;
  let out = level;
  if (!settings.hazards) {
    const objects = level.objects.filter((o) => {
      if (NEUTRAL_TYPES.has(o.type)) return true;
      const mod = moduleForType(o.type);
      return !mod || mod.kind === HazardKind.Solid;
    });
    out = { ...out, objects };
  }
  if (settings.items === 'off' && out.startingWeapons?.length) {
    out = { ...out, startingWeapons: [] };
  }
  return out;
}

export function loadLevel(world: World, level: LevelDef): void {
  const ctx = getContext(world);
  for (let i = 0; i < level.spawns.length; i++) {
    const s = level.spawns[i]!;
    const e = world.spawn(SpawnPoint({ index: i }), Transform({ x: s.x, y: s.y, angle: 0 }));
    assignNetId(world, e);
  }
  for (const obj of level.objects) {
    spawnObject(world, obj);
  }
  for (const sw of level.startingWeapons ?? []) {
    spawnWeapon(world, sw.weapon, sw.x, sw.y);
  }
  void ctx;
}

function spawnObject(world: World, obj: LevelObject): Entity | undefined {
  return createHazard(world, obj);
}

export function spawnPlayer(world: World, slot: number, x: number, y: number, color: number, inputIndex = slot): Entity {
  const ctx = getContext(world);
  const entity = world.spawn(
    Player({ slot, color, inputIndex }),
    Controller({
      grounded: false,
      wallDir: 0,
      coyote: 0,
      jumpBuffer: 0,
      lockTicks: 0,
      ducking: false,
      facing: slot % 2 === 0 ? 1 : -1,
      wallSliding: false,
      vx: 0,
      vy: 0,
    }),
    Aim({ x: slot % 2 === 0 ? 1 : -1, y: 0, holdTicks: 0 }),
    Health({ hp: ctx.settings.maxHp, maxHp: ctx.settings.maxHp, percent: 0 }),
    Stocks({ left: ctx.settings.stocks, respawnIn: 0 }),
    Combat({ punchCooldown: 0, punchActive: 0, blockMeter: 1, blockStartTick: -999, blocking: false, refillDelay: 0 }),
    Status({ burning: 0, slowed: 0, glued: 0, bubbled: 0, pulled: 0, invuln: 0 }),
    Transform({ x, y, angle: 0 }),
    PrevTransform({ x, y, angle: 0 }),
  );
  assignNetId(world, entity);
  createPlayerCapsule(world, entity, x, y);
  ctx.players.push(entity);
  return entity;
}
