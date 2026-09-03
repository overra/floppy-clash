export const Category = {
  Static: 0x0001,
  Prop: 0x0002,
  Player: 0x0004,
  Ragdoll: 0x0008,
  Weapon: 0x0010,
  Projectile: 0x0020,
  Sensor: 0x0040,
} as const;

export const Mask = {
  Static: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon | Category.Projectile,
  Prop: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon | Category.Projectile,
  Player: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon | Category.Projectile,
  Ragdoll: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon | Category.Projectile,
  Weapon: Category.Static | Category.Prop | Category.Player | Category.Ragdoll | Category.Weapon | Category.Projectile,
  Projectile: Category.Static | Category.Prop | Category.Ragdoll | Category.Weapon,
  Sensor: Category.Player | Category.Ragdoll | Category.Prop,
} as const;

export type BodyKind =
  | 'player'
  | 'ragdoll'
  | 'weapon'
  | 'projectile'
  | 'solid'
  | 'prop'
  | 'sensor'
  | 'hazard';

export type FixtureUserData = {
  entity: number;
  kind: BodyKind;
  sensor?: string;
};
