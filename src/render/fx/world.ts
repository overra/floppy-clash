import { createWorld, trait, type Entity, type World } from 'koota';

/** Render-side cosmetic traits (PLAN 4.4 / decision 2). Never replicated. */
export const FxParticle = trait({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  r: 0,
  life: 0,
  color: 0,
});

export const FxDecal = trait({
  x: 0,
  y: 0,
  r: 0,
  color: 0,
  kind: 0,
  stamped: 0,
});

export const FxLimb = trait({
  simId: 0,
  hipSway: 0,
  shoulderSway: 0,
});

export const FxShake = trait({ amount: 0 });

export type FxWorld = World;

export function packColor(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0x5a1010;
  return parseInt(h.slice(0, 6), 16) >>> 0;
}

export function unpackColor(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

export function createFxWorld(): World {
  const world = createWorld();
  world.add(FxShake({ amount: 0 }));
  return world;
}

export function clearFx(world: World): void {
  const kill: Entity[] = [];
  world.query(FxParticle).updateEach((_, e) => {
    kill.push(e);
  });
  world.query(FxDecal).updateEach((_, e) => {
    kill.push(e);
  });
  world.query(FxLimb).updateEach((_, e) => {
    kill.push(e);
  });
  for (const e of kill) world.destroy(e);
  if (world.has(FxShake)) world.set(FxShake, { amount: 0 });
}

export function countFx(world: World, trait: typeof FxParticle | typeof FxDecal | typeof FxLimb): number {
  let n = 0;
  world.query(trait).updateEach(() => {
    n += 1;
  });
  return n;
}
