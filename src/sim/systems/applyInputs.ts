import { createQuery, type World } from 'koota';
import { getContext } from '../context';
import { normalizeInput } from '../input';
import { Aim, Controller, Dead, Player } from '../traits';

const players = createQuery(Player, Controller, Aim);

const applyOne = ([player, controller, aim]: [
  { slot: number; color: number; inputIndex: number },
  { grounded: boolean; wallDir: number; coyote: number; jumpBuffer: number; lockTicks: number; ducking: boolean; facing: number; wallSliding: boolean; vx: number; vy: number },
  { x: number; y: number; holdTicks: number },
], entity: { has: (t: typeof Dead) => boolean }, world: World) => {
  if (entity.has(Dead)) return;
  const ctx = getContext(world);
  const raw = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
  if (!raw) return;
  const input = normalizeInput(raw);
  const t = ctx.tuning;
  const aimLen = Math.hypot(input.aimX, input.aimY);
  const stickActive = aimLen > 0.01 && (Math.abs(input.aimX) > 0.001 || Math.abs(input.aimY) > 0.001);
  // aim is already normalized by normalizeInput; treat as active unless it's the fallback default and move says otherwise
  if (Math.abs(raw.aimX) + Math.abs(raw.aimY) > 0.01) {
    aim.x = input.aimX;
    aim.y = input.aimY;
    aim.holdTicks = t.aimHoldAtRestTicks;
    controller.facing = aim.x >= 0 ? 1 : -1;
  } else if (aim.holdTicks > 0) {
    aim.holdTicks -= 1;
  } else if (Math.abs(input.moveX) > 0.1) {
    controller.facing = input.moveX >= 0 ? 1 : -1;
    aim.x = controller.facing;
    aim.y = 0;
  }
  void stickActive;
};

export function applyInputs(world: World): void {
  world.query(players).updateEach((comps, entity) => {
    applyOne(comps, entity, world);
  });
}
