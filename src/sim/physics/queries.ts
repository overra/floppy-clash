import type { World } from 'koota';
import { Vec2, type Body, type Fixture } from 'planck';
import { getContext } from '../context';
import type { FixtureUserData } from './categories';

export type RayHit = {
  entity: number;
  fixture: Fixture;
  x: number;
  y: number;
  nx: number;
  ny: number;
  fraction: number;
  kind: string;
};

export function raycastClosest(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ignore?: (hit: RayHit) => boolean,
): RayHit | null {
  const ctx = getContext(world);
  let best: RayHit | null = null;
  ctx.physics.rayCast(new Vec2(x1, y1), new Vec2(x2, y2), (fixture, point, normal, fraction) => {
    const data = fixture.getUserData() as FixtureUserData | undefined;
    const hit: RayHit = {
      entity: data?.entity ?? -1,
      fixture,
      x: point.x,
      y: point.y,
      nx: normal.x,
      ny: normal.y,
      fraction,
      kind: data?.kind ?? 'unknown',
    };
    if (ignore?.(hit)) return -1;
    best = hit;
    return fraction;
  });
  return best;
}

export function queryBodiesInRadius(world: World, x: number, y: number, radius: number): Body[] {
  const ctx = getContext(world);
  const found: Body[] = [];
  const r2 = radius * radius;
  for (let body = ctx.physics.getBodyList(); body; body = body.getNext()) {
    const p = body.getPosition();
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= r2) found.push(body);
  }
  return found;
}

/**
 * Blast every body within `radius` away from (x, y) with linear falloff. `onBody` sees each body with
 * its falloff and the outward unit direction; `skipPlayers` leaves fighters' bodies untouched so the
 * caller can shove them its own way (launch mode).
 */
export function applyExplosion(
  world: World,
  x: number,
  y: number,
  radius: number,
  impulse: number,
  onBody?: (body: Body, falloff: number, nx: number, ny: number) => void,
  opts: { skipPlayers?: boolean } = {},
): void {
  const bodies = queryBodiesInRadius(world, x, y, radius);
  for (const body of bodies) {
    if (body.getType() === 'static') {
      onBody?.(body, 1, 0, 0);
      continue;
    }
    const p = body.getPosition();
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const falloff = Math.max(0, 1 - dist / radius);
    const nx = dx / dist;
    const ny = dy / dist;
    const isPlayer = (body.getUserData() as FixtureUserData | undefined)?.kind === 'player';
    if (!(opts.skipPlayers && isPlayer)) {
      const mag = impulse * falloff * body.getMass();
      body.applyLinearImpulse({ x: nx * mag, y: ny * mag + 0.15 * mag }, p);
    }
    onBody?.(body, falloff, nx, ny);
  }
}
