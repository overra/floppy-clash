import { universe } from 'koota';
import { gymLevel, runTrack } from '../src/levels/gym';
import { woodsClearing } from '../src/levels/handauthored';
import { getLevel } from '../src/levels/catalog';
import { blankInputs, type PlayerInput } from '../src/sim/input';
import { createSimWorld, type CreateSimOptions, type SimHandle } from '../src/sim/world';
import { Controller, Health, Player, Transform } from '../src/sim/traits';

export function makeSim(partial?: Partial<CreateSimOptions>): SimHandle {
  universe.reset();
  return createSimWorld({
    level: partial?.level ?? gymLevel,
    seed: partial?.seed ?? 1,
    settings: partial?.settings ?? { playerCount: 1, bots: 0 },
    spawnPlayers: partial?.spawnPlayers,
    boxes: partial?.boxes,
    extraLevels: partial?.extraLevels,
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
