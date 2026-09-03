import { z } from 'zod';
import { holdAmmoFromSeconds } from './mapping';

export const WeaponDefSchema = z
  .object({
    id: z.string(),
    displayName: z.string().optional(),
    category: z.enum(['melee', 'pistol', 'rifle', 'explosive', 'snake', 'lava', 'other']),
    ammo: z.number(),
    /** PLAN hold-to-fire duration. When set, ammo must equal holdAmmoFromSeconds(holdSeconds, fireIntervalTicks). */
    holdSeconds: z.number().optional(),
    fireMode: z.enum(['semi', 'auto', 'burst', 'hold']),
    fireIntervalTicks: z.number(),
    burstCount: z.number().optional(),
    projectile: z.object({
      kind: z.enum(['bullet', 'pellets', 'grenade', 'rocket', 'beam', 'melee', 'field', 'creature', 'burst-into']),
      speed: z.number().default(40),
      /** Display / fallback. Live damage uses damageMin/Max when present (see mapping.ts). */
      damage: z.number(),
      damageMin: z.number().optional(),
      damageMax: z.number().optional(),
      spreadDeg: z.number().default(0),
      count: z.number().default(1),
      gravity: z.number().default(0),
      bounce: z.number().default(0),
      fuse: z.number().default(0),
      radius: z.number().default(0),
      explodeDamage: z.number().default(0),
      explodeDamageMin: z.number().optional(),
      explodeDamageMax: z.number().optional(),
      explodeImpulse: z.number().default(0),
      status: z.enum(['none', 'burn', 'slow', 'glue', 'bubble']).default('none'),
      burstInto: z.string().optional(),
      burstCount: z.number().optional(),
      burstDamageMin: z.number().optional(),
      burstDamageMax: z.number().optional(),
      warningTicks: z.number().default(0),
      beamTicks: z.number().default(0),
      rare: z.boolean().default(false),
    }),
    recoil: z.object({ back: z.number().default(0), up: z.number().default(0), forward: z.number().default(0) }),
    knockback: z.number().default(2),
    thrownDamage: z.number().default(55),
    dropWeight: z.number().default(1),
    twoHanded: z.boolean().default(false),
    laserSight: z.boolean().default(false),
    infiniteAmmo: z.boolean().default(false),
    shape: z.object({ kind: z.string(), length: z.number().default(0.45) }),
    sound: z.string(),
    milestone: z.enum(['m2', 'm3', 'm6']),
  })
  .superRefine((def, ctx) => {
    const pair = (min: number | undefined, max: number | undefined, key: string) => {
      if ((min == null) !== (max == null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} min/max must be paired`,
          path: ['projectile', key],
        });
      }
      if (min != null && max != null && min > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} min > max`,
          path: ['projectile', key],
        });
      }
    };
    pair(def.projectile.damageMin, def.projectile.damageMax, 'damage');
    pair(def.projectile.explodeDamageMin, def.projectile.explodeDamageMax, 'explodeDamage');
    pair(def.projectile.burstDamageMin, def.projectile.burstDamageMax, 'burstDamage');
    if (def.holdSeconds != null && !def.infiniteAmmo) {
      const expected = holdAmmoFromSeconds(def.holdSeconds, def.fireIntervalTicks);
      if (def.ammo !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ammo ${def.ammo} != holdSeconds mapping ${expected} (${def.holdSeconds}s @ interval ${def.fireIntervalTicks})`,
          path: ['ammo'],
        });
      }
    }
  });

export type WeaponDef = z.infer<typeof WeaponDefSchema>;
