import { createQuery, type Entity, type World } from 'koota';
import { RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { createBoxBody, registerBody } from '../physics/bodies';
import { Aim, PhysArm, Player, PrevTransform, Transform } from '../traits';

const arms = createQuery(PhysArm, Transform);

/** PLAN 4.6 upgrade path: non-colliding motor arms that track aim. */
export function attachPhysicsArms(world: World, player: Entity): void {
  const ctx = getContext(world);
  const root = ctx.bodies.get(player);
  const t = player.get(Transform);
  if (!root || !t) return;
  const owner = player.get(Player)?.slot ?? 0;
  for (const side of [-1, 1] as const) {
    const arm = world.spawn(
      PhysArm({ side, owner }),
      Transform({ x: t.x + side * 0.28, y: t.y + 0.28, angle: 0 }),
      PrevTransform({ x: t.x + side * 0.28, y: t.y + 0.28, angle: 0 }),
    );
    const body = createBoxBody(ctx.physics, arm, 'sensor', t.x + side * 0.28, t.y + 0.28, 0.08, 0.22, 'dynamic', {
      density: 0.15,
      friction: 0,
      sensor: true,
      fixedRotation: false,
    });
    registerBody(world, arm, body);
    ctx.physics.createJoint(
      new RevoluteJoint(
        {
          collideConnected: false,
          enableMotor: true,
          motorSpeed: 0,
          maxMotorTorque: 24,
        },
        root,
        body,
        { x: t.x + side * 0.18, y: t.y + 0.38 },
      ),
    );
  }
}

export function stepArms(world: World): void {
  const ctx = getContext(world);
  world.query(arms).updateEach(([arm], entity) => {
    const body = ctx.bodies.get(entity);
    if (!body) return;
    const owner = ctx.players.find((p) => (p.get(Player)?.slot ?? 0) === arm.owner) ?? ctx.players[0];
    const aim = owner?.get(Aim);
    const target = Math.atan2(aim?.y ?? 0, (aim?.x ?? 1) * (arm.side || 1));
    const cur = body.getAngle();
    let err = target - cur;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    body.setAngularVelocity(err * 12);
  });
}
