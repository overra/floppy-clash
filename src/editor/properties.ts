import { LevelObjectSchema, type LevelObject } from '../sim/level/schema';

export type FieldKind = 'number' | 'string' | 'enum' | 'json';

export type SchemaField = {
  key: string;
  kind: FieldKind;
  options?: string[];
};

const ENUMS: Record<string, string[]> = {
  dir: ['up', 'down', 'left', 'right'],
  mode: ['loop', 'pingpong'],
  style: ['swing', 'roll', 'drop'],
};

/** Property-panel fields generated from the hazard zod object (PLAN 4.15). */
export function objectSchemaFields(): SchemaField[] {
  const shape = LevelObjectSchema.shape;
  return Object.keys(shape).map((key) => {
    if (key === 'path') return { key, kind: 'json' as const };
    if (ENUMS[key]) return { key, kind: 'enum' as const, options: ENUMS[key] };
    if (key === 'type' || key === 'weapon') return { key, kind: 'string' as const };
    return { key, kind: 'number' as const };
  });
}

export function applyField(obj: LevelObject, key: string, raw: string): void {
  const field = objectSchemaFields().find((f) => f.key === key);
  if (!field) return;
  if (field.kind === 'number') {
    const n = Number(raw);
    if (Number.isFinite(n)) (obj as Record<string, unknown>)[key] = n;
    return;
  }
  if (field.kind === 'json') {
    try {
      (obj as Record<string, unknown>)[key] = JSON.parse(raw);
    } catch {
      /* keep previous */
    }
    return;
  }
  if (raw === '') {
    delete (obj as Record<string, unknown>)[key];
    return;
  }
  (obj as Record<string, unknown>)[key] = raw;
}

export function fieldValue(obj: LevelObject, key: string): string {
  const v = (obj as Record<string, unknown>)[key];
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
