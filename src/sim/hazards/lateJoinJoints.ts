import type { Entity, World } from 'koota';
import { Box, PrismaticJoint, RevoluteJoint, type Body } from 'planck';
import { getContext } from '../context';
import { Hazard, HazardKind, NetId, Static, Transform } from '../traits';
import { isolateChainBody } from './chain';

/** Anonymous hang / slider bodies created for a spawned-missing hazard NetId. */
const extraBodies = new WeakMap<World, Map<number, Body[]>>();

function entityByNetId(world: World, id: number): Entity | undefined {
  let found: Entity | undefined;
  world.query(NetId).updateEach(([n], e) => {
    if (n.id === id) found = e;
  });
  return found;
}

function bodiesJoined(a: Body, b: Body): boolean {
  for (let edge = a.getJointList(); edge; edge = edge.next) {
    if (edge.other === b) return true;
  }
  return false;
}

function replaceExtras(world: World, netId: number, next: Body[]): void {
  const ctx = getContext(world);
  const map = extraBodies.get(world) ?? new Map<number, Body[]>();
  extraBodies.set(world, map);
  for (const body of map.get(netId) ?? []) {
    ctx.physics.destroyBody(body);
  }
  map.set(netId, next);
}

function attachChainPair(world: World, prev: Entity, next: Entity, limits: { lower: number; upper: number }): void {
  const ctx = getContext(world);
  const a = ctx.bodies.get(prev);
  const b = ctx.bodies.get(next);
  if (!a || !b || bodiesJoined(a, b)) return;
  if (a.getType() !== 'static') isolateChainBody(a);
  isolateChainBody(b);
  const pa = a.getPosition();
  const pb = b.getPosition();
  ctx.physics.createJoint(
    new RevoluteJoint(
      { collideConnected: false, enableLimit: true, lowerAngle: limits.lower, upperAngle: limits.upper },
      a,
      b,
      { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
    ),
  );
}

function attachSpikeballHang(world: World, entity: Entity, netId: number, hz: { param1: number; param3: number }): void {
  const ctx = getContext(world);
  const body = ctx.bodies.get(entity);
  const t = entity.get(Transform);
  if (!body || !t) return;
  // Host writes hang world point into param1/param3 (x=0 is a legal hang).
  const hangX = hz.param1;
  const hangY = hz.param3;
  const anchor = ctx.physics.createBody({ type: 'static', position: { x: hangX, y: hangY } });
  replaceExtras(world, netId, [anchor]);
  ctx.physics.createJoint(new RevoluteJoint({ collideConnected: false }, anchor, body, { x: hangX, y: hangY }));
}

function attachMomentumGraph(world: World, entity: Entity, netId: number, hz: { param2: number; param3: number }): void {
  const ctx = getContext(world);
  const deck = ctx.bodies.get(entity);
  const t = entity.get(Transform);
  if (!deck || !t) return;
  // Host writes the deck origin into param2/param3. 0 is a legal world x.
  const ax = hz.param2;
  const ay = hz.param3;
  const anchor = ctx.physics.createBody({ type: 'static', position: { x: ax, y: ay } });
  const slider = ctx.physics.createBody({
    type: 'dynamic',
    position: { x: ax, y: ay },
    fixedRotation: true,
    allowSleep: false,
  });
  slider.createFixture({
    shape: new Box(0.08, 0.08),
    density: 0.15,
    isSensor: true,
  });
  replaceExtras(world, netId, [anchor, slider]);
  ctx.physics.createJoint(
    new PrismaticJoint(
      {
        collideConnected: false,
        enableLimit: true,
        lowerTranslation: -0.8,
        upperTranslation: 0.05,
        enableMotor: true,
        maxMotorForce: 6,
        motorSpeed: 0.35,
      },
      anchor,
      slider,
      { x: ax, y: ay },
      { x: 0, y: 1 },
    ),
  );
  ctx.physics.createJoint(
    new RevoluteJoint(
      {
        collideConnected: false,
        enableLimit: true,
        lowerAngle: -0.55,
        upperAngle: 0.55,
        enableMotor: true,
        maxMotorTorque: 6,
        motorSpeed: 0,
      },
      slider,
      deck,
      { x: ax, y: ay },
    ),
  );
}

/**
 * PLAN 4.13: spawnMissing bodies never ran `module.create`, so rebuild the
 * host joint graph (chain revolutes, spikeball hang, momentum slider).
 * Only NetIds spawned this restore are attached, so interp re-apply is a no-op.
 */
export function attachLateJoinHazardJoints(world: World, newNetIds: Set<number>): void {
  if (newNetIds.size === 0) return;

  world.query(Hazard, NetId).updateEach(([hz, n], entity) => {
    if (hz.kind === HazardKind.Spikeball && hz.param2 === 0 && newNetIds.has(n.id)) {
      attachSpikeballHang(world, entity, n.id, hz);
    }
    if (hz.kind === HazardKind.Momentum && newNetIds.has(n.id)) {
      attachMomentumGraph(world, entity, n.id, hz);
    }
    if (hz.kind !== HazardKind.Chain) return;
    if (hz.param3 === 1) {
      const last = entityByNetId(world, hz.param2);
      if (last && (newNetIds.has(n.id) || newNetIds.has(hz.param2))) {
        attachChainPair(world, last, entity, { lower: -0.35, upper: 0.35 });
      }
      return;
    }
    if (entity.has(Static) || hz.param1 <= 0) return;
    const prev = entityByNetId(world, hz.param1);
    if (prev && (newNetIds.has(n.id) || newNetIds.has(hz.param1))) {
      attachChainPair(world, prev, entity, { lower: -0.8, upper: 0.8 });
    }
  });
}
