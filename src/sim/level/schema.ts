import { z } from 'zod';

export const Vec2Schema = z.object({ x: z.number(), y: z.number() });

export const LevelObjectSchema = z
  .object({
    type: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number().optional(),
    h: z.number().optional(),
    r: z.number().optional(),
    dir: z.enum(['up', 'down', 'left', 'right']).optional(),
    hp: z.number().optional(),
    path: z.array(Vec2Schema).optional(),
    speed: z.number().optional(),
    mode: z.enum(['loop', 'pingpong']).optional(),
    style: z.enum(['swing', 'roll', 'drop']).optional(),
    period: z.number().optional(),
    delay: z.number().optional(),
    rate: z.number().optional(),
    onTicks: z.number().optional(),
    offTicks: z.number().optional(),
    warningTicks: z.number().optional(),
    reach: z.number().optional(),
    angle: z.number().optional(),
    omega: z.number().optional(),
    links: z.number().optional(),
    weapon: z.string().optional(),
    atTick: z.number().optional(),
  })
  .passthrough();

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  theme: z.string(),
  bounds: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  killMargin: z.number().default(6),
  spawns: z.array(Vec2Schema).min(4),
  drops: z
    .object({
      enabled: z.boolean().default(true),
      xMin: z.number(),
      xMax: z.number(),
      intervalScale: z.number().default(1),
    })
    .optional(),
  startingWeapons: z
    .array(z.object({ weapon: z.string(), x: z.number(), y: z.number() }))
    .optional(),
  objects: z.array(LevelObjectSchema),
  decor: z
    .array(z.object({ kind: z.string(), x: z.number(), y: z.number(), scale: z.number().optional() }))
    .optional(),
});

export type LevelDef = z.infer<typeof LevelSchema>;
export type LevelObject = z.infer<typeof LevelObjectSchema>;

export function parseLevel(raw: unknown): LevelDef {
  return LevelSchema.parse(raw);
}
