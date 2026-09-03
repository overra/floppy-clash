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
  Health,
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

/** PLAN 4.14: short look-ahead; pit ray is opt-in (grounded only — mid-air misses the floor). */
export function hazardAhead(
  world: World,
  x: number,
  y: number,
  dir: number,
  opts: { checkPit?: boolean } = {},
): boolean {
  let danger = false;
  const lookX = x + dir * 1.4;
  world.query(Hazard, Transform).updateEach(([hz, ht]) => {
    if (!AVOID.has(hz.kind)) return;
    if (Math.abs(ht.x - lookX) < 1.6 && Math.abs(ht.y - y) < 2.2) danger = true;
  });
  if (opts.checkPit !== false) {
    const pit = raycastClosest(world, lookX, y, lookX, y - 3.2);
    if (!pit) danger = true;
  }
  return danger;
}

function ignoreNonWalls(hit: { kind: string }): boolean {
  return (
    hit.kind === 'sensor' ||
    hit.kind === 'projectile' ||
    hit.kind === 'player' ||
    hit.kind === 'ragdoll' ||
    hit.kind === 'weapon'
  );
}

/** Horizontal wall probe used by the climb heuristic (PLAN 4.14). */
export function wallToward(world: World, x: number, y: number, dir: number): boolean {
  const sign = Math.sign(dir) || 1;
  return Boolean(raycastClosest(world, x, y, x + sign * 0.55, y, ignoreNonWalls));
}

/**
 * PLAN 2.2 / 4.14: press into the nearer shaft wall so wall-jumps bounce
 * instead of always driving toward the target (which never slides the far wall).
 */
export function nearerWallDir(world: World, x: number, y: number): number {
  const right = raycastClosest(world, x, y, x + 0.55, y, ignoreNonWalls);
  const left = raycastClosest(world, x, y, x - 0.55, y, ignoreNonWalls);
  const rd = right ? Math.hypot(right.x - x, right.y - y) : 99;
  const ld = left ? Math.hypot(left.x - x, left.y - y) : 99;
  if (rd > 0.6 && ld > 0.6) return 0;
  return rd <= ld ? 1 : -1;
}

/** Climb when a wall is in the move dir and the bot is airborne or the target is above. */
export function shouldClimb(opts: { grounded: boolean; dy: number; wall: boolean }): boolean {
  return opts.wall && (!opts.grounded || opts.dy > 1);
}

export function attachBots(world: World, slots: number[]): void {
  world.query(Player).updateEach(([p], e) => {
    if (slots.includes(p.slot)) e.add(Bot({ slot: p.slot, think: 0 }));
  });
}

export function thinkBots(world: World): void {
  const ctx = getContext(world);
  if (ctx.holdBots) return;
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
      else if (
        Math.hypot(ot.x - tr.x, ot.y - tr.y) < Math.hypot(target.cur.x - tr.x, target.cur.y - tr.y)
      ) {
        target.cur = { x: ot.x, y: ot.y };
      }
    });
    const looseT = nearestLoose(world, tr.x, tr.y);
    const armed = isArmed(world, entity);
    let climbing = false;
    if (!armed && looseT && Math.hypot(looseT.x - tr.x, looseT.y - tr.y) < 8) {
      input.moveX = Math.sign(looseT.x - tr.x);
      if (looseT.y > tr.y + 1) input.jump = bot.think % 20 < 2;
    } else if (target.cur) {
      const dx = target.cur.x - tr.x;
      const dy = target.cur.y - tr.y;
      const dist = Math.hypot(dx, dy);
      const hp = entity.get(Health)?.hp ?? 100;
      const maxHp = entity.get(Health)?.maxHp ?? 100;
      const retreat = (armed && dist < 2.15) || hp < maxHp * 0.35;
      // Vertical stack (dx≈0, dy≈1.6) is outside punchRadius; sidestep so the
      // 0.9+0.45 fist sphere can connect instead of bouncing in place.
      const stacked = !retreat && Math.abs(dx) < 0.65 && dist < 2.8;
      if (retreat) input.moveX = -(Math.sign(dx) || 1);
      else if (stacked) {
        input.moveX = Math.abs(dx) < 0.05 ? (bot.slot % 2 === 0 ? 1 : -1) : tr.x >= target.cur.x ? 1 : -1;
      } else {
        input.moveX = Math.max(-1, Math.min(1, dx * 0.35 || Math.sign(dx)));
      }
      const len = dist || 1;
      const noise = ctx.rng.range(-0.12, 0.12);
      const noiseY = ctx.rng.range(-0.12, 0.12);
      input.aimX = dx / len + noise;
      input.aimY = dy / len + noiseY;
      input.attack = !retreat && bot.think % 18 < 6;
      input.block = bulletApproaching(world, tr.x, tr.y);
      if (dy > 1.2 || Math.abs(dx) > 3) input.jump = bot.think % 16 < 3;
      const prefer = Math.sign(input.moveX) || Math.sign(dx) || ctrl.facing || 1;
      const near = nearerWallDir(world, tr.x, tr.y);
      const climbDir = near || prefer;
      climbing = shouldClimb({
        grounded: ctrl.grounded,
        dy,
        wall: near !== 0 || wallToward(world, tr.x, tr.y, climbDir),
      });
      if (climbing) {
        input.moveX = climbDir;
        input.jump = true;
      }
    }
    const dir = Math.sign(input.moveX) || ctrl.facing || 1;
    // Pit rays from mid-air miss the floor; do not reverse an active climb.
    if (!climbing && hazardAhead(world, tr.x, tr.y, dir, { checkPit: ctrl.grounded })) {
      input.moveX = -dir;
      input.jump = true;
    }
    if (tr.y < ctx.level.bounds.y + 2) input.jump = true;
    ctx.inputs[player.inputIndex] = input;
    entity.set(Bot, bot);
  });
}
