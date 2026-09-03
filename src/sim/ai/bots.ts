import { createQuery, type Entity, type World } from 'koota';
import { getContext } from '../context';
import { cloneInput, EMPTY_INPUT } from '../input';
import { raycastClosest } from '../physics/queries';
import {
  Aim,
  Bot,
  Controller,
  Dead,
  Hazard,
  HazardKind,
  Held,
  HeldBy,
  Loose,
  Player,
  Projectile,
  Transform,
  Weapon,
} from '../traits';

const bots = createQuery(Player, Controller, Transform, Aim);

const AVOID = new Set<number>([
  HazardKind.Lava,
  HazardKind.Spikes,
  HazardKind.Saw,
  HazardKind.Spikeball,
  HazardKind.Crusher,
  HazardKind.Laser,
]);

function isArmed(world: World, entity: Entity): boolean {
  for (const weapon of world.query(Weapon, Held)) {
    if (weapon.targetFor(HeldBy) === entity) return true;
  }
  return false;
}

function nearestLoose(world: World, x: number, y: number): { x: number; y: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined;
  world.query(Weapon, Loose, Transform).updateEach(([_w, lt]) => {
    const d = Math.hypot(lt.x - x, lt.y - y);
    if (!best || d < best.d) best = { x: lt.x, y: lt.y, d };
  });
  return best;
}

/** PLAN 4.14: block when a bullet is approaching. */
export function bulletApproaching(world: World, x: number, y: number): boolean {
  let danger = false;
  world.query(Projectile).updateEach(([p]) => {
    const dx = x - p.x;
    const dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 7 || dist < 1e-4) return;
    const closing = (p.vx * dx + p.vy * dy) / dist;
    if (closing > 8) danger = true;
  });
  return danger;
}

function hazardAhead(world: World, x: number, y: number, dir: number): boolean {
  let danger = false;
  const lookX = x + dir * 1.4;
  world.query(Hazard, Transform).updateEach(([hz, ht]) => {
    if (!AVOID.has(hz.kind)) return;
    if (Math.abs(ht.x - lookX) < 1.6 && Math.abs(ht.y - y) < 2.2) danger = true;
  });
  const pit = raycastClosest(world, lookX, y, lookX, y - 3.2);
  if (!pit) danger = true;
  return danger;
}

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
    const looseT = nearestLoose(world, tr.x, tr.y);
    const armed = isArmed(world, entity);
    if (!armed && looseT && Math.hypot(looseT.x - tr.x, looseT.y - tr.y) < 8) {
      input.moveX = Math.sign(looseT.x - tr.x);
      if (looseT.y > tr.y + 1) input.jump = bot.think % 20 < 2;
    } else if (target.cur) {
      const dx = target.cur.x - tr.x;
      const dy = target.cur.y - tr.y;
      input.moveX = Math.max(-1, Math.min(1, dx * 0.35));
      const len = Math.hypot(dx, dy) || 1;
      const noise = ctx.rng.range(-0.12, 0.12);
      const noiseY = ctx.rng.range(-0.12, 0.12);
      input.aimX = dx / len + noise;
      input.aimY = dy / len + noiseY;
      input.attack = bot.think % 18 < 6;
      input.block = bulletApproaching(world, tr.x, tr.y) || bot.think % 40 < 6;
      if (dy > 1.2 || Math.abs(dx) > 3) input.jump = bot.think % 16 < 3;
      const wall = raycastClosest(world, tr.x, tr.y, tr.x + Math.sign(dx) * 0.5, tr.y);
      if (wall && !ctrl.grounded) input.jump = true;
    }
    const dir = Math.sign(input.moveX) || ctrl.facing || 1;
    if (hazardAhead(world, tr.x, tr.y, dir)) {
      input.moveX = -dir;
      input.jump = true;
    }
    if (tr.y < ctx.level.bounds.y + 2) input.jump = true;
    ctx.inputs[player.inputIndex] = input;
    entity.set(Bot, bot);
  });
}
