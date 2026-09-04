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
  Lifetime: 'local',
  Dead: 'replicated',
  Loose: 'replicated',
  Held: 'replicated',
  Static: 'replicated',
  Kinematic: 'replicated',
  Status: 'replicated',
  Snake: 'replicated',
  Bot: 'local',
  Shape: 'local',
  Anchor: 'local',
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
/** percent: launch-mode damage, climbing from 0 with no ceiling; hp is untouched by ordinary hits there. */
export const Health = trait({ hp: 100, maxHp: 100, percent: 0 });
/** Launch mode: lives left this round, and the ticks until a fallen fighter drops back in (0 = not waiting). */
export const Stocks = trait({ left: 0, respawnIn: 0 });
export const Combat = trait({
  strikeCooldown: 0,
  /** Ticks the current strike is shown for (wind-up plus the swing). */
  strikeActive: 0,
  /** Ticks until a thrown strike actually lands; two fighters swinging inside this window clash instead. */
  strikePending: 0,
  /** StrikeKind of the strike in flight (0 when idle). */
  strike: 0,
  /** Staggered (blocked or clashed): no attacks, no guard, no steering until it runs out. */
  stun: 0,
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
  /** Field projectiles: 0 while flying, 1 once anchored in place (black hole opened, time bubble popped). */
  phase: 0,
  /** Melee swings: bit per player slot already struck this swing, so one swing lands once per target. */
  hitMask: 0,
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
/** Rest position for kinematic hazards that oscillate (moving platforms, sweeping saws, crushers). */
export const Anchor = trait({ x: 0, y: 0 });
/** Render-facing geometry of the body's main fixture (derived, never authored). kind: ShapeKind. */
export const Shape = trait({ kind: 0, hx: 0.5, hy: 0.5, r: 0 });
export const Lifetime = trait({ ticksLeft: 0 });
/**
 * Ticks left on each affliction. pulled: in a void well's grip, so footing counts for nothing (controller.ts).
 * invuln: fresh off a respawn (or a ledge in launch mode), hits and shoves pass straight through.
 */
export const Status = trait({
  burning: 0,
  slowed: 0,
  glued: 0,
  bubbled: 0,
  pulled: 0,
  invuln: 0,
});
/** grace: ticks during which a freshly fired snake ignores whoever shot it (and sails ballistically while high). */
export const Snake = trait({ hp: 0, giant: 0, flying: 0, biteCooldown: 0, grace: 0 });
/** Bot brain state (local only). mode: BotMode. target: slot of the tracked enemy or -1. */
export const Bot = trait({
  slot: 0,
  think: 0,
  skill: 0.75,
  mode: 0,
  timer: 0,
  target: -1,
  strafe: 1,
  strafeTicks: 0,
  aimErr: 0,
  blockTicks: 0,
  reactTicks: 0,
  throwArmed: 0,
  /** Last static nav surface the bot stood on (index into the level's NavGraph). */
  surf: -1,
  /** Progress watchdog: position sampled every couple of seconds, and a detour timer when it stalls. */
  stuckX: 0,
  stuckY: 0,
  detour: 0,
  detourDir: 1,
  /** Consecutive ticks spent running into something without moving. */
  blocked: 0,
  /** A pickup we failed to reach (entity id) and how long to ignore it. */
  shunned: -1,
  shunTicks: 0,
});
export const Crown = trait();
export const Dead = trait();
export const Loose = trait();
export const Held = trait();
export const Static = trait();
export const Kinematic = trait();
export const Solid = trait();
export const Sensor = trait();
export const Destructible = trait({ hp: 60, maxHp: 60 });
export const SpawnPoint = trait({ index: 0 });

export const HeldBy = relation({ exclusive: true });
export const OwnedBy = relation();
export const PartOf = relation({ autoDestroy: 'orphan' });
export const StandingOn = relation({ exclusive: true });

export const RoundState = trait({
  phase: 0,
  ticks: 0,
  aliveMask: 0,
  lastKiller: -1,
  /** Slot that took the round (decided the moment the last kill lands, even if they die celebrating); -1 for a draw. */
  winner: -1,
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
  /** MatchMode as an index: 0 standing, 1 launch. */
  mode: 0,
  /** Launch mode: stocks every fighter starts a round with. */
  stocks: 0,
});

export const MatchModeIndex = { standing: 0, launch: 1 } as const;

/** Unarmed strikes. Lead limbs (jab, front kick) are quick; rear limbs (cross, roundhouse) are the committed versions. */
export const StrikeKind = {
  None: 0,
  Jab: 1,
  Cross: 2,
  FrontKick: 3,
  Roundhouse: 4,
} as const;

export const SimClock = trait({ tick: 0, stepScale: 1 });
/** Weapon rain: `wave` counts the opening volley still to fall (one per fighter, see spawner.ts). */
export const DropState = trait({ nextDrop: 0, looseCount: 0, wave: 0, waveSize: 0 });

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

export const ShapeKind = {
  Box: 0,
  Circle: 1,
  Capsule: 2,
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
