import { PRIM_CAPSULE, PRIM_DISK, PRIM_ROUNDED_BOX, PRIM_TRIANGLE, type Primitive } from './sdf/primitives';

/**
 * Weapon silhouettes in a local frame: origin at the grip (the hand), barrel along +x,
 * grip hanging below. `placeWeapon` rotates/mirrors them into world space.
 * All weapons are dark ink with a small family accent so pickups read from across the arena.
 */
export type WeaponLook = {
  body: Primitive[];
  accent: Primitive[];
  accentColor: string;
  /** Muzzle point in local space. */
  muzzle: { x: number; y: number };
  glow?: boolean;
};

export const WEAPON_INK = '#23252b';

const H = 0.075; // half height of a typical receiver

function rbox(cx: number, cy: number, hx: number, hy: number, r = 0.03, rot = 0): Primitive {
  return { kind: PRIM_ROUNDED_BOX, ax: cx, ay: cy, bx: hx, by: hy, r, rot };
}
function cap(ax: number, ay: number, bx: number, by: number, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax, ay, bx, by, r };
}
function disk(cx: number, cy: number, r: number): Primitive {
  return { kind: PRIM_DISK, ax: cx, ay: cy, bx: cx, by: cy, r };
}
function tri(cx: number, cy: number, halfBase: number, height: number, rot: number): Primitive {
  return { kind: PRIM_TRIANGLE, ax: cx, ay: cy, bx: halfBase, by: height, r: 0.01, rot };
}

function pistol(len: number, accent: string, opts: { cylinder?: boolean; long?: boolean; mag?: boolean } = {}): WeaponLook {
  const body = [rbox(len * 0.4, 0.02, len * 0.42, H * 0.9, 0.03), cap(0.02, -0.02, -0.06, -0.24, 0.055)];
  if (opts.long) body.push(rbox(len * 0.78, 0.045, len * 0.24, 0.035, 0.02));
  if (opts.mag) body.push(rbox(0.1, -0.2, 0.045, 0.13, 0.02));
  const accentPrims = opts.cylinder ? [disk(len * 0.3, 0.0, 0.07)] : [rbox(len * 0.62, 0.075, 0.03, 0.02, 0.01)];
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.82, y: 0.03 } };
}

function rifle(len: number, accent: string, opts: { scope?: boolean; drum?: boolean; carbine?: boolean } = {}): WeaponLook {
  const body = [
    rbox(len * 0.32, 0.0, len * 0.36, H, 0.03), // receiver
    cap(len * 0.6, 0.02, len * 0.98, 0.02, 0.035), // barrel
    rbox(-len * 0.14, -0.045, len * 0.16, 0.06, 0.03, 0.12), // stock
    cap(0.0, -0.02, -0.05, -0.22, 0.05), // grip
    rbox(len * 0.34, -0.17, 0.05, 0.12, 0.02, -0.25), // magazine
  ];
  const accentPrims: Primitive[] = [];
  if (opts.scope) accentPrims.push(cap(len * 0.2, 0.12, len * 0.5, 0.12, 0.035));
  else accentPrims.push(rbox(len * 0.9, 0.06, 0.02, 0.03, 0.01));
  if (opts.drum) body.push(disk(len * 0.36, -0.14, 0.11));
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.98, y: 0.02 } };
}

function shotgun(len: number, accent: string, opts: { double?: boolean; sawed?: boolean } = {}): WeaponLook {
  const body = [
    rbox(len * 0.25, 0.0, len * 0.3, H * 1.1, 0.03),
    cap(len * 0.5, 0.045, len * 0.98, 0.045, 0.04),
    cap(len * 0.5, -0.03, len * 0.98, -0.03, opts.double ? 0.04 : 0.025),
    cap(0.0, -0.02, -0.05, -0.2, 0.05),
  ];
  if (!opts.sawed) body.push(rbox(-len * 0.14, -0.04, len * 0.16, 0.06, 0.03, 0.14));
  const accentPrims = [rbox(len * 0.62, -0.045, len * 0.1, 0.045, 0.02)]; // pump / fore-grip
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.98, y: 0.02 } };
}

