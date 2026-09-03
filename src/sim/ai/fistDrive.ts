import type { World } from 'koota';
import { cloneInput, EMPTY_INPUT, type PlayerInput } from '../input';
import { Dead, Health, Player, Transform } from '../traits';

/** Scripted walk-and-punch. Uses inputs only — no teleport, HP force, or hazard mute. */
export function fistDriveForSeat(world: World, seat: number, tick: number): PlayerInput {
  const input = cloneInput(EMPTY_INPUT);
  const found: { self: { x: number; y: number } | null; others: { x: number; y: number }[] } = {
    self: null,
    others: [],
  };
  world.query(Player, Transform).updateEach(([p, t], e) => {
    if (e.has(Dead) || (e.get(Health)?.hp ?? 0) <= 0) return;
    if (p.slot === seat || p.inputIndex === seat) found.self = { x: t.x, y: t.y };
    else found.others.push({ x: t.x, y: t.y });
  });
  const self = found.self;
  const others = found.others;
  if (!self || others.length === 0) return input;
  let best = others[0]!;
  let bestD = Math.hypot(best.x - self.x, best.y - self.y);
  for (const o of others) {
    const d = Math.hypot(o.x - self.x, o.y - self.y);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  const dx = best.x - self.x;
  const dy = best.y - self.y;
  input.aimX = Math.abs(dx) > 0.05 ? Math.sign(dx) : 1;
  input.aimY = Math.abs(dy) > 0.35 ? Math.sign(dy) : 0;
  if (Math.abs(dx) < 0.55 && bestD < 2.8) {
    input.moveX = Math.abs(dx) < 0.05 ? (seat % 2 === 0 ? 1 : -1) : self.x >= best.x ? 1 : -1;
  } else {
    input.moveX = Math.abs(dx) > 0.55 ? Math.sign(dx) : 0;
  }
  input.jump = dy > 0.4;
  input.attack = bestD < 1.6 && tick % 18 === seat % 18;
  return input;
}

/** Walk-and-punch every living seat. Inputs only. */
export function applyFistDriveAll(inputs: PlayerInput[], world: World, tick: number): PlayerInput[] {
  let next = inputs;
  for (let seat = 0; seat < 4; seat++) next = applyFistDrive(next, world, seat, tick);
  return next;
}

export function applyFistDrive(
  inputs: PlayerInput[],
  world: World,
  seat: number,
  tick: number,
): PlayerInput[] {
  const next = inputs.map((s) => ({ ...s }));
  let index = seat;
  world.query(Player).updateEach(([p]) => {
    if (p.slot === seat) index = p.inputIndex;
  });
  next[index] = fistDriveForSeat(world, seat, tick);
  return next;
}
