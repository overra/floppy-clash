export type HitZone = 'head' | 'neck' | 'body';

export type SimEvent =
  | { type: 'hit'; source: number; target: number; damage: number; zone: HitZone; x: number; y: number }
  | { type: 'kill'; source: number; target: number; x: number; y: number }
  | { type: 'shot'; source: number; weaponId: string; x: number; y: number; aimX: number; aimY: number }
  | { type: 'explosion'; x: number; y: number; radius: number; damage: number }
  | { type: 'pickup'; player: number; weaponId: string }
  | { type: 'throw'; player: number; weaponId: string }
  | { type: 'block'; player: number; reflected: boolean; x: number; y: number }
  /** A bare-handed strike was thrown (whoosh); the hit, if any, lands after its wind-up. `kick` for the foot. */
  | { type: 'punch'; player: number; kick: boolean; x: number; y: number; aimX: number; aimY: number }
  /** Two punches met mid-air: nobody takes damage, both fighters stagger. */
  | { type: 'clash'; x: number; y: number }
  | { type: 'blood'; x: number; y: number; amount: number }
  | { type: 'round-phase'; phase: string }
  /** Launch mode: a fighter lost a life (`left` remain) or dropped back in from the top. */
  | { type: 'stock'; slot: number; left: number }
  | { type: 'respawn'; player: number; x: number; y: number }
  /** A fighter caught a ledge (hands at x, y). */
  | { type: 'ledge'; player: number; x: number; y: number }
  | { type: 'spawn'; kind: string; netId: number }
  | { type: 'despawn'; netId: number }
  | { type: 'score'; slot: number; wins: number };

export type SimEvents = SimEvent[];
