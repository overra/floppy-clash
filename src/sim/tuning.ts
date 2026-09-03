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
  airAccelTicks: 20,
  jumpSpeed: 11,
  coyoteTicks: 5,
  jumpBufferTicks: 6,
  wallSlideMaxFall: 3,
  wallJumpX: 6.5,
  wallJumpY: 12,
  wallJumpLockTicks: 8,
  wallDetectDistance: 0.55,
  maxFallSpeed: 28,
  maxHorizontalSpeed: 40,

  punchSelfImpulse: 4,
  blockPunchBonus: 3,
  punchDamage: 22,
  punchKnockback: 6,
  punchKnockbackUp: 0.3,
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

  firstDropDelayTicks: 180,
  dropIntervalMinTicks: 360,
  dropIntervalMaxTicks: 600,
  maxLooseWeapons: 6,

  lavaDamage: 35,
  lavaCooldownTicks: 30,

  /** PLAN Appendix C flamethrower: 5/s burn for 6 s. */
  burnDamage: 5,
  burnIntervalTicks: 60,
  burnDurationTicks: 360,

  /** PLAN 2.2 dropkick: extra knockback on an airborne punch. */
  dropkickKnockbackScale: 1.35,

  countdownTicks: 180,
  lastKillSlowmo: 0.25,
  slowmoTicks: 72,
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
