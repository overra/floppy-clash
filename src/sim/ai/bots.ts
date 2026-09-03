import { createQuery, type World } from 'koota';
import { getContext } from '../context';
import { cloneInput, EMPTY_INPUT } from '../input';
import { raycastClosest } from '../physics/queries';
import { Aim, Bot, Controller, Dead, Loose, Player, Transform, Weapon } from '../traits';

const bots = createQuery(Player, Controller, Transform, Aim);

export function attachBots(world: World, slots: number[]): void {
  world.query(Player).updateEach(([p], e) => {
    if (slots.includes(p.slot)) e.add(Bot({ slot: p.slot, think: 0 }));
  });
}

export function thinkBots(world: World): void {
  const ctx = getContext(world);
  world.query(bots).updateEach(([player, ctrl, tr, _aim], entity) => {
    if (!entity.has(Bot) || entity.has(Dead)) return;
    const bot = entity.get(Bot);
    if (!bot) return;
    bot.think += 1;
    const input = cloneInput(EMPTY_INPUT);
    const target = { cur: null as { x: number; y: number } | null };
    world.query(Player, Transform).updateEach(([_p, ot], other) => {
      if (other === entity || other.has(Dead)) return;
      if (!target.cur) target.cur = { x: ot.x, y: ot.y };
      else if (Math.hypot(ot.x - tr.x, ot.y - tr.y) < Math.hypot(target.cur.x - tr.x, target.cur.y - tr.y)) {
        target.cur = { x: ot.x, y: ot.y };
      }
    });
    const loose = world.queryFirst(Weapon, Loose, Transform);
    const looseT = loose?.get(Transform);
    if (looseT && !world.query(Weapon).some((w) => w.targetFor && w.targetFor)) {
      // pick up if close
    }
    if (looseT && Math.hypot(looseT.x - tr.x, looseT.y - tr.y) < 8) {
      input.moveX = Math.sign(looseT.x - tr.x);
      if (looseT.y > tr.y + 1) input.jump = bot.think % 20 < 2;
    } else if (target.cur) {
      const dx = target.cur.x - tr.x;
      const dy = target.cur.y - tr.y;
      input.moveX = Math.max(-1, Math.min(1, dx * 0.35));
      const len = Math.hypot(dx, dy) || 1;
      input.aimX = dx / len;
      input.aimY = dy / len;
      input.attack = bot.think % 18 < 6;
      input.block = bot.think % 40 < 6;
      if (dy > 1.2 || Math.abs(dx) > 3) input.jump = bot.think % 16 < 3;
      const wall = raycastClosest(world, tr.x, tr.y, tr.x + Math.sign(dx) * 0.5, tr.y);
      if (wall && !ctrl.grounded) input.jump = true;
    }
    if (tr.y < ctx.level.bounds.y + 2) input.jump = true;
    ctx.inputs[player.inputIndex] = input;
    entity.set(Bot, bot);
  });
}
