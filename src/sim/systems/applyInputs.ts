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
  const cooked = ctx.inputs[player.inputIndex] ?? ctx.inputs[player.slot];
  if (!cooked) return;
  const raw = ctx.rawInputs[player.inputIndex] ?? ctx.rawInputs[player.slot] ?? cooked;
  const input = normalizeInput(cooked);
  const t = ctx.tuning;
  // Aim model: a deflected right stick (or the mouse, or a bot) owns the aim outright, so you can
  // fight while backing away. Released, the aim holds for a beat (a flick-and-fire still lands where
  // the flick pointed) and then follows the left stick, so running right punches right without ever
  // touching the right stick. Standing still keeps the last aim.
  const stickActive = Math.hypot(raw.aimX, raw.aimY) > 0.01;
  if (stickActive) {
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
};

export function applyInputs(world: World): void {
  world.query(players).updateEach((comps, entity) => {
    applyOne(comps, entity, world);
  });
}
