import type { Entity, World } from 'koota';
import { createBoxBody, createCircleBody, registerBody } from '../physics/bodies';
import type { BodyKind } from '../physics/categories';
import { getContext } from '../context';
import { HazardKind } from '../traits';

export type LateJoinBodyFlags = {
  isStatic: boolean;
  chainDeck: boolean;
  spikeStyle: number;
};

export type LateJoinBodySpec = {
  bodyType: 'static' | 'dynamic' | 'kinematic';
  shape: 'box' | 'circle' | 'none';
  hx: number;
  hy: number;
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  sensor: boolean;
  fixedRotation: boolean;
  bullet: boolean;
  fixtureKind: BodyKind;
};

/** Dynamic Appendix D kinds that late-join / mid-round spawn must not generic-box. */
export const DYNAMIC_APPENDIX_D_KINDS = [
  HazardKind.Crate,
  HazardKind.Barrel,
  HazardKind.Debris,
  HazardKind.Spikeball,
  HazardKind.Boss,
  HazardKind.Chain,
  HazardKind.Momentum,
  HazardKind.Collapsing,
] as const;

function box(partial: Partial<LateJoinBodySpec> & Pick<LateJoinBodySpec, 'bodyType' | 'hx' | 'hy'>): LateJoinBodySpec {
  const sensor = partial.sensor ?? false;
  return {
    shape: 'box',
    radius: 0,
    density: 0,
    friction: 0.6,
    restitution: 0,
    sensor,
    fixedRotation: partial.bodyType !== 'dynamic',
    bullet: false,
    fixtureKind: sensor ? 'sensor' : partial.bodyType === 'dynamic' ? 'prop' : 'solid',
    ...partial,
  };
}

function circle(
  partial: Partial<LateJoinBodySpec> & Pick<LateJoinBodySpec, 'bodyType' | 'radius'>,
): LateJoinBodySpec {
  return {
    shape: 'circle',
    hx: 0,
    hy: 0,
    density: 0,
    friction: 0.2,
    restitution: 0.05,
    sensor: false,
    fixedRotation: false,
    bullet: false,
    fixtureKind: 'prop',
    ...partial,
  };
}

/**
 * PLAN 4.13 + Appendix D: missing late-join hazards get the same body type
 * and material as `module.create`, never the generic density-1 prop.
 */
