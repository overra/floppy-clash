import { PRIM_ROUNDED_BOX, type Primitive } from './sdf/primitives';

type LocalBox = { ox: number; oy: number; hx: number; hy: number; r: number };

/** PLAN §4.11: a weapon is 2–4 rounded boxes, aimed along the hold/body angle. */
export function weaponPrimitives(
  x: number,
  y: number,
  length: number,
  kind: string,
  angle: number,
): Primitive[] {
  const locals = recipe(kind, Math.max(0.2, length)).slice(0, 4);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return locals.map((b) => ({
    kind: PRIM_ROUNDED_BOX,
    ax: x + b.ox * c - b.oy * s,
    ay: y + b.ox * s + b.oy * c,
    bx: b.hx,
    by: b.hy,
    r: b.r,
    cx: angle,
  }));
}

function recipe(kind: string, L: number): LocalBox[] {
  switch (kind) {
    case 'fists':
      return [
        { ox: 0.1, oy: 0.05, hx: 0.08, hy: 0.045, r: 0.03 },
        { ox: 0.1, oy: -0.05, hx: 0.08, hy: 0.045, r: 0.03 },
      ];
    case 'revolver':
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.3, hy: 0.04, r: 0.02 },
        { ox: 0.02, oy: -0.1, hx: 0.035, hy: 0.09, r: 0.02 },
        { ox: L * 0.1, oy: 0, hx: 0.07, hy: 0.07, r: 0.03 },
      ];
    case 'uzi':
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.3, hy: 0.04, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.035, hy: 0.09, r: 0.02 },
        { ox: L * 0.08, oy: -0.08, hx: 0.03, hy: 0.07, r: 0.015 },
      ];
    case 'ak47':
    case 'm16':
    case 'm1':
    case 'sniper':
    case 'laser':
    case 'minigun':
    case 'bouncer':
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.38, hy: 0.045, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.04, hy: 0.1, r: 0.02 },
        { ox: -L * 0.22, oy: -0.02, hx: L * 0.16, hy: 0.04, r: 0.02 },
        { ox: L * 0.05, oy: -0.08, hx: 0.035, hy: 0.07, r: 0.015 },
      ];
    case 'sawed-off':
    case 'military-shotgun':
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.32, hy: 0.055, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.04, hy: 0.09, r: 0.02 },
        { ox: L * 0.12, oy: -0.04, hx: 0.08, hy: 0.035, r: 0.015 },
      ];
    case 'grenade-launcher':
    case 'thruster':
    case 'rpg':
    case 'snake-launcher':
    case 'lava-spike-ball':
      return [
        { ox: L * 0.22, oy: 0, hx: L * 0.32, hy: 0.08, r: 0.04 },
        { ox: 0, oy: -0.1, hx: 0.04, hy: 0.09, r: 0.02 },
        { ox: -L * 0.2, oy: 0, hx: 0.1, hy: 0.07, r: 0.03 },
      ];
    case 'sword':
    case 'spear':
    case 'blink-dagger':
      return [
        { ox: L * 0.38, oy: 0, hx: L * 0.4, hy: kind === 'spear' ? 0.025 : 0.035, r: 0.01 },
        { ox: -0.02, oy: 0, hx: 0.07, hy: 0.03, r: 0.01 },
        { ox: -0.14, oy: 0, hx: 0.07, hy: 0.04, r: 0.015 },
      ];
    case 'time-bubble':
    case 'black-hole':
      return [
        { ox: L * 0.2, oy: 0, hx: 0.12, hy: 0.12, r: 0.08 },
        { ox: -0.06, oy: -0.08, hx: 0.04, hy: 0.08, r: 0.02 },
      ];
    case 'flamethrower':
    case 'lava-stream':
    case 'lava-spray':
    case 'lava-beam':
      return [
        { ox: L * 0.3, oy: 0, hx: L * 0.32, hy: 0.05, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.04, hy: 0.09, r: 0.02 },
        { ox: -0.08, oy: 0.04, hx: 0.1, hy: 0.07, r: 0.04 },
      ];
    case 'snake-gun':
    case 'snake-shotgun':
    case 'snake-grenade':
    case 'snake-minigun':
    case 'flying-snake':
    case 'glue-gun':
    case 'ice-gun':
    case 'lava-spike-gun':
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.3, hy: 0.045, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.035, hy: 0.09, r: 0.02 },
        { ox: L * 0.08, oy: 0.05, hx: 0.06, hy: 0.04, r: 0.02 },
      ];
    default:
      return [
        { ox: L * 0.28, oy: 0, hx: L * 0.32, hy: 0.04, r: 0.02 },
        { ox: 0, oy: -0.1, hx: 0.035, hy: 0.09, r: 0.02 },
      ];
  }
}
