import type { Entity, World } from 'koota';
import { RevoluteJoint, type Body, type World as PhysicsWorld } from 'planck';
import { getContext } from '../context';
import { assignNetId, createBoxBody, createCircleBody, registerBody } from '../physics/bodies';
import {
  Controller,
  Dead,
  Health,
  PartOf,
  Player,
  PrevTransform,
  RagdollPart,
  RagdollParts,
  Transform,
} from '../traits';

export type RagdollPartSpec = {
  part: number;
  hx: number;
  hy: number;
  ox: number;
  oy: number;
  circle?: boolean;
};

/** 10-body ragdoll (PLAN 4.6). Indices match `RAGDOLL_JOINTS`. */
export const RAGDOLL_PARTS: RagdollPartSpec[] = [
  { part: RagdollParts.Head, hx: 0.18, hy: 0.18, ox: 0, oy: 0.72, circle: true },
  { part: RagdollParts.Torso, hx: 0.16, hy: 0.32, ox: 0, oy: 0.2 },
  { part: RagdollParts.UpperArmL, hx: 0.07, hy: 0.2, ox: -0.28, oy: 0.35 },
  { part: RagdollParts.LowerArmL, hx: 0.06, hy: 0.18, ox: -0.32, oy: 0.02 },
  { part: RagdollParts.UpperArmR, hx: 0.07, hy: 0.2, ox: 0.28, oy: 0.35 },
  { part: RagdollParts.LowerArmR, hx: 0.06, hy: 0.18, ox: 0.32, oy: 0.02 },
  { part: RagdollParts.UpperLegL, hx: 0.08, hy: 0.22, ox: -0.12, oy: -0.22 },
  { part: RagdollParts.LowerLegL, hx: 0.07, hy: 0.2, ox: -0.14, oy: -0.58 },
  { part: RagdollParts.UpperLegR, hx: 0.08, hy: 0.22, ox: 0.12, oy: -0.22 },
  { part: RagdollParts.LowerLegR, hx: 0.07, hy: 0.2, ox: 0.14, oy: -0.58 },
];

export const RAGDOLL_JOINTS: { a: number; b: number; ax: number; ay: number }[] = [
  { a: 1, b: 0, ax: 0, ay: 0.5 },
  { a: 1, b: 2, ax: -0.2, ay: 0.42 },
  { a: 2, b: 3, ax: -0.3, ay: 0.16 },
  { a: 1, b: 4, ax: 0.2, ay: 0.42 },
  { a: 4, b: 5, ax: 0.3, ay: 0.16 },
  { a: 1, b: 6, ax: -0.1, ay: -0.05 },
  { a: 6, b: 7, ax: -0.13, ay: -0.4 },
  { a: 1, b: 8, ax: 0.1, ay: -0.05 },
  { a: 8, b: 9, ax: 0.13, ay: -0.4 },
];

export function ragdollPartSpec(part: number): RagdollPartSpec {
  return RAGDOLL_PARTS.find((s) => s.part === part) ?? RAGDOLL_PARTS[1]!;
}

/** Dead `Player` with no capsule / controller — the `PartOf` parent, not a living seat. */
export function isRagdollRoot(entity: Entity): boolean {
  return entity.has(Dead) && entity.has(Player) && !entity.has(Controller) && !entity.get(Transform);
}

function createRagdollJoint(physics: PhysicsWorld, a: Body, b: Body, x: number, y: number): void {
  physics.createJoint(
    new RevoluteJoint(
      { collideConnected: false, enableLimit: true, lowerAngle: -1.1, upperAngle: 1.1 },
      a,
      b,
      { x, y },
    ),
  );
}

/** Late-join: revolute joints at current part midpoints. Returns how many joints were created. */
export function attachRagdollJoints(world: World, root: Entity): number {
  const ctx = getContext(world);
  const bodies: (Body | undefined)[] = RAGDOLL_PARTS.map(() => undefined);
  world.query(RagdollPart).updateEach(([rp], entity) => {
    if (entity.targetFor(PartOf) !== root) return;
    const idx = RAGDOLL_PARTS.findIndex((s) => s.part === rp.part);
    if (idx >= 0) bodies[idx] = ctx.bodies.get(entity);
  });
  if (bodies.some((b) => !b)) return 0;
  let n = 0;
  for (const j of RAGDOLL_JOINTS) {
    const ba = bodies[j.a];
    const bb = bodies[j.b];
    if (!ba || !bb) continue;
    const pa = ba.getPosition();
    const pb = bb.getPosition();
    createRagdollJoint(ctx.physics, ba, bb, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    n += 1;
  }
  return n;
}

export function spawnRagdoll(world: World, player: Entity, impulseX: number, impulseY: number): void {
  const ctx = getContext(world);
  const t = player.get(Transform);
  if (!t) return;
  const vel = ctx.bodies.get(player)?.getLinearVelocity() ?? { x: 0, y: 0 };
  const root = world.spawn(Player(player.get(Player) ?? { slot: 0, color: 0, inputIndex: 0 }), Dead());
  assignNetId(world, root);
  const bodies: Body[] = [];
  for (const spec of RAGDOLL_PARTS) {
    const part = world.spawn(
      RagdollPart({ part: spec.part }),
      PartOf(root),
      Transform({ x: t.x + spec.ox, y: t.y + spec.oy, angle: 0 }),
      PrevTransform({ x: t.x + spec.ox, y: t.y + spec.oy, angle: 0 }),
    );
    assignNetId(world, part);
    const body = spec.circle
      ? createCircleBody(ctx.physics, part, 'ragdoll', t.x + spec.ox, t.y + spec.oy, spec.hx, 'dynamic', {
          density: 0.8,
          friction: 0.4,
          restitution: 0.05,
        })
      : createBoxBody(ctx.physics, part, 'ragdoll', t.x + spec.ox, t.y + spec.oy, spec.hx, spec.hy, 'dynamic', {
          density: 0.9,
          friction: 0.45,
          restitution: 0.05,
          fixedRotation: false,
        });
    body.setLinearVelocity({ x: vel.x + impulseX * 0.15, y: vel.y + impulseY * 0.15 });
    body.setAngularVelocity((ctx.rng.next() - 0.5) * 8);
    registerBody(world, part, body);
    bodies.push(body);
  }
  for (const j of RAGDOLL_JOINTS) {
    const ba = bodies[j.a];
    const bb = bodies[j.b];
    if (!ba || !bb) continue;
    createRagdollJoint(ctx.physics, ba, bb, t.x + j.ax, t.y + j.ay);
  }
  const health = player.get(Health);
  if (health) root.add(Health({ hp: 0, maxHp: health.maxHp }));
}
