import type { ThemePalette } from '../sim/level/themes';
import { HazardKind, ShapeKind } from '../sim/traits';
import { Layer, group, type ShapeGroup } from './frame';
import { PRIM_CAPSULE, PRIM_DISK, PRIM_PIE, PRIM_ROUNDED_BOX, PRIM_TRIANGLE, shade, withAlpha, type Primitive } from './sdf/primitives';

export type HazardVisual = {
  kind: number;
  x: number;
  y: number;
  angle: number;
  shape: { kind: number; hx: number; hy: number; r: number };
  hz: { param0: number; param1: number; param2: number; param3: number; hp: number; armed: number };
  /** 0–1 remaining health for destructibles, 1 when not destructible. */
  health: number;
  tick: number;
  time: number;
};

const INK = '#1b1c22';
const STEEL = '#c9ced8';
const STEEL_DARK = '#7d838f';
const CRATE = '#b9783a';
const CRATE_DARK = '#7a4a1f';
const BARREL = '#c8362b';
const ICE = '#bfe6ff';

function disk(cx: number, cy: number, r: number): Primitive {
  return { kind: PRIM_DISK, ax: cx, ay: cy, bx: cx, by: cy, r };
}
function cap(ax: number, ay: number, bx: number, by: number, r: number): Primitive {
  return { kind: PRIM_CAPSULE, ax, ay, bx, by, r };
}
function rbox(cx: number, cy: number, hx: number, hy: number, r = 0.05, rot = 0): Primitive {
  return { kind: PRIM_ROUNDED_BOX, ax: cx, ay: cy, bx: hx, by: hy, r, rot };
}
function tri(cx: number, cy: number, halfBase: number, height: number, rot = 0, r = 0.015): Primitive {
  return { kind: PRIM_TRIANGLE, ax: cx, ay: cy, bx: halfBase, by: height, r, rot };
}
function pie(cx: number, cy: number, r: number, half: number, rot = 0): Primitive {
  return { kind: PRIM_PIE, ax: cx, ay: cy, bx: half, by: 0, r, rot };
}

/** Rotate a local offset by `a` and translate to (x, y). */
function at(x: number, y: number, a: number, lx: number, ly: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}

/** Solid platform: silhouette body plus a themed cap along its top edge. */
function solidGroups(v: HazardVisual, theme: ThemePalette, opts: { cap?: boolean; color?: string; capColor?: string; radius?: number } = {}): ShapeGroup[] {
  const { hx, hy } = v.shape;
  const r = opts.radius ?? Math.min(0.14, hx, hy);
  const body = rbox(v.x, v.y, hx, hy, r, v.angle);
  const out = [group([body], opts.color ?? theme.solid, Layer.Solids, { style: 'shaded' })];
  if (opts.cap !== false && hy > 0.12) {
    const capH = Math.min(0.13, hy * 0.5);
    const c = at(v.x, v.y, v.angle, 0, hy - capH);
    out.push(group([rbox(c.x, c.y, hx - r * 0.35, capH, Math.min(capH, 0.08), v.angle)], opts.capColor ?? theme.trim, Layer.Solids, { style: 'flat' }));
  }
  return out;
}

