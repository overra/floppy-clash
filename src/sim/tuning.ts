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

  // Kicks: slower and longer than a punch, mostly sideways, and each one blocked eats a chunk of the
  // guard meter (guardDrain) so a turtle eventually has to move. Stepping into a strike (left stick
  // held the way the fighter faces) throws the rear-limb version: rearWindupTicks more wind-up for
  // rearDamageScale / rearKnockbackScale more hurt and a longer recovery.
  kickWindupTicks: 5,
  kickActiveTicks: 5,
  kickCooldownTicks: 30,
  kickDamage: 26,
  kickKnockback: 11,
  kickKnockbackUp: 3,
  kickRange: 1.2,
  kickRadius: 0.5,
  kickSelfImpulse: 3,
  kickGuardDrain: 0.4,
  rearWindupTicks: 2,
  rearDamageScale: 1.35,
  rearKnockbackScale: 1.25,
  rearCooldownScale: 1.3,
  rearReachBonus: 0.1,
  guardBreakStunTicks: 24,

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

  // Launch mode. A hit's shove is the weapon's knockback times (base + percent/100 * perPercent),
  // capped; hitstun grows with the launch speed; the stick held at the moment of the hit steers the
  // launch angle by up to diMaxDeg (directional influence). Fallen fighters drop back in after
  // respawnDelayTicks with respawnInvulnTicks of immunity.
  launchBaseScale: 0.6,
  launchPercentScale: 1.4,
  launchMaxScale: 4,
  hitstunPerSpeed: 1.5,
  hitstunMaxTicks: 45,
  diMaxDeg: 18,
  respawnDelayTicks: 90,
  respawnInvulnTicks: 120,

  // Between rounds: ~2 s of slow-mo on the last kill (36 ticks at 0.3x), 0.75 s with the scorecard
  // up at full speed, then a 1.5 s 3-2-1. About 4 s door to door; rounds against bots can be short,
  // so the gap has to be shorter still.
  countdownTicks: 90,
  lastKillSlowmo: 0.3,
  slowmoTicks: 36,
  scoreboardTicks: 45,

  cameraPadding: 4,
  cameraLerp: 0.12,
  cameraZoomLerp: 0.08,

  ownerGraceTicks: 6,
  // After the right stick is released the aim stays put this long (a flick-and-fire lands where the
  // flick pointed), then the run direction takes it over. Standing still keeps it indefinitely.
  aimHoldAtRestTicks: 20,
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
