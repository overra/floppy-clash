import { describe, expect, it } from 'vitest';
import { woodsClearing } from '../src/levels/handauthored';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { groupBounds } from '../src/render/frame';
import {
  PRIM_BEZIER,
  PRIM_PIE,
  PRIM_ROUNDED_BOX,
  PRIM_TRIANGLE,
} from '../src/render/sdf/primitives';
import { lerpHex, themePassGroups } from '../src/render/themeDecor';
import { Combat, Crown, Held, HeldBy, Loose, PrevTransform, Transform } from '../src/sim/traits';
import { spawnWeapon } from '../src/sim/systems/weapons';
import { THEMES, themeOf } from '../src/sim/level/themes';
import { hold, makeSim, playerOf } from './helpers';

describe('PLAN §4.11 theme pass', () => {
  it('emits parallax decorations including beziers (gradient is a fullscreen pass)', () => {
    const theme = themeOf('woods');
    const cam = createCamera({ x: 0, y: 0, w: 32, h: 18 });
    cam.x = 12;
    cam.y = 8;
    cam.zoom = 32;
    const groups = themePassGroups(theme, { x: 0, y: 0, w: 32, h: 18 }, cam, 1280, 720);
    expect(groups.every((g) => g.layer === 0)).toBe(true);
    expect(groups.some((g) => g.primitives.some((p) => p.kind === PRIM_BEZIER))).toBe(true);
    expect(groups.some((g) => g.primitives.some((p) => p.kind === PRIM_ROUNDED_BOX))).toBe(true);
    const colors = new Set(groups.map((g) => g.color));
    expect(colors.size).toBeGreaterThan(1);
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    for (const id of Object.keys(THEMES)) {
      const groups = themePassGroups(themeOf(id), { x: 0, y: 0, w: 32, h: 18 }, cam, 1280, 720);
      expect(groups.length, id).toBeGreaterThan(0);
    }
  });

  it('rounded-box bounds use half-extents, not bx/by as points', () => {
    const b = groupBounds([{ kind: PRIM_ROUNDED_BOX, ax: 16, ay: 8, bx: 2, by: 1, r: 0.1 }], 0);
    expect(b.minX).toBeCloseTo(14);
    expect(b.maxX).toBeCloseTo(18);
    expect(b.minY).toBeCloseTo(7);
    expect(b.maxY).toBeCloseTo(9);
  });

  it('buildFrame includes the theme pass on every match frame', () => {
    const sim = makeSim({ level: woodsClearing, seed: 2, settings: { playerCount: 1 } });
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(frame.groups.some((g) => g.layer === 0)).toBe(true);
    expect(frame.groups.some((g) => g.primitives.some((p) => p.kind === PRIM_BEZIER))).toBe(true);
  });

  it('solids use physics half-extents and the block arc is a pie', () => {
    const sim = makeSim({ level: woodsClearing, seed: 2, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    const combat = p.get(Combat);
    if (combat) p.set(Combat, { ...combat, blocking: true });
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    const floor = frame.groups
      .flatMap((g) => g.primitives)
      .filter((pr) => pr.kind === PRIM_ROUNDED_BOX && pr.bx > 8);
    expect(floor.length).toBeGreaterThan(0);
    expect(
      frame.groups.some((g) => g.primitives.some((pr) => pr.kind === PRIM_PIE && g.layer === 7)),
    ).toBe(true);
  });

  it('loose weapons are a group of 2–4 rounded boxes', () => {
    const sim = makeSim({ level: woodsClearing, seed: 2, settings: { playerCount: 1 } });
    const gun = spawnWeapon(sim.ecs, 'ak47', 16, 8);
    gun.set(Transform, { x: 16, y: 8, angle: 0.6 });
    gun.set(PrevTransform, { x: 16, y: 8, angle: 0.6 });
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    const guns = frame.groups.filter(
      (g) =>
        g.layer === 3 &&
        g.primitives.length >= 2 &&
        g.primitives.length <= 4 &&
        g.primitives.every((pr) => pr.kind === PRIM_ROUNDED_BOX),
    );
    expect(guns.length).toBeGreaterThan(0);
    expect(guns.some((g) => g.primitives.some((pr) => Math.abs(pr.cx ?? 0) > 0.2))).toBe(true);
  });

  it('crown is a band plus points, not a single disk', () => {
    const sim = makeSim({ level: woodsClearing, seed: 2, settings: { playerCount: 1 } });
    playerOf(sim).add(Crown());
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    const crown = frame.groups.find(
      (g) => g.layer === 7 && g.color === '#f2c14e' && g.primitives.length > 1,
    );
    expect(crown).toBeTruthy();
    expect(crown!.primitives.length).toBeGreaterThanOrEqual(4);
    expect(crown!.primitives.some((p) => p.kind === PRIM_TRIANGLE)).toBe(true);
    expect(crown!.primitives.some((p) => p.kind === PRIM_ROUNDED_BOX)).toBe(true);
  });

  it('live Void Well publishes frame.hole for world UV warp', () => {
    const sim = makeSim({ level: woodsClearing, seed: 9, settings: { playerCount: 1 } });
    const p = playerOf(sim);
    sim.ctx.bodies.get(p)?.setPosition({ x: 10, y: 4 });
    p.set(Transform, { x: 10, y: 4, angle: 0 });
    const gun = spawnWeapon(sim.ecs, 'black-hole', 10, 5);
    gun.add(Held(), HeldBy(p));
    gun.remove(Loose);
    sim.step([hold({ attack: true, aimX: 1, aimY: 0 }), hold({}), hold({}), hold({})]);
    const frame = buildFrame(sim, createCamera(sim.ctx.level.bounds), 0, 1280, 720, [], {
      freezeCamera: true,
    });
    expect(frame.hole?.r ?? 0).toBeGreaterThan(0.2);
    expect(frame.groups.some((g) => g.fx === 'hole')).toBe(true);
  });
});
