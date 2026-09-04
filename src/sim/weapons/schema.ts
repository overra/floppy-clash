import { z } from 'zod';

export const WeaponDefSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  category: z.enum(['melee', 'pistol', 'rifle', 'explosive', 'snake', 'lava', 'other', 'consumable']),
  /** Consumables apply this on pickup instead of being held (see weapons/consumables.ts). */
  effect: z.enum(['none', 'mend', 'lead', 'sprint', 'mirror']).default('none'),
  ammo: z.number(),
  /**
   * `charge`: hold to wind up, release (or reach full charge) to swing, harder the longer it was held.
   * `forced`: swings on its own every interval while held; the holder cannot raise a guard.
   */
  fireMode: z.enum(['semi', 'auto', 'burst', 'hold', 'charge', 'forced']),
  fireIntervalTicks: z.number(),
  burstCount: z.number().optional(),
  /** Holding this weapon keeps the guard down and the wall-kick off (forced swingers). */
  lockGuard: z.boolean().default(false),
  /** What a shell leaves behind instead of a blast when it settles: `repulsor` plants a bumper. */
  deploy: z.enum(['none', 'repulsor']).default('none'),
  projectile: z.object({
    kind: z.enum(['bullet', 'pellets', 'grenade', 'rocket', 'beam', 'melee', 'field', 'creature', 'burst-into']),
    speed: z.number().default(40),
    damage: z.number(),
    spreadDeg: z.number().default(0),
    count: z.number().default(1),
    gravity: z.number().default(0),
    bounce: z.number().default(0),
    fuse: z.number().default(0),
    radius: z.number().default(0),
    explodeDamage: z.number().default(0),
    explodeImpulse: z.number().default(0),
    status: z.enum(['none', 'burn', 'slow', 'glue', 'bubble']).default('none'),
    burstInto: z.string().optional(),
    burstCount: z.number().optional(),
    warningTicks: z.number().default(0),
    beamTicks: z.number().default(0),
    rare: z.boolean().default(false),
  }),
  recoil: z.object({ back: z.number().default(0), up: z.number().default(0), forward: z.number().default(0) }),
  knockback: z.number().default(2),
  /** Launch mode multiplier on `knockback` (resolved into the def by weapons/resolve.ts): tames rapid fire. */
  launchScale: z.number().default(1),
  thrownDamage: z.number().default(55),
  dropWeight: z.number().default(1),
  twoHanded: z.boolean().default(false),
  laserSight: z.boolean().default(false),
  infiniteAmmo: z.boolean().default(false),
  shape: z.object({ kind: z.string(), length: z.number().default(0.45) }),
  sound: z.string(),
  milestone: z.enum(['m2', 'm3', 'm6']),
});

export type WeaponDef = z.infer<typeof WeaponDefSchema>;
