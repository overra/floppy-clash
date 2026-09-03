import { universe } from 'koota';
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { createDecalLayer, stampFxDecals } from '../src/render/fx/decals';
import { emitIntoWorld, listDecals, listParticles, stepFxParticles } from '../src/render/fx/particles';
import { countFx, createFxWorld, FxDecal, FxLimb, FxParticle } from '../src/render/fx/world';
import { poseToPrimitives } from '../src/render/figure';
import { PhysArm, Transform } from '../src/sim/traits';
import { hold, makeSim } from './helpers';

describe('render-side Koota world (PLAN 4.4)', () => {
  it('stores particles and decals as entities, not ad-hoc arrays', () => {
    universe.reset();
    const fx = createFxWorld();
    emitIntoWorld(
      [
        { type: 'blood', x: 3, y: 2, amount: 40 },
        { type: 'explosion', x: 5, y: 3, radius: 2, damage: 20 },
        { type: 'shot', x: 1, y: 1, aimX: 1, aimY: 0 },
      ],
      fx,
    );
    expect(countFx(fx, FxParticle)).toBeGreaterThan(0);
    expect(countFx(fx, FxDecal)).toBeGreaterThan(0);
    expect(listParticles(fx).length).toBe(countFx(fx, FxParticle));
    expect(listDecals(fx).length).toBe(countFx(fx, FxDecal));
    const before = countFx(fx, FxParticle);
    stepFxParticles(fx, 2);
    expect(countFx(fx, FxParticle)).toBeLessThan(before);
  });

  it('stamps FxDecal entities once into the persistent layer', () => {
    universe.reset();
    const fx = createFxWorld();
    const layer = createDecalLayer({ x: 0, y: 0, w: 16, h: 10 }, 16);
    emitIntoWorld([{ type: 'blood', x: 4, y: 3, amount: 30 }], fx);
    expect(stampFxDecals(fx, layer)).toBeGreaterThan(0);
    const calls = layer.stampCalls;
    expect(stampFxDecals(fx, layer)).toBe(0);
    expect(layer.stampCalls).toBe(calls);
  });

  it('stores limb secondary motion as entities keyed by sim id', () => {
    const sim = makeSim({ settings: { playerCount: 1 } });
    const fx = createFxWorld();
    const cam = createCamera(sim.ctx.level.bounds);
    buildFrame(sim, cam, 0, 1280, 720, [], { fxWorld: fx, freezeCamera: true });
    expect(countFx(fx, FxLimb)).toBeGreaterThan(0);
  });
});

describe('physics arms in SDF pose', () => {
  it('uses PhysArm body positions when physicsArms is on', () => {
    const sim = makeSim({ seed: 43, settings: { playerCount: 1, physicsArms: true } });
    for (let i = 0; i < 24; i++) {
      sim.step([hold({ aimX: 0, aimY: 1 }), hold({}), hold({}), hold({})]);
    }
    const tips: { side: number; x: number; y: number }[] = [];
    sim.ecs.query(PhysArm, Transform).updateEach(([arm, t]) => {
      tips.push({ side: arm.side, x: t.x, y: t.y });
    });
    expect(tips.length).toBe(2);
    const left = tips.find((t) => t.side < 0)!;
    const right = tips.find((t) => t.side > 0)!;
    const pose = {
      x: 0,
      y: 0,
      facing: 1,
      ducking: false,
      grounded: true,
      wallSliding: false,
      vx: 0,
      vy: 0,
      aimX: 0,
      aimY: 1,
      punching: false,
      blocking: false,
      dead: false,
      phase: 0,
    };
    const cosmetic = poseToPrimitives(pose);
    const withPhys = poseToPrimitives({ ...pose, physicsArmL: left, physicsArmR: right });
    expect(withPhys[2]?.bx).toBeCloseTo(left.x, 4);
    expect(withPhys[2]?.by).toBeCloseTo(left.y, 4);
    expect(withPhys[3]?.bx).toBeCloseTo(right.x, 4);
    expect(withPhys[3]?.by).toBeCloseTo(right.y, 4);
    const dist = Math.hypot((cosmetic[2]?.bx ?? 0) - left.x, (cosmetic[2]?.by ?? 0) - left.y);
    expect(dist).toBeGreaterThan(0.05);
  });
});
