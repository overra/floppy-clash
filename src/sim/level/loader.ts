import type { Entity, World } from 'koota';
import { getContext } from '../context';
import { RevoluteJoint } from 'planck';
import { assignNetId, createBoxBody, createCircleBody, createPlayerCapsule, registerBody } from '../physics/bodies';
import { spawnWeapon } from '../systems/weapons';
import {
  Aim,
  Combat,
  Controller,
  Destructible,
  Hazard,
  HazardKind,
  Health,
  Kinematic,
  Player,
  PrevTransform,
  Solid,
  SpawnPoint,
  Static,
  Status,
  Transform,
} from '../traits';
import type { LevelDef, LevelObject } from './schema';

const KIND: Record<string, number> = {
  solid: HazardKind.Solid,
  'block.destructible': HazardKind.Destructible,
  crate: HazardKind.Crate,
  spikes: HazardKind.Spikes,
  lava: HazardKind.Lava,
  saw: HazardKind.Saw,
  'platform.moving': HazardKind.MovingPlatform,
  'platform.rotating': HazardKind.RotatingPlatform,
  'platform.disappearing': HazardKind.Disappearing,
  'platform.collapsing': HazardKind.Collapsing,
  'platform.momentum': HazardKind.Momentum,
  chain: HazardKind.Chain,
  'barrel.explosive': HazardKind.Barrel,
  laser: HazardKind.Laser,
  conveyor: HazardKind.Conveyor,
  ice: HazardKind.Ice,
  bounce: HazardKind.Bounce,
  spikeball: HazardKind.Spikeball,
  crusher: HazardKind.Crusher,
  'trigger.drop': HazardKind.TriggerDrop,
};

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

function spawnObject(world: World, obj: LevelObject): Entity {
  const ctx = getContext(world);
  const kind = KIND[obj.type] ?? HazardKind.Solid;
  const w = obj.w ?? 2;
  const h = obj.h ?? 1;
  const entity = world.spawn(
    Transform({ x: obj.x, y: obj.y, angle: obj.angle ?? 0 }),
    PrevTransform({ x: obj.x, y: obj.y, angle: obj.angle ?? 0 }),
    Hazard({
      kind,
      param0: obj.speed ?? obj.period ?? obj.w ?? 0,
      param1: obj.path?.length ?? obj.rate ?? obj.offTicks ?? obj.h ?? 0,
      param2: obj.mode === 'pingpong' ? 1 : (obj.delay ?? obj.warningTicks ?? 0),
      param3: obj.onTicks ?? obj.omega ?? 0,
      hp: obj.hp ?? 0,
      armed: 1,
    }),
  );
  assignNetId(world, entity);

  if (obj.type === 'solid' || obj.type === 'ice' || obj.type === 'conveyor' || obj.type === 'bounce') {
    entity.add(Static(), Solid());
    const body = createBoxBody(ctx.physics, entity, 'solid', obj.x, obj.y, w / 2, h / 2, 'static', {
      friction: obj.type === 'ice' ? 0.02 : obj.type === 'bounce' ? 0.1 : 0.6,
      restitution: obj.type === 'bounce' ? 1.2 : 0,
    });
    registerBody(world, entity, body);
  } else if (obj.type === 'crate' || obj.type === 'barrel.explosive') {
    const body = createBoxBody(ctx.physics, entity, 'prop', obj.x, obj.y, w / 2, h / 2, 'dynamic', {
      density: 0.5,
      friction: 0.5,
      fixedRotation: false,
    });
    registerBody(world, entity, body);
    if (obj.type === 'barrel.explosive') entity.add(Destructible({ hp: obj.hp ?? 20, maxHp: obj.hp ?? 20 }));
  } else if (obj.type === 'block.destructible') {
    entity.add(Static(), Solid(), Destructible({ hp: obj.hp ?? 60, maxHp: obj.hp ?? 60 }));
    const body = createBoxBody(ctx.physics, entity, 'solid', obj.x, obj.y, w / 2, h / 2, 'static', { friction: 0.5 });
    registerBody(world, entity, body);
  } else if (obj.type === 'spikes') {
    entity.add(Static());
    const body = createBoxBody(ctx.physics, entity, 'sensor', obj.x, obj.y, w / 2, 0.25, 'static', { sensor: true });
    registerBody(world, entity, body);
  } else if (obj.type === 'lava') {
    const body = createBoxBody(ctx.physics, entity, 'sensor', obj.x, obj.y, w / 2, h / 2, 'kinematic', { sensor: true });
    registerBody(world, entity, body);
  } else if (obj.type === 'saw' || obj.type === 'spikeball') {
    const body = createCircleBody(ctx.physics, entity, 'sensor', obj.x, obj.y, obj.r ?? 0.45, 'kinematic', { sensor: true });
    registerBody(world, entity, body);
    entity.add(Kinematic());
  } else if (obj.type.startsWith('platform.') || obj.type === 'crusher') {
    const type = obj.type === 'platform.collapsing' || obj.type === 'platform.momentum' ? 'dynamic' : 'kinematic';
    const body = createBoxBody(
      ctx.physics,
      entity,
      'solid',
      obj.x,
      obj.y,
      w / 2,
      h / 2,
      type === 'dynamic' ? 'dynamic' : 'kinematic',
      { friction: 0.8, density: obj.type === 'platform.momentum' ? 0.8 : 0 },
    );
    registerBody(world, entity, body);
    entity.add(Kinematic());
  } else if (obj.type === 'laser') {
    entity.add(Static());
  } else if (obj.type === 'chain') {
    const links = obj.links ?? 5;
    entity.add(Static(), Destructible({ hp: 40, maxHp: 40 }));
    const anchor = createBoxBody(ctx.physics, entity, 'solid', obj.x, obj.y, 0.1, 0.1, 'static');
    registerBody(world, entity, anchor);
    let prevBody = anchor;
    for (let i = 0; i < links; i++) {
      const link = world.spawn(
        Transform({ x: obj.x, y: obj.y - (i + 1) * 0.35, angle: 0 }),
        Hazard({ kind: HazardKind.Chain, param0: i, param1: 0, param2: 0, param3: 0, hp: 20, armed: 1 }),
        Destructible({ hp: 20, maxHp: 20 }),
      );
      assignNetId(world, link);
      const body = createBoxBody(ctx.physics, link, 'prop', obj.x, obj.y - (i + 1) * 0.35, 0.08, 0.16, 'dynamic', {
        density: 0.4,
        friction: 0.3,
        fixedRotation: false,
      });
      registerBody(world, link, body);
      ctx.physics.createJoint(
        new RevoluteJoint(
          { collideConnected: false, enableLimit: true, lowerAngle: -0.8, upperAngle: 0.8 },
          prevBody,
          body,
          { x: obj.x, y: obj.y - i * 0.35 },
        ),
      );
      prevBody = body;
    }
  }
  return entity;
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
    Health({ hp: ctx.settings.maxHp, maxHp: ctx.settings.maxHp }),
    Combat({ punchCooldown: 0, punchActive: 0, blockMeter: 1, blockStartTick: -999, blocking: false, refillDelay: 0 }),
    Status({ burning: 0, slowed: 0, glued: 0, bubbled: 0 }),
    Transform({ x, y, angle: 0 }),
    PrevTransform({ x, y, angle: 0 }),
  );
  assignNetId(world, entity);
  createPlayerCapsule(world, entity, x, y);
  ctx.players.push(entity);
  return entity;
}
