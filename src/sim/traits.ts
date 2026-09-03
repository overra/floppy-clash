import { relation, trait } from 'koota';
import type { Body } from 'planck';

/** Trait replication class — declared as traits are added (M8-ready). */
export const replication = {
  Transform: 'replicated',
  PrevTransform: 'local',
  PhysBody: 'local',
  NetId: 'replicated',
  Player: 'replicated',
  Controller: 'replicated',
  Aim: 'replicated',
  Health: 'replicated',
  Combat: 'replicated',
  Weapon: 'replicated',
  Projectile: 'replicated',
  Hazard: 'replicated',
  RagdollPart: 'replicated',
  Lifetime: 'replicated',
  Dead: 'replicated',
  Loose: 'replicated',
  Held: 'replicated',
  Static: 'replicated',
  Kinematic: 'replicated',
  Status: 'replicated',
  Snake: 'replicated',
  Bot: 'local',
  Boss: 'replicated',
  PhysArm: 'local',
  Crown: 'replicated',
  Solid: 'replicated',
  Sensor: 'local',
  Destructible: 'replicated',
  SpawnPoint: 'local',
  PunchHit: 'local',
  RoundState: 'replicated',
  MatchState: 'replicated',
  SimClock: 'replicated',
  DropState: 'replicated',
  HazardPath: 'replicated',
} as const;

export type ReplicationClass = 'replicated' | 'local';

export const Transform = trait({ x: 0, y: 0, angle: 0 });
export const PrevTransform = trait({ x: 0, y: 0, angle: 0 });
export const PhysBody = trait(() => ({ body: null as Body | null }));
export const NetId = trait({ id: 0 });
export const Player = trait({ slot: 0, color: 0, inputIndex: 0 });
export const Controller = trait({
  grounded: false,
  wallDir: 0,
  coyote: 0,
  jumpBuffer: 0,
  lockTicks: 0,
  ducking: false,
  facing: 1,
  wallSliding: false,
  vx: 0,
  vy: 0,
});
export const Aim = trait({ x: 1, y: 0, holdTicks: 0 });
export const Health = trait({ hp: 100, maxHp: 100 });
export const Combat = trait({
  punchCooldown: 0,
  punchActive: 0,
  blockMeter: 1,
  blockStartTick: -999,
  blocking: false,
  refillDelay: 0,
});
export const Weapon = trait({
  defId: 0,
  ammo: 0,
  pickupCooldown: 0,
  thrown: false,
  thrownHit: false,
});
export const Projectile = trait({
  kind: 0,
  damage: 0,
  speed: 0,
  bounces: 0,
  fuse: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  gravity: 0,
  ownerGrace: 0,
  defId: 0,
});
export const Hazard = trait({
  kind: 0,
  param0: 0,
  param1: 0,
  param2: 0,
  param3: 0,
  hp: 0,
  armed: 1,
});
export const RagdollPart = trait({ part: 0 });
export const Lifetime = trait({ ticksLeft: 0 });
export const Status = trait({
  burning: 0,
  slowed: 0,
  glued: 0,
  bubbled: 0,
});
export const Snake = trait({ hp: 0, giant: 0, flying: 0, biteCooldown: 0 });
export const Bot = trait({ slot: 0, think: 0 });
export const Boss = trait({ hp: 200, bite: 0, speed: 3.2 });
export const PhysArm = trait({ side: 0, owner: 0 });
export const Crown = trait();
/** Waypoint path for kinematic movers (PLAN 4.10 / Appendix D `platform.moving`). */
export const HazardPath = trait(() => ({
  points: [] as { x: number; y: number }[],
  index: 0,
  accum: 0,
  mode: 0,
  dir: 1,
  speed: 3,
}));
export const Dead = trait();
export const Loose = trait();
export const Held = trait();
export const Static = trait();
export const Kinematic = trait();
export const Solid = trait();
export const Sensor = trait();
export const Destructible = trait({ hp: 60, maxHp: 60 });
export const SpawnPoint = trait({ index: 0 });
export const PunchHit = trait({ owner: 0, ticks: 0, damage: 0 });

export const HeldBy = relation({ exclusive: true });
export const OwnedBy = relation();
export const PartOf = relation({ autoDestroy: 'orphan' });
export const StandingOn = relation({ exclusive: true });

export const RoundState = trait({
  phase: 0,
  ticks: 0,
  aliveMask: 0,
  lastKiller: -1,
  seed: 0,
});

export const MatchState = trait({
  wins0: 0,
  wins1: 0,
  wins2: 0,
  wins3: 0,
  firstTo: 0,
  levelIndex: 0,
  rotation: 0,
  showWins: 1,
  maxHp: 100,
  round: 0,
});

export const SimClock = trait({ tick: 0, stepScale: 1 });
export const DropState = trait({ nextDrop: 0, looseCount: 0 });

export const RoundPhase = {
  Loading: 0,
  Countdown: 1,
  Fighting: 2,
  LastKill: 3,
  Scoreboard: 4,
  MatchOver: 5,
} as const;

export const HazardKind = {
  Solid: 0,
  Destructible: 1,
  Crate: 2,
  Spikes: 3,
  Lava: 4,
  Saw: 5,
  MovingPlatform: 6,
  RotatingPlatform: 7,
  Disappearing: 8,
  Collapsing: 9,
  Momentum: 10,
  Chain: 11,
  Barrel: 12,
  Laser: 13,
  Conveyor: 14,
  Ice: 15,
  Bounce: 16,
  Spikeball: 17,
  Crusher: 18,
  TriggerDrop: 19,
  Boss: 20,
  /** Short-lived chunks from a broken `block.destructible` (Appendix D). */
  Debris: 21,
} as const;

export const ProjectileKind = {
  Bullet: 0,
  Pellet: 1,
  Grenade: 2,
  Rocket: 3,
  Beam: 4,
  Melee: 5,
  Field: 6,
  Creature: 7,
  BurstInto: 8,
} as const;

export const RagdollParts = {
  Head: 0,
  Torso: 1,
  UpperArmL: 2,
  LowerArmL: 3,
  UpperArmR: 4,
  LowerArmR: 5,
  UpperLegL: 6,
  LowerLegL: 7,
  UpperLegR: 8,
  LowerLegR: 9,
} as const;
