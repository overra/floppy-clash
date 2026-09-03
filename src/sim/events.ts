export type HitZone = 'head' | 'neck' | 'body';

export type SimEvent =
  | { type: 'hit'; source: number; target: number; damage: number; zone: HitZone; x: number; y: number }
  | { type: 'kill'; source: number; target: number; x: number; y: number }
  | { type: 'shot'; source: number; weaponId: string; x: number; y: number; aimX: number; aimY: number }
  | { type: 'explosion'; x: number; y: number; radius: number; damage: number }
  | { type: 'pickup'; player: number; weaponId: string }
  | { type: 'throw'; player: number; weaponId: string }
  | { type: 'block'; player: number; reflected: boolean; x: number; y: number }
  /** A bare-handed swing was thrown (whoosh); the hit, if any, lands a couple of ticks later. */
  | { type: 'punch'; player: number; x: number; y: number; aimX: number; aimY: number }
  /** Two punches met mid-air: nobody takes damage, both fighters stagger. */
  | { type: 'clash'; x: number; y: number }
  | { type: 'blood'; x: number; y: number; amount: number }
  | { type: 'round-phase'; phase: string }
  | { type: 'spawn'; kind: string; netId: number }
  | { type: 'despawn'; netId: number }
  | { type: 'score'; slot: number; wins: number };

export type SimEvents = SimEvent[];