export function hazardGroups(v: HazardVisual, theme: ThemePalette): ShapeGroup[] {
  const { hx, hy } = v.shape;
  switch (v.kind) {
    case HazardKind.Solid:
      return solidGroups(v, theme);

    case HazardKind.Destructible: {
      const out = solidGroups(v, theme, { color: shade(theme.solid, 0.12), capColor: shade(theme.trim, -0.1) });
      const dmg = 1 - v.health;
      if (dmg > 0.05) {
        const cracks: Primitive[] = [];
        const n = Math.min(5, 1 + Math.floor(dmg * 5));
        for (let i = 0; i < n; i++) {
          const a = at(v.x, v.y, v.angle, (((i * 37) % 17) / 17 - 0.5) * hx * 1.5, (((i * 53) % 13) / 13 - 0.5) * hy * 1.4);
          const b = at(a.x, a.y, v.angle + i * 1.3, 0.25 + dmg * 0.4, 0.15);
          cracks.push(cap(a.x, a.y, b.x, b.y, 0.03));
        }
        out.push(group(cracks, INK, Layer.Solids, { style: 'flat' }));
      }
      return out;
    }

    case HazardKind.Crate: {
      const body = rbox(v.x, v.y, hx, hy, 0.06, v.angle);
      const a = at(v.x, v.y, v.angle, -hx * 0.7, -hy * 0.7);
      const b = at(v.x, v.y, v.angle, hx * 0.7, hy * 0.7);
      const c = at(v.x, v.y, v.angle, -hx * 0.7, hy * 0.7);
      const d = at(v.x, v.y, v.angle, hx * 0.7, -hy * 0.7);
      return [
        group([body], CRATE, Layer.Props, { style: 'shaded' }),
        group([rbox(v.x, v.y, hx, hy, 0.06, v.angle)], CRATE_DARK, Layer.Props, { style: 'outline' }),
        group([cap(a.x, a.y, b.x, b.y, 0.05), cap(c.x, c.y, d.x, d.y, 0.05)], CRATE_DARK, Layer.Props, { style: 'flat' }),
      ];
    }

    case HazardKind.Spikes: {
      const w = hx * 2;
      const n = Math.max(2, Math.round(w / 0.42));
      const spacing = w / n;
      const base = rbox(v.x, v.y - hy + 0.09, hx, 0.09, 0.03, v.angle);
      const teeth: Primitive[] = [];
      // The sensor is a thin strip; the teeth are drawn tall enough to read as lethal.
      const toothH = Math.max(0.55, hy * 2 - 0.1);
      for (let i = 0; i < n && i < 15; i++) {
        const p = at(v.x, v.y, v.angle, -hx + spacing * (i + 0.5), -hy + 0.12);
        teeth.push(tri(p.x, p.y, spacing * 0.46, toothH, v.angle));
      }
      return [group([base], STEEL_DARK, Layer.Hazards, { style: 'flat' }), group(teeth, theme.hazard, Layer.Hazards, { style: 'shaded' })];
    }

    case HazardKind.Lava: {
      const body = rbox(v.x, v.y, hx, hy, 0.08, 0);
      const bubbles: Primitive[] = [];
      const n = Math.min(10, Math.max(2, Math.round(hx)));
      for (let i = 0; i < n; i++) {
        const bx = v.x - hx + ((i + 0.5) / n) * hx * 2 + Math.sin(v.time * 1.3 + i * 2.1) * 0.25;
        const by = v.y + hy - 0.05 + Math.abs(Math.sin(v.time * 2.2 + i * 1.7)) * 0.22;
        bubbles.push(disk(bx, by, 0.12 + 0.08 * Math.abs(Math.sin(v.time * 1.1 + i))));
      }
      return [
        group([body, ...bubbles], '#ff5a1a', Layer.Hazards, { blend: 'smoothUnion', smoothK: 0.3, fx: 'lava', style: 'flat', glow: 1.0 }),
        group([rbox(v.x, v.y - hy * 0.45, hx * 0.98, hy * 0.5, 0.05, 0)], withAlpha('#b02a08', 0.55), Layer.Hazards, { style: 'flat' }),
      ];
    }

    case HazardKind.Saw: {
      const r = v.shape.r || hx;
      const teeth: Primitive[] = [];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = v.angle + (i / n) * Math.PI * 2;
        const p = at(v.x, v.y, a, 0, r - 0.05);
        teeth.push(tri(p.x, p.y, r * 0.2, r * 0.42, a, 0.01));
      }
      return [
        group([disk(v.x, v.y, r), ...teeth], STEEL, Layer.Hazards, { style: 'shaded' }),
        group([disk(v.x, v.y, r * 0.62)], STEEL_DARK, Layer.Hazards, { style: 'outline' }),
        group([disk(v.x, v.y, r * 0.22), pie(v.x, v.y, r * 0.55, 0.35, v.angle), pie(v.x, v.y, r * 0.55, 0.35, v.angle + Math.PI)], INK, Layer.Hazards, { style: 'flat' }),
      ];
    }

    case HazardKind.MovingPlatform: {
      const out = solidGroups(v, theme, { color: shade(theme.solid, 0.08) });
      const under = at(v.x, v.y, v.angle, 0, -hy + 0.06);
      out.push(group([rbox(under.x, under.y, hx * 0.9, 0.05, 0.03, v.angle)], theme.accent, Layer.Solids, { style: 'flat' }));
      return out;
    }

    case HazardKind.RotatingPlatform: {
      const out = solidGroups(v, theme, { color: shade(theme.solid, 0.08) });
      out.push(group([disk(v.x, v.y, Math.min(0.22, hy * 0.9))], STEEL_DARK, Layer.Solids, { style: 'flat' }));
      out.push(group([disk(v.x, v.y, Math.min(0.09, hy * 0.4))], INK, Layer.Solids, { style: 'flat' }));
      return out;
    }

    case HazardKind.Disappearing: {
      const period = v.hz.param0 || 180;
      const phase = (v.tick + (v.hz.param1 || 0)) % period;
      const solidUntil = period * 0.55;
      let alpha: number;
      if (v.hz.armed) {
        const left = solidUntil - phase;
        alpha = left < 30 ? 0.35 + 0.65 * Math.abs(Math.sin(left * 0.6)) : 1;
      } else {
        alpha = 0.12;
      }
      const color = withAlpha(shade(theme.solid, 0.15), alpha);
      const out = [group([rbox(v.x, v.y, hx, hy, 0.1, v.angle)], color, Layer.Solids, { style: alpha < 0.3 ? 'outline' : 'shaded' })];
      if (alpha > 0.3) out.push(group([rbox(v.x, v.y + hy - 0.07, hx * 0.95, 0.07, 0.05, v.angle)], withAlpha(theme.accent, alpha), Layer.Solids, { style: 'flat' }));
      return out;
    }

    case HazardKind.Collapsing: {
      const stress = v.hz.armed ? Math.min(1, v.hz.param1 / Math.max(1, v.hz.param2 || 20)) : 1;
      const jitter = v.hz.armed && stress > 0 ? Math.sin(v.tick * 1.7) * 0.03 * stress : 0;
      const out = solidGroups({ ...v, x: v.x + jitter }, theme, { color: shade(theme.solid, 0.05) });
      if (stress > 0.3) {
        const a = at(v.x, v.y, v.angle, -hx * 0.3, hy * 0.6);
        const b = at(v.x, v.y, v.angle, hx * 0.1, -hy * 0.5);
        const c = at(v.x, v.y, v.angle, hx * 0.5, hy * 0.2);
        out.push(group([cap(a.x, a.y, b.x, b.y, 0.03), cap(b.x, b.y, c.x, c.y, 0.025)], INK, Layer.Solids, { style: 'flat' }));
      }
      return out;
    }

    case HazardKind.Momentum:
      return [
        ...solidGroups(v, theme, { color: shade(theme.solid, -0.1), cap: false }),
        group([rbox(v.x, v.y, hx, hy, 0.1, v.angle)], STEEL_DARK, Layer.Solids, { style: 'outline' }),
      ];

    case HazardKind.Chain: {
      if (v.shape.kind === ShapeKind.Box && hy > hx) {
        // link
        return [group([rbox(v.x, v.y, hx, hy, hx, v.angle)], STEEL, Layer.Props, { style: 'outline' }), group([rbox(v.x, v.y, hx * 0.55, hy * 0.75, hx * 0.5, v.angle)], STEEL_DARK, Layer.Props, { style: 'flat' })];
      }
      // anchor
      return [group([rbox(v.x, v.y, 0.18, 0.12, 0.04, 0)], STEEL_DARK, Layer.Props, { style: 'shaded' })];
    }

    case HazardKind.Barrel: {
      const dmg = 1 - v.health;
      const color = shade(BARREL, dmg * 0.25);
      const b1 = at(v.x, v.y, v.angle, 0, hy * 0.45);
      const b2 = at(v.x, v.y, v.angle, 0, -hy * 0.45);
      return [
        group([rbox(v.x, v.y, hx, hy, Math.min(0.12, hx * 0.4), v.angle)], color, Layer.Props, { style: 'shaded' }),
        group([rbox(b1.x, b1.y, hx, 0.05, 0.02, v.angle), rbox(b2.x, b2.y, hx, 0.05, 0.02, v.angle)], INK, Layer.Props, { style: 'flat' }),
        group([tri(v.x, v.y - hy * 0.2, hx * 0.42, hy * 0.42, v.angle, 0.02)], '#f2c14e', Layer.Props, { style: 'flat' }),
        group([disk(v.x, v.y + hy * 0.02, 0.05)], INK, Layer.Props, { style: 'flat' }),
      ];
    }

    case HazardKind.Laser: {
      const reach = v.hz.param3 || 14;
      const onTicks = v.hz.param0 || 90;
      const offTicks = v.hz.param1 || 90;
      const cycle = onTicks + offTicks;
      const phase = (v.tick + (v.hz.param2 || 0)) % cycle;
      const on = v.hz.armed === 1;
      const emitter = [rbox(v.x - 0.1, v.y, 0.22, 0.28, 0.06, 0), disk(v.x + 0.12, v.y, 0.11)];
      const out = [group(emitter, INK, Layer.Hazards, { style: 'shaded' }), group([disk(v.x + 0.12, v.y, 0.06)], on ? theme.hazard : withAlpha(theme.hazard, 0.4), Layer.Hazards, { style: 'flat', fx: on ? 'glow' : undefined, glow: 0.3 })];
      if (on) {
        const flicker = 0.85 + 0.15 * Math.sin(v.time * 40);
        out.push(group([cap(v.x + 0.2, v.y, v.x + reach, v.y, 0.11 * flicker)], withAlpha(theme.hazard, 0.9), Layer.Hazards, { style: 'flat', fx: 'glow', glow: 0.8 }));
        out.push(group([cap(v.x + 0.2, v.y, v.x + reach, v.y, 0.035)], '#ffffff', Layer.Hazards, { style: 'flat' }));
      } else {
        const warn = onTicks - phase; // ticks until the beam turns on
        const a = warn < 45 ? 0.15 + 0.35 * Math.abs(Math.sin(warn * 0.5)) : 0.12;
        out.push(group([cap(v.x + 0.2, v.y, v.x + reach, v.y, 0.02)], withAlpha(theme.hazard, a), Layer.Hazards, { style: 'flat' }));
      }
      return out;
    }

    case HazardKind.Conveyor: {
      const speed = v.hz.param1 || 4;
      const dir = Math.sign(speed) || 1;
      const out = solidGroups(v, theme, { color: shade(theme.solid, -0.05), cap: false });
      const spacing = 0.7;
      const offset = ((v.time * Math.abs(speed) * 0.5) % spacing) * dir;
      const chevrons: Primitive[] = [];
      for (let i = -Math.ceil(hx / spacing) - 1; i <= Math.ceil(hx / spacing) + 1 && chevrons.length < 16; i++) {
        const cx = v.x + i * spacing + offset;
        if (Math.abs(cx - v.x) > hx - 0.25) continue;
        chevrons.push(tri(cx, v.y, 0.14, 0.26, dir > 0 ? -Math.PI / 2 : Math.PI / 2));
      }
      out.push(group(chevrons, theme.accent, Layer.Solids, { style: 'flat' }));
      out.push(group([disk(v.x - hx + 0.15, v.y, Math.min(hy, 0.18)), disk(v.x + hx - 0.15, v.y, Math.min(hy, 0.18))], STEEL_DARK, Layer.Solids, { style: 'flat' }));
      return out;
    }

    case HazardKind.Ice: {
      const out = solidGroups(v, theme, { color: ICE, capColor: '#ffffff', radius: 0.12 });
      const a = at(v.x, v.y, v.angle, -hx * 0.55, hy * 0.2);
      const b = at(v.x, v.y, v.angle, -hx * 0.25, -hy * 0.35);
      const c = at(v.x, v.y, v.angle, hx * 0.2, hy * 0.3);
      const d = at(v.x, v.y, v.angle, hx * 0.45, -hy * 0.3);
      out.push(group([cap(a.x, a.y, b.x, b.y, 0.02), cap(c.x, c.y, d.x, d.y, 0.02)], withAlpha('#ffffff', 0.55), Layer.Solids, { style: 'flat' }));
      return out;
    }

    case HazardKind.Bounce: {
      const pad = '#67d98a';
      const bob = Math.abs(Math.sin(v.time * 6)) * 0.03;
      return [
        group([rbox(v.x, v.y - hy * 0.3, hx, hy * 0.7, 0.05, v.angle)], theme.solid, Layer.Solids, { style: 'shaded' }),
        group([rbox(v.x, v.y + hy * 0.55 + bob, hx * 0.96, hy * 0.45, Math.min(0.12, hy * 0.4), v.angle)], pad, Layer.Solids, { style: 'shaded' }),
        group([cap(v.x - hx * 0.5, v.y - hy * 0.9, v.x - hx * 0.3, v.y + hy * 0.1, 0.03), cap(v.x + hx * 0.3, v.y - hy * 0.9, v.x + hx * 0.5, v.y + hy * 0.1, 0.03)], STEEL_DARK, Layer.Solids, { style: 'flat' }),
      ];
    }

    case HazardKind.Spikeball: {
      const r = v.shape.r || hx;
      const spikes: Primitive[] = [];
      for (let i = 0; i < 10; i++) {
        const a = v.angle + (i / 10) * Math.PI * 2;
        const p = at(v.x, v.y, a, 0, r * 0.75);
        spikes.push(tri(p.x, p.y, r * 0.28, r * 0.75, a));
      }
      return [group([disk(v.x, v.y, r * 0.85), ...spikes], INK, Layer.Hazards, { style: 'shaded' }), group([disk(v.x, v.y, r * 0.35)], STEEL_DARK, Layer.Hazards, { style: 'flat' })];
    }

    case HazardKind.Crusher: {
      const teeth: Primitive[] = [];
      const n = Math.max(2, Math.min(8, Math.round(hx / 0.35)));
      for (let i = 0; i < n; i++) {
        const p = at(v.x, v.y, v.angle, -hx + ((i + 0.5) / n) * hx * 2, -hy + 0.02);
        teeth.push(tri(p.x, p.y, (hx / n) * 0.8, 0.3, v.angle + Math.PI));
      }
      return [
        group([rbox(v.x, v.y, hx, hy, 0.06, v.angle)], shade(theme.solid, 0.1), Layer.Hazards, { style: 'shaded' }),
        group([rbox(v.x, v.y, hx * 0.8, hy * 0.75, 0.04, v.angle)], STEEL_DARK, Layer.Hazards, { style: 'outline' }),
        group(teeth, STEEL, Layer.Hazards, { style: 'shaded' }),
      ];
    }

    case HazardKind.TriggerDrop:
      return [];

    default:
      return solidGroups(v, theme);
  }
}
