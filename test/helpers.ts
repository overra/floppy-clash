import { universe } from 'koota';
import { gymLevel, runTrack } from '../src/levels/gym';
import { fistPit, woodsClearing } from '../src/levels/handauthored';
import { getLevel } from '../src/levels/catalog';
import { blankInputs, type PlayerInput } from '../src/sim/input';
import { createSimWorld, type CreateSimOptions, type SimHandle } from '../src/sim/world';
import { Controller, Hazard, HazardKind, HazardPath, Health, Player, PrevTransform, Transform } from '../src/sim/traits';

export const fistArena = fistPit;

export function makeSim(partial?: Partial<CreateSimOptions>): SimHandle {
  universe.reset();
  return createSimWorld({
    level: partial?.level ?? gymLevel,
    seed: partial?.seed ?? 1,
    settings: partial?.settings ?? { playerCount: 1, bots: 0 },
    spawnPlayers: partial?.spawnPlayers,
    boxes: partial?.boxes,
    extraLevels: partial?.extraLevels,
    seats: partial?.seats,
  });
}

export function hold(partial: Partial<PlayerInput>): PlayerInput {
  return { ...blankInputs(1)[0]!, ...partial };
}

export function playerOf(sim: SimHandle, slot = 0) {
  const list = sim.players();
  const found = list.find((e) => e.get(Player)?.slot === slot) ?? list[0];
  if (!found) throw new Error('no player');
  return found;
}

export function pin(sim: SimHandle, entity: ReturnType<typeof playerOf>, x: number, y: number): void {
  sim.ctx.bodies.get(entity)?.setPosition({ x, y });
  sim.ctx.bodies.get(entity)?.setLinearVelocity({ x: 0, y: 0 });
  entity.set(Transform, { x, y, angle: 0 });
  entity.set(PrevTransform, { x, y, angle: 0 });
}

/** Body + Transform only — leaves PrevTransform so last-tick sweeps stay honest. */
export function place(sim: SimHandle, entity: ReturnType<typeof playerOf>, x: number, y: number): void {
  sim.ctx.bodies.get(entity)?.setPosition({ x, y });
  sim.ctx.bodies.get(entity)?.setLinearVelocity({ x: 0, y: 0 });
  entity.set(Transform, { x, y, angle: 0 });
}

export function speedRounds(sim: SimHandle): void {
  sim.ctx.tuning.countdownTicks = 3;
  sim.ctx.tuning.slowmoTicks = 2;
  // Appendix A scoreboard window (90). Do not shrink it — 10-round proofs must pay it.
}

/**
 * Freeze hazard kinematics for a last-tick sweep proof.
 * Path follow / crusher drive would otherwise re-apply motion on the kill tick
 * (a vel*dt / teleport substitute). Contact still runs.
 */
export function freezeHazardKinematics(sim: SimHandle, kind: number): void {
  sim.ecs.query(Hazard).updateEach(([hz], e) => {
    if (hz.kind !== kind) return;
    if (e.has(HazardPath)) e.remove(HazardPath);
    if (kind === HazardKind.Saw || kind === HazardKind.RotatingPlatform || kind === HazardKind.Lava) {
      hz.param0 = 0;
    }
    if (kind === HazardKind.Saw || kind === HazardKind.Crusher) hz.param1 = 0;
    if (kind === HazardKind.Conveyor || kind === HazardKind.Bounce) hz.param1 = 0;
    const body = sim.ctx.bodies.get(e);
    body?.setLinearVelocity({ x: 0, y: 0 });
    body?.setAngularVelocity(0);
  });
}

/**
 * A point on last→now that sits outside a current-pose kill radius.
 * Null if the last-tick span is too short for an honest sweep proof.
 */
export function pointOnSweepOutsideCurrent(prev: number, now: number, currentReach: number): number | null {
  const span = Math.abs(now - prev);
  if (span <= currentReach + 0.25) return null;
  const dir = Math.sign(prev - now) || -1;
  return now + dir * (currentReach + 0.25);
}

export function pos(sim: SimHandle, slot = 0) {
  const t = playerOf(sim, slot).get(Transform);
  if (!t) throw new Error('no transform');
  return t;
}

export function hp(sim: SimHandle, slot = 0) {
  return playerOf(sim, slot).get(Health)?.hp ?? 0;
}

export function grounded(sim: SimHandle, slot = 0) {
  return playerOf(sim, slot).get(Controller)?.grounded ?? false;
}

export function stepMany(sim: SimHandle, n: number, input: PlayerInput | PlayerInput[] = hold({})): void {
  for (let i = 0; i < n; i++) {
    const inputs = Array.isArray(input) ? input : [input, hold({}), hold({}), hold({})];
    sim.step(inputs);
  }
}

export { gymLevel, runTrack, woodsClearing, getLevel };
