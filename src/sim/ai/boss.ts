import { createQuery, Not, type World } from 'koota';
import { Vec2 } from 'planck';
import { getContext } from '../context';
import { takeDamage } from '../player/health';
import { Boss, Dead, Hazard, HazardKind, Player, Transform } from '../traits';

const bosses = createQuery(Boss, Transform, Hazard);
const living = createQuery(Player, Transform, Not(Dead));

/** Halloween boss: large body walks toward the nearest living player and bites on overlap. */
export function thinkBosses(world: World): void {
  const ctx = getContext(world);
  world.query(bosses).updateEach(([boss, tr, hz], entity) => {
    if (hz.kind !== HazardKind.Boss) return;
    let tx = tr.x;
    let ty = tr.y;
    let best = Infinity;
    world.query(living).updateEach(([_p, pt], player) => {
      const d = Math.hypot(pt.x - tr.x, pt.y - tr.y);
      if (d < best) {
        best = d;
        tx = pt.x;
        ty = pt.y;
      }
      if (d < 1.15 && boss.bite <= 0) {
        takeDamage(world, player, 22, 'body', -1, pt.x, pt.y);
        boss.bite = 36;
      }
    });
    if (boss.bite > 0) boss.bite -= 1;
    const body = ctx.bodies.get(entity);
    if (!body || best === Infinity) return;
    const dx = tx - tr.x;
    const dir = dx === 0 ? 0 : Math.sign(dx);
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(dir * boss.speed, v.y + (tr.y < ty - 0.8 ? 4 : 0)));
  });
}
