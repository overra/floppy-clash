import { THEMES, type ThemeId } from '../sim/level/themes';
import { LevelObjectSchema, type LevelDef, type LevelObject } from '../sim/level/schema';
import { WEAPON_DEFS, weaponDisplayName } from '../sim/weapons/defs';
import { PALETTE } from './editor';

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

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Level-decor kinds the renderer understands (bezier vine/rope/trail, else capsule). */
export const DECOR_KINDS = ['tree', 'vine', 'rope', 'trail'] as const;

export function weaponRosterIds(): string[] {
  return WEAPON_DEFS.map((d) => d.id);
}

export function fieldOptionLabel(field: SchemaField, opt: string): string {
  if (field.key === 'weapon') return weaponDisplayName(opt);
  return opt;
}

export function startingWeaponFields(): SchemaField[] {
  return [{ key: 'weapon', kind: 'enum', options: weaponRosterIds() }];
}

export function decorKindFields(): SchemaField[] {
  return [{ key: 'kind', kind: 'enum', options: [...DECOR_KINDS] }];
}

export function applyStartingWeaponField(level: LevelDef, index: number, weapon: string): void {
  const sw = level.startingWeapons?.[index];
  if (sw && weapon) sw.weapon = weapon;
}

export function applyDecorKindField(level: LevelDef, index: number, kind: string): void {
  const dec = level.decor?.[index];
  if (dec && kind) dec.kind = kind;
}

/** Level-wide fields (PLAN 4.15 / Appendix B) — not hazard props. */
export function levelSchemaFields(): SchemaField[] {
  return [
    { key: 'id', kind: 'string' },
    { key: 'name', kind: 'string' },
    { key: 'theme', kind: 'enum', options: [...THEME_IDS] },
    { key: 'killMargin', kind: 'number' },
    { key: 'bounds.w', kind: 'number' },
    { key: 'bounds.h', kind: 'number' },
  ];
}

export function applyLevelField(level: LevelDef, key: string, raw: string): void {
  if (key === 'id' || key === 'name' || key === 'theme') {
    if (raw !== '') (level as Record<string, unknown>)[key] = raw;
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  if (key === 'killMargin') level.killMargin = n;
  if (key === 'bounds.w') level.bounds.w = Math.max(8, n);
  if (key === 'bounds.h') level.bounds.h = Math.max(6, n);
}

export function levelFieldValue(level: LevelDef, key: string): string {
  if (key === 'bounds.w') return String(level.bounds.w);
  if (key === 'bounds.h') return String(level.bounds.h);
  const v = (level as Record<string, unknown>)[key];
  if (v === undefined || v === null) return '';
  return String(v);
}

/** Property-panel fields generated from the hazard zod object (PLAN 4.15). */
export function objectSchemaFields(): SchemaField[] {
  const shape = LevelObjectSchema.shape;
  return Object.keys(shape).map((key) => {
    if (key === 'path') return { key, kind: 'json' as const };
    if (ENUMS[key]) return { key, kind: 'enum' as const, options: ENUMS[key] };
    if (key === 'type') return { key, kind: 'enum' as const, options: [...PALETTE] };
    if (key === 'weapon') return { key, kind: 'enum' as const, options: weaponRosterIds() };
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
