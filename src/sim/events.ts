export type HitZone = 'head' | 'neck' | 'body';

export type SimEvent =
  | { type: 'hit'; source: number; target: number; damage: number; zone: HitZone; x: number; y: number }
  | { type: 'kill'; source: number; target: number; x: number; y: number }
  | { type: 'shot'; source: number; weaponId: string; x: number; y: number; aimX: number; aimY: number }
  | { type: 'explosion'; x: number; y: number; radius: number; damage: number }
  | { type: 'pickup'; player: number; weaponId: string }
  | { type: 'throw'; player: number; weaponId: string }
  | { type: 'block'; player: number; reflected: boolean }
  | { type: 'blood'; x: number; y: number; amount: number }
  | { type: 'round-phase'; phase: string }
  | { type: 'spawn'; kind: string; netId: number }
  | { type: 'despawn'; netId: number }
  | { type: 'score'; slot: number; wins: number };

export type SimEvents = SimEvent[];