function launcher(len: number, accent: string, opts: { cone?: boolean; fat?: boolean } = {}): WeaponLook {
  const r = opts.fat ? 0.12 : 0.09;
  const body = [cap(-len * 0.1, 0.03, len * 0.88, 0.03, r), cap(0.05, -0.05, -0.02, -0.24, 0.05), rbox(len * 0.4, -0.15, 0.04, 0.08, 0.02)];
  const accentPrims: Primitive[] = [rbox(len * 0.15, 0.03, 0.03, r + 0.02, 0.01)];
  if (opts.cone) accentPrims.push(tri(len * 0.9, 0.03, r * 1.1, 0.22, -Math.PI / 2));
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.95, y: 0.03 } };
}

function minigun(len: number, accent: string): WeaponLook {
  const body = [
    rbox(len * 0.2, 0.0, len * 0.26, 0.13, 0.05),
    cap(len * 0.45, 0.08, len * 0.98, 0.08, 0.035),
    cap(len * 0.45, 0.0, len * 0.98, 0.0, 0.035),
    cap(len * 0.45, -0.08, len * 0.98, -0.08, 0.035),
    cap(0.0, -0.06, -0.04, -0.26, 0.05),
    rbox(len * 0.15, 0.2, 0.08, 0.03, 0.02), // top handle
  ];
  const accentPrims = [disk(len * 0.46, 0.0, 0.11)];
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.98, y: 0 } };
}

function sprayer(len: number, accent: string, glow = false): WeaponLook {
  const body = [
    rbox(len * 0.3, 0.0, len * 0.3, 0.085, 0.04),
    cap(len * 0.55, 0.02, len * 0.98, 0.02, 0.05),
    cap(0.0, -0.03, -0.05, -0.22, 0.05),
    disk(-len * 0.1, 0.1, 0.13), // tank
  ];
  const accentPrims = [disk(len * 0.98, 0.02, 0.055), rbox(len * 0.3, 0.0, 0.05, 0.045, 0.02)];
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 1.0, y: 0.02 }, glow };
}

function blade(len: number, accent: string, opts: { spear?: boolean; dagger?: boolean } = {}): WeaponLook {
  if (opts.spear) {
    const body = [cap(-len * 0.35, 0, len * 0.55, 0, 0.03)];
    const accentPrims = [tri(len * 0.56, 0, 0.07, 0.3, -Math.PI / 2)];
    return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.7, y: 0 } };
  }
  const bladeLen = opts.dagger ? len * 0.85 : len * 0.8;
  const body = [cap(-0.02, -0.02, -0.08, -0.2, 0.045), rbox(0.02, 0.0, 0.03, 0.1, 0.02)];
  const accentPrims = [cap(0.06, 0.0, 0.06 + bladeLen, 0.0, opts.dagger ? 0.035 : 0.045)];
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: 0.06 + bladeLen, y: 0 } };
}

function orbGun(len: number, accent: string): WeaponLook {
  const body = [rbox(len * 0.25, 0.0, len * 0.28, H, 0.03), cap(0.0, -0.02, -0.05, -0.22, 0.05), rbox(len * 0.62, 0.0, 0.03, 0.14, 0.02)];
  const accentPrims = [disk(len * 0.82, 0.0, 0.11)];
  return { body, accent: accentPrims, accentColor: accent, muzzle: { x: len * 0.95, y: 0 }, glow: true };
}

const SNAKE = '#7fd14a';
const LAVA = '#ff7a1a';
const STEEL = '#9aa3b2';
const GOLD = '#f2c14e';
const ICE = '#8fd6ff';
const LASER = '#39f2ff';
const VOID = '#a05cff';

