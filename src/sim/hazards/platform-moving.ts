import { Vec2 } from 'planck';
import { getContext } from '../context';
import { HazardKind, HazardPath, Transform } from '../traits';
import { carryRider, createKinematicBox } from './common';
import type { HazardModule } from './types';

export const movingPlatform: HazardModule = {
  typeId: 'platform.moving',
  kind: HazardKind.MovingPlatform,
  create(world, obj) {
    const entity = createKinematicBox(world, obj, HazardKind.MovingPlatform);
    const points =
      obj.path && obj.path.length >= 2
        ? obj.path.map((p) => ({ x: p.x, y: p.y }))
        : [
            { x: obj.x - 4, y: obj.y },
            { x: obj.x + 4, y: obj.y },
          ];
    entity.add(
      HazardPath({
        points,
        index: 0,
        accum: 0,
        mode: obj.mode === 'loop' ? 0 : 1,
        dir: 1,
        speed: obj.speed ?? 3,
      }),
    );
    return entity;
  },
  step(world, entity, _hz, _tr, dt) {
    const path = entity.get(HazardPath);
    const body = getContext(world).bodies.get(entity);
    if (!path || !body || path.points.length < 2) return;
    const n = path.points.length;
    const i = ((path.index % n) + n) % n;
    const next = path.mode === 0 ? (i + 1) % n : i + path.dir;
    const clamped = path.mode === 0 ? next : Math.max(0, Math.min(n - 1, next));
    const a = path.points[i]!;
    const b = path.points[clamped]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    path.accum += path.speed * dt;
    if (path.accum >= dist) {
      path.accum = 0;
      if (path.mode === 0) {
        path.index = (i + 1) % n;
      } else {
        path.index = clamped;
        if (clamped === 0 || clamped === n - 1) path.dir *= -1;
      }
      body.setTransform(new Vec2(b.x, b.y), body.getAngle());
      body.setLinearVelocity(new Vec2(0, 0));
      return;
    }
    const p = body.getPosition();
    const tx = a.x + (dx / dist) * path.accum;
    const ty = a.y + (dy / dist) * path.accum;
    body.setLinearVelocity(new Vec2((tx - p.x) / dt, (ty - p.y) / dt));
  },
  contact(world, player, _hz, ht, ctrl, dt, hazard) {
    const pt = player.get(Transform);
    if (pt) carryRider(world, player, hazard, pt, ht, ctrl, dt);
  },
};