export function lateJoinBodySpec(
  kind: number,
  hz: { param0: number; param1: number; param2: number; param3: number },
  flags: LateJoinBodyFlags,
): LateJoinBodySpec {
  switch (kind) {
    case HazardKind.Crate:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.05, (hz.param0 || 1.1) / 2),
        hy: Math.max(0.05, (hz.param1 || 1.1) / 2),
        density: 0.5,
        friction: 0.5,
        restitution: 0.05,
        fixedRotation: false,
      });
    case HazardKind.Barrel:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.05, (hz.param0 || 0.8) / 2),
        hy: Math.max(0.05, (hz.param1 || 1.1) / 2),
        density: 0.5,
        friction: 0.5,
        restitution: 0.05,
        fixedRotation: false,
      });
    case HazardKind.Debris:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.04, (hz.param0 || 0.24) / 2),
        hy: Math.max(0.04, (hz.param1 || 0.24) / 2),
        density: 0.35,
        friction: 0.4,
        restitution: 0.15,
        fixedRotation: false,
      });
    case HazardKind.Boss:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.2, (hz.param0 || 2.2) / 2),
        hy: Math.max(0.2, (hz.param1 || 2) / 2),
        density: 1.2,
        friction: 0.4,
        fixedRotation: false,
      });
    case HazardKind.Spikeball: {
      const roll = flags.spikeStyle === 1 || hz.param2 === 1;
      return circle({
        bodyType: 'dynamic',
        radius: hz.param0 || 0.4,
        density: 0.8,
        friction: roll ? 0.05 : 0.2,
        restitution: roll ? 0.35 : 0.05,
        bullet: true,
      });
    }
    case HazardKind.Chain:
      if (flags.chainDeck || hz.param3 === 1) {
        return box({
          bodyType: 'dynamic',
          hx: Math.max(0.1, (hz.param0 || 2.8) / 2),
          hy: Math.max(0.08, (hz.param1 || 0.4) / 2),
          density: 0.45,
          friction: 1.15,
          fixedRotation: true,
        });
      }
      if (flags.isStatic) {
        return box({
          bodyType: 'static',
          hx: 0.1,
          hy: 0.1,
          density: 0,
          // Host `createBoxBody` default friction (not createStaticBox's 0.6).
          friction: 0.4,
          fixtureKind: 'solid',
        });
      }
      return box({
        bodyType: 'dynamic',
        hx: 0.08,
        hy: 0.16,
        density: 0.4,
        friction: 0.3,
        fixedRotation: false,
      });
    case HazardKind.Momentum:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.2, (hz.param0 || 4) / 2),
        hy: Math.max(0.1, (hz.param1 || 0.6) / 2),
        density: 0.35,
        friction: 0.8,
        fixedRotation: false,
        // Host `createKinematicBox({ dynamic: true })` uses the solid category.
        fixtureKind: 'solid',
      });
    case HazardKind.Collapsing:
      return box({
        bodyType: 'dynamic',
        hx: Math.max(0.2, (hz.param0 || 3) / 2),
        hy: 0.25,
        density: 0,
        friction: 0.8,
        fixedRotation: false,
        fixtureKind: 'solid',
      });
    case HazardKind.Crusher:
      return box({
        bodyType: 'kinematic',
        hx: hz.param2 || 0.75,
        hy: hz.param3 || 3,
        density: 0,
        friction: 0.8,
      });
    case HazardKind.Saw:
      return circle({
        bodyType: 'kinematic',
        radius: 0.45,
        density: 0,
        friction: 0.2,
        sensor: true,
        fixtureKind: 'sensor',
      });
    case HazardKind.Lava:
      return box({
        bodyType: 'kinematic',
        hx: Math.max(0.2, (hz.param1 || 4) / 2),
        hy: Math.max(0.2, (hz.param2 || 1.2) / 2),
        density: 0,
        friction: 0.4,
        sensor: true,
        fixtureKind: 'sensor',
      });
    case HazardKind.Ice:
      return box({
        bodyType: 'static',
        hx: Math.max(0.2, (hz.param0 || 6) / 2),
        hy: 0.25,
        density: 0,
        friction: 0.02,
        fixtureKind: 'solid',
      });
    case HazardKind.Spikes:
      return box({
        bodyType: 'static',
        hx: Math.max(0.2, (hz.param0 || 2) / 2),
        hy: 0.25,
        density: 0,
        friction: 0.6,
        sensor: true,
        fixtureKind: 'sensor',
      });
    case HazardKind.Destructible:
      return box({
        bodyType: 'static',
        hx: Math.max(0.2, (hz.param0 || 2) / 2),
        hy: Math.max(0.15, (hz.param1 || 2) / 2),
        density: 0,
        friction: 0.5,
        fixtureKind: 'solid',
      });
    case HazardKind.Conveyor:
      return box({
        bodyType: 'static',
        hx: Math.max(0.2, (hz.param0 || 6) / 2),
        hy: 0.2,
        density: 0,
        friction: 0.6,
        fixtureKind: 'solid',
      });
    case HazardKind.Solid:
      return box({
        bodyType: 'static',
        hx: Math.max(0.2, (hz.param0 || 2) / 2),
        hy: Math.max(0.15, (hz.param1 || 1) / 2),
        density: 0,
        friction: 0.6,
        fixtureKind: 'solid',
      });
    case HazardKind.MovingPlatform:
      return box({
        bodyType: 'kinematic',
        hx: Math.max(0.2, (hz.param1 || 4) / 2),
        hy: Math.max(0.1, (hz.param3 || 0.6) / 2),
        density: 0,
        friction: 0.8,
      });
    case HazardKind.RotatingPlatform:
      return box({
        bodyType: 'kinematic',
        hx: Math.max(0.2, (hz.param1 || 4) / 2),
        hy: Math.max(0.1, (hz.param2 || 0.6) / 2),
        density: 0,
        friction: 0.8,
      });
    case HazardKind.Disappearing:
      return box({
        bodyType: 'kinematic',
        hx: Math.max(0.2, (hz.param2 || 3) / 2),
        hy: Math.max(0.1, (hz.param3 || 0.5) / 2),
        density: 0,
        friction: 0.8,
      });
    case HazardKind.Laser:
    case HazardKind.TriggerDrop:
      return box({
        bodyType: 'static',
        shape: 'none',
        hx: 0,
        hy: 0,
        density: 0,
        friction: 0,
        fixtureKind: 'sensor',
      });
    default:
      if (flags.isStatic) {
        return box({
          bodyType: 'static',
          hx: Math.max(0.2, (hz.param0 || 2) / 2),
          hy: Math.max(0.15, (hz.param1 || 1) / 2),
          density: 0,
          friction: kind === HazardKind.Bounce ? 0.1 : 0.6,
          restitution: kind === HazardKind.Bounce ? 1.2 : 0,
          fixtureKind: 'solid',
        });
      }
      return box({
        bodyType: 'kinematic',
        hx: 1,
        hy: 0.5,
        density: 0,
        friction: 0.8,
      });
  }
}

export function createLateJoinHazardBody(
  world: World,
  entity: Entity,
  spec: LateJoinBodySpec,
  x: number,
  y: number,
  angle: number,
): void {
  if (spec.shape === 'none') return;
  const ctx = getContext(world);
  if (spec.shape === 'circle') {
    const body = createCircleBody(ctx.physics, entity, spec.fixtureKind, x, y, spec.radius, spec.bodyType, {
      density: spec.density,
      friction: spec.friction,
      restitution: spec.restitution,
      sensor: spec.sensor,
      bullet: spec.bullet,
    });
    registerBody(world, entity, body);
    return;
  }
  const body = createBoxBody(ctx.physics, entity, spec.fixtureKind, x, y, spec.hx, spec.hy, spec.bodyType, {
    density: spec.density,
    friction: spec.friction,
    restitution: spec.restitution,
    sensor: spec.sensor,
    fixedRotation: spec.fixedRotation,
    angle,
  });
  registerBody(world, entity, body);
}
