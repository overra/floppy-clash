import { getContext } from '../context';
import { raycastClosest } from '../physics/queries';
import { Dead, HazardKind, Player, Static, Transform } from '../traits';
import { spawnHazardEntity, kill } from './common';
import type { HazardModule } from './types';

function dirAngle(dir?: string): number {
  if (dir === 'up') return Math.PI / 2;
  if (dir === 'down') return -Math.PI / 2;
  if (dir === 'left') return Math.PI;
  return 0;
}

/** Appendix D: raycast each tick while on; warning then beam. */
export const laser: HazardModule = {
  typeId: 'laser',
  kind: HazardKind.Laser,
  create(world, obj) {
    const entity = spawnHazardEntity(world, obj, HazardKind.Laser);
    entity.add(Static());
    const t = entity.get(Transform);
    if (t) entity.set(Transform, { ...t, angle: obj.angle ?? dirAngle(obj.dir) });
    return entity;
  },
  step(world, entity, hz, tr) {
    const ctx = getContext(world);
    const on = hz.param0 || 40;
    const off = hz.param1 || 50;
    const warn = hz.param2 || 12;
    const cycle = on + off;
    const phase = ctx.tick % cycle;
    if (phase < warn) hz.armed = 2;
    else if (phase < on) hz.armed = 1;
    else hz.armed = 0;

    if (hz.armed !== 1) return;
    const reach = hz.param3 || 14;
    const ang = tr.angle;
    const x2 = tr.x + Math.cos(ang) * reach;
    const y2 = tr.y + Math.sin(ang) * reach;
    const hit = raycastClosest(world, tr.x, tr.y, x2, y2, (h) => {
      if (h.entity === entity) return true;
      if (h.kind === 'sensor' || h.kind === 'projectile') return true;
      return false;
    });
    if (!hit) return;
    const target = hit.entity as typeof entity;
    if (!world.has(target) || !target.has(Player) || target.has(Dead)) return;
    kill(world, target, hit.x, hit.y);
  },
};
