export const tuning = {
  gravity: 30,
  tickRate: 60,
  velocityIterations: 8,
  positionIterations: 3,

  height: 1.8,
  radius: 0.3,
  runSpeed: 8,
  duckSpeedScale: 0.5,
  groundAccelTicks: 6,
  // Full air speed in a quarter second: steering back over a ledge after a wall-kick has to be quick.
  airAccelTicks: 14,
  // Apex ≈ v²/2g ≈ 3.1 m (~1.7 body heights): ledges up to ~2.7 m above the feet are a single hop,
  // which is what lets a platform sit a full head above a fighter (2.2 m of air) and still be hopped.
  jumpSpeed: 13.6,
  coyoteTicks: 5,
  jumpBufferTicks: 6,
  wallSlideMaxFall: 3,
  // A wall-kick is mostly up and only a little out: holding towards the wall brings the fighter back
  // to it at the apex (~2.8 m higher), so repeated kicks climb instead of looping in a wide arc.
  wallJumpX: 4.5,
  wallJumpY: 13,
  wallJumpLockTicks: 5,
  wallDetectDistance: 0.55,
  // Ledge assist: a lip no more than this far above the feet gets scrambled onto (see controller.ts),
  // probed this far outside the capsule, with at least this much speed carried over the edge.
  mantleReach: 0.9,
  mantleProbe: 0.25,
  mantleSpeed: 2.5,
  maxFallSpeed: 28,
  maxHorizontalSpeed: 40,

  punchSelfImpulse: 4,
  blockPunchBonus: 3,
  punchDamage: 22,
  // The pop lifts the victim off the ground so the shove carries instead of dying to floor friction.
  punchKnockback: 8,
  punchKnockbackUp: 6,
  punchRange: 0.9,
  punchRadius: 0.45,
  punchActiveTicks: 4,
  punchCooldownTicks: 20,

  blockArcDeg: 120,
  blockMeterDrainTicks: 72,
  blockMeterRefillTicks: 60,
  blockMeterRefillDelayTicks: 18,
  perfectBlockTicks: 9,

  maxHp: 100,
  headshotMult: 2,
  neckMult: 1.5,
  headZone: 0.45,
  neckZone: 0.15,

  throwSpeed: 18,
  thrownDamage: 55,
  pickupCooldownTicks: 30,
  refillOnPickup: true,
  flingWhenEmpty: true,

  // Guns rain steadily: first one lands as the fight opens, then every 3–6 s (faster with more players).
  firstDropDelayTicks: 90,
  dropIntervalMinTicks: 180,
  dropIntervalMaxTicks: 360,
  maxLooseWeapons: 6,

  lavaDamage: 35,
  lavaCooldownTicks: 30,

  countdownTicks: 120,
  // 45 sim ticks at 0.3x is ~2.5 s of real time: long enough to savour, short enough not to stall the party.
  lastKillSlowmo: 0.3,
  slowmoTicks: 45,
  scoreboardTicks: 90,

  cameraPadding: 4,
  cameraLerp: 0.12,
  cameraZoomLerp: 0.08,

  ownerGraceTicks: 6,
  aimHoldAtRestTicks: 12,
  stickSmoothing: 0.35,
  moveDeadzone: 0.2,
  aimDeadzone: 0.25,
  duckStickThreshold: 0.5,
  triggerThreshold: 0.5,

  ragdollLinearDamping: 0.15,
  ragdollAngularDamping: 0.2,
  corpseDespawnMargin: 20,
};

export type Tuning = typeof tuning;

export function cloneTuning(): Tuning {
  return { ...tuning };
}