export function weaponLook(kind: string, length: number): WeaponLook {
  switch (kind) {
    case 'pistol':
      return pistol(length, STEEL);
    case 'deagle':
      return pistol(length, STEEL, { long: true });
    case 'revolver':
      return pistol(length, '#c9a227', { cylinder: true });
    case 'god-pistol':
      return { ...pistol(length, GOLD, { long: true }), glow: true };
    case 'uzi':
      return pistol(length, STEEL, { mag: true });
    case 'glue-gun':
      return pistol(length, '#ffe27a', { mag: true });
    case 'ice-gun':
      return pistol(length, ICE, { long: true });
    case 'ak47':
      return rifle(length, '#b4713b');
    case 'm16':
      return rifle(length, STEEL);
    case 'm1':
      return rifle(length, '#b4713b', { carbine: true });
    case 'sniper':
      return rifle(length, '#ff4d6d', { scope: true });
    case 'laser':
      return { ...rifle(length, LASER), glow: true };
    case 'snake-gun':
      return pistol(length, SNAKE, { long: true });
    case 'snake-shotgun':
      return shotgun(length, SNAKE, { double: true });
    case 'snake-minigun':
      return minigun(length, SNAKE);
    case 'snake-launcher':
    case 'flying-snake':
      return launcher(length, SNAKE);
    case 'snake-grenade':
      return launcher(length, SNAKE, { fat: true });
    case 'sawed-off':
      return shotgun(length, '#b4713b', { double: true, sawed: true });
    case 'military-shotgun':
      return shotgun(length, STEEL);
    case 'grenade-launcher':
      return launcher(length, '#6b8e3d', { fat: true });
    case 'bouncer':
      return launcher(length, '#ff9b3d', { fat: true });
    case 'rpg':
      return launcher(length, '#8a8f99', { cone: true });
    case 'lava-spike-ball':
      return launcher(length, LAVA, { fat: true });
    case 'lava-spike-gun':
      return { ...rifle(length, LAVA), glow: true };
    case 'lava-beam':
      return { ...rifle(length, LAVA, { scope: true }), glow: true };
    case 'lava-stream':
    case 'lava-spray':
      return sprayer(length, LAVA, true);
    case 'flamethrower':
      return sprayer(length, '#ff5a1a', true);
    case 'thruster':
      return sprayer(length, '#39a0ff', true);
    case 'minigun':
      return minigun(length, STEEL);
    case 'sword':
      return blade(length, '#dfe6f0');
    case 'spear':
      return blade(length, '#dfe6f0', { spear: true });
    case 'blink-dagger':
      return blade(length, VOID, { dagger: true });
    case 'time-bubble':
      return orbGun(length, '#7ae7ff');
    case 'black-hole':
      return orbGun(length, VOID);
    case 'slugger':
      return bat(length);
    case 'mallet':
      return mallet(length);
    case 'walker-mine':
      return launcher(length, '#4a4f58', { fat: true });
    case 'repulsor-puck':
      return orbGun(length, '#67d98a');
    default:
      return pistol(length, STEEL);
  }
}

/** A bat: a grip that swells into a barrel toward the tip. */
function bat(len: number): WeaponLook {
  const body = [cap(-0.1, 0, len * 0.45, 0, 0.04), cap(-0.14, 0, -0.1, 0, 0.055)];
  const accentPrims = [cap(len * 0.4, 0, len * 0.92, 0, 0.075)];
  return { body, accent: accentPrims, accentColor: '#c98f4a', muzzle: { x: len * 0.95, y: 0 } };
}

/** A mallet: a long handle with a squared head across the end. */
function mallet(len: number): WeaponLook {
  const body = [cap(-0.1, 0, len * 0.78, 0, 0.035)];
  const accentPrims = [rbox(len * 0.82, 0, 0.14, 0.24, 0.04)];
  return { body, accent: accentPrims, accentColor: '#8a5a2b', muzzle: { x: len * 0.96, y: 0 } };
}

/** Transform local-frame primitives to world space (mirror across the barrel axis when aiming left). */
export function placeWeapon(prims: Primitive[], x: number, y: number, angle: number, flip: boolean): Primitive[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const fy = flip ? -1 : 1;
  const map = (lx: number, ly: number) => ({ x: x + lx * c - ly * fy * s, y: y + lx * s + ly * fy * c });
  return prims.map((p) => {
    if (p.kind === PRIM_DISK) {
      const q = map(p.ax, p.ay);
      return { ...p, ax: q.x, ay: q.y, bx: q.x, by: q.y };
    }
    if (p.kind === PRIM_CAPSULE) {
      const a = map(p.ax, p.ay);
      const b = map(p.bx, p.by);
      return { ...p, ax: a.x, ay: a.y, bx: b.x, by: b.y };
    }
    const q = map(p.ax, p.ay);
    // Mirroring across the barrel axis sends a shape's "up" direction θ to π − θ (boxes are π-symmetric).
    const local = flip ? Math.PI - (p.rot ?? 0) : (p.rot ?? 0);
    return { ...p, ax: q.x, ay: q.y, rot: angle + local };
  });
}

export function worldMuzzle(look: WeaponLook, x: number, y: number, angle: number, flip: boolean): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const fy = flip ? -1 : 1;
  return { x: x + look.muzzle.x * c - look.muzzle.y * fy * s, y: y + look.muzzle.x * s + look.muzzle.y * fy * c };
}
