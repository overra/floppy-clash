import type { Entity, World } from 'koota';
import { RevoluteJoint, type Body } from 'planck';
import { getContext } from '../context';
import { assignNetId, createBoxBody, createCircleBody, registerBody } from '../physics/bodies';
import {
  Dead,
  Health,
  PartOf,
  Player,
  PrevTransform,
  RagdollPart,
  RagdollParts,
  Transform,
} from '../traits';

const PARTS: { part: number; hx: number; hy: number; ox: number; oy: number; circle?: boolean }[] = [
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

export function spawnRagdoll(world: World, player: Entity, impulseX: number, impulseY: number): void {
  const ctx = getContext(world);
  const t = player.get(Transform);
  if (!t) return;
  const vel = ctx.bodies.get(player)?.getLinearVelocity() ?? { x: 0, y: 0 };
  const root = world.spawn(Player(player.get(Player) ?? { slot: 0, color: 0, inputIndex: 0 }), Dead());
  assignNetId(world, root);
  const bodies: Body[] = [];
  for (const spec of PARTS) {
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
  const join = (a: number, b: number, ax: number, ay: number) => {
    const ba = bodies[a];
    const bb = bodies[b];
    if (!ba || !bb) return;
    ctx.physics.createJoint(
      new RevoluteJoint(
        { collideConnected: false, enableLimit: true, lowerAngle: -1.1, upperAngle: 1.1 },
        ba,
        bb,
        { x: t.x + ax, y: t.y + ay },
      ),
    );
  };
  join(1, 0, 0, 0.5);
  join(1, 2, -0.2, 0.42);
  join(2, 3, -0.3, 0.16);
  join(1, 4, 0.2, 0.42);
  join(4, 5, 0.3, 0.16);
  join(1, 6, -0.1, -0.05);
  join(6, 7, -0.13, -0.4);
  join(1, 8, 0.1, -0.05);
  join(8, 9, 0.13, -0.4);
  const health = player.get(Health);
  if (health) root.add(Health({ hp: 0, maxHp: health.maxHp }));
}
