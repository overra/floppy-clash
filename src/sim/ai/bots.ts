import { createQuery, Not, type Entity, type World } from 'koota';
import { getContext, type SimContext } from '../context';
import { cloneInput, EMPTY_INPUT, type PlayerInput } from '../input';
import { raycastClosest, type RayHit } from '../physics/queries';
import { combatAllowed } from '../rules/rounds';
import { weaponByIndex } from '../weapons/defs';
import type { WeaponDef } from '../weapons/schema';
import {
  Aim,
  Bot,
  Combat,
  Controller,
  Dead,
  Hazard,
  HazardKind,
  Health,
  Held,
  HeldBy,
  Loose,
  OwnedBy,
  Player,
  Projectile,
  Transform,
  Weapon,
} from '../traits';
import { navFor, predictLanding, routeStep, surfaceBelow, surfaceUnderFeet, type NavGraph } from './nav';

export const BotMode = { Hunt: 0, Fetch: 1, Recover: 2 } as const;

const bots = createQuery(Player, Controller, Transform, Aim);
const livePlayers = createQuery(Player, Transform, Not(Dead));
const looseWeapons = createQuery(Weapon, Loose, Transform);

type Fighter = { e: Entity; slot: number; x: number; y: number; vx: number; vy: number; hp: number; surf: number };
type Pickup = { e: Entity; x: number; y: number; def: WeaponDef; surf: number };
type Shot = { x: number; y: number; vx: number; vy: number; owner: Entity | undefined };
/** A laser emitter: the beam runs right from (x, y) for `reach`; `warn` is ticks until it fires (0 while firing). */
type Beam = { x: number; y: number; reach: number; armed: boolean; warn: number };

const hazards = createQuery(Hazard, Transform);

const DEADLY = new Set<number>([
  HazardKind.Lava,
  HazardKind.Spikes,
  HazardKind.Saw,
  HazardKind.Spikeball,
  HazardKind.Laser,
  HazardKind.Crusher,
]);

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function attachBots(world: World, slots: number[], skill = 0.75): void {
  world.query(Player).updateEach(([p], e) => {
    if (!slots.includes(p.slot) || e.has(Bot)) return;
    e.add(Bot({ slot: p.slot, think: p.slot * 7, skill, strafe: p.slot % 2 === 0 ? 1 : -1 }));
  });
}

function heldWeapon(world: World, player: Entity): { def: WeaponDef; ammo: number } | null {
  for (const weapon of world.query(Weapon, Held)) {
    if (weapon.targetFor(HeldBy) !== player) continue;
    const w = weapon.get(Weapon);
    if (!w) return null;
    return { def: weaponByIndex(w.defId), ammo: w.ammo };
  }
  return null;
}

function isDeadly(world: World, hit: RayHit | null): boolean {
  if (!hit || hit.kind !== 'hazard') return false;
  const e = hit.entity as Entity;
  if (!world.has(e)) return false;
  const hz = e.get(Hazard);
  return !!hz && DEADLY.has(hz.kind);
}

/** Static/prop geometry only: players, ragdolls, weapons, sensors and bullets never count as ground or walls. */
function solidOnly(self: Entity) {
  return (h: RayHit) =>
    h.entity === (self as unknown as number) ||
    h.kind === 'sensor' ||
    h.kind === 'projectile' ||
    h.kind === 'weapon' ||
    h.kind === 'player' ||
    h.kind === 'ragdoll';
}

/** Preferred engagement band for a weapon; melee wants to be in punching range. */
function rangeBand(def: WeaponDef | null): { min: number; max: number } {
  if (!def) return { min: 0, max: 1.1 };
  if (def.projectile.kind === 'melee') {
    // Blades reach a little past the fist; the blink knife closes its own gap.
    if (def.id === 'blink-dagger') return { min: 1, max: 4 };
    return { min: 0, max: 0.5 + def.projectile.radius };
  }
  switch (def.projectile.kind) {
    case 'pellets':
      return { min: 1.2, max: 4.5 };
    case 'grenade':
      return def.projectile.bounce === 0 ? { min: 1.5, max: 5 } : { min: 4, max: 10 };
    case 'burst-into':
      return { min: 4, max: 10 };
    case 'rocket':
      return { min: 4.5, max: 12 };
    case 'beam':
      return { min: 2, max: 9 };
    case 'creature':
      return { min: 2.5, max: 8 };
    case 'field':
      // Sprays are short; the anchored fields want to be lobbed from a safe distance.
      return def.id === 'black-hole' || def.id === 'time-bubble' ? { min: 5, max: 10 } : { min: 1.5, max: 4 };
    default:
      return def.id === 'sniper' ? { min: 5, max: 16 } : { min: 2.5, max: 9 };
  }
}

function collect(world: World, ctx: SimContext, nav: NavGraph) {
  const half = ctx.tuning.height / 2;
  const fighters: Fighter[] = [];
  world.query(livePlayers).updateEach(([p, tr], e) => {
    const body = ctx.bodies.get(e);
    const v = body?.getLinearVelocity();
    fighters.push({
      e,
      slot: p.slot,
      x: tr.x,
      y: tr.y,
      vx: v?.x ?? 0,
      vy: v?.y ?? 0,
      hp: e.get(Health)?.hp ?? 0,
      surf: surfaceBelow(nav, tr.x, tr.y - half),
    });
  });
  const pickups: Pickup[] = [];
  world.query(looseWeapons).updateEach(([w, tr], e) => {
    if (w.pickupCooldown > 0) return;
    pickups.push({ e, x: tr.x, y: tr.y, def: weaponByIndex(w.defId), surf: surfaceBelow(nav, tr.x, tr.y - 0.2, 2.5) });
  });
  const shots: Shot[] = [];
  world.query(Projectile).updateEach(([p], e) => {
    if (Math.hypot(p.vx, p.vy) < 4) return;
    shots.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, owner: e.targetFor(OwnedBy) });
  });
  const beams: Beam[] = [];
  world.query(hazards).updateEach(([hz, tr]) => {
    if (hz.kind !== HazardKind.Laser) return;
    // Mirrors laser.step(): unarmed for param0 ticks, then firing for param1, offset by param2.
    const off = hz.param0 || 90;
    const phase = (ctx.tick + (hz.param2 || 0)) % (off + (hz.param1 || 90));
    beams.push({ x: tr.x, y: tr.y, reach: hz.param3 || 14, armed: phase > off, warn: phase > off ? 0 : off + 1 - phase });
  });
  return { fighters, pickups, shots, beams };
}

export function thinkBots(world: World): void {
  const ctx = getContext(world);
  const t = ctx.tuning;
  const rng = ctx.rng;
  const live = combatAllowed(world);
  const bounds = ctx.level.bounds;
  const nav = navFor(ctx.level);
  let scene: ReturnType<typeof collect> | null = null;

  world.query(bots).updateEach(([player, ctrl, tr], entity) => {
    if (!entity.has(Bot) || entity.has(Dead)) return;
    const bot = entity.get(Bot);
    const body = ctx.bodies.get(entity);
    if (!bot || !body) return;
    scene ??= collect(world, ctx, nav);
    const { fighters, pickups, shots, beams } = scene;

    bot.think += 1;
    if (bot.timer > 0) bot.timer -= 1;
    if (bot.shunTicks > 0) bot.shunTicks -= 1;
    if (bot.reactTicks > 0) bot.reactTicks -= 1;
    if (bot.blockTicks > 0) bot.blockTicks -= 1;
    if (bot.detour > 0) bot.detour -= 1;
    bot.strafeTicks -= 1;
    if (bot.strafeTicks <= 0) {
      bot.strafe = rng.next() < 0.5 ? -1 : 1;
      bot.strafeTicks = 30 + rng.nextInt(50);
    }
    if (bot.think % 10 === 0) bot.aimErr = (rng.next() - 0.5) * (1 - bot.skill) * 0.6;

    const input: PlayerInput = cloneInput(EMPTY_INPUT);
    const px = tr.x;
    const py = tr.y;
    const feetY = py - t.height / 2;
    const v = body.getLinearVelocity();
    const skip = solidOnly(entity);
    const held = heldWeapon(world, entity);
    const def = held?.def ?? null;
    const ranged = !!def && def.projectile.kind !== 'melee';
    const outOfAmmo = !!held && !held.def.infiniteAmmo && held.ammo <= 0;

    // Where am I in the nav graph? Non-static platforms (movers, crumblers) are not nodes, so a
    // grounded bot with no node under it navigates by sight instead.
    const here = surfaceUnderFeet(nav, px, feetY);
    if (ctrl.grounded && here >= 0) bot.surf = here;
    const mySurf = ctrl.grounded ? here : bot.surf;
    const reachable = (surf: number) => surf < 0 || mySurf < 0 || surf === mySurf || routeStep(nav, mySurf, surf) !== null;

    // --- Targeting: stick to the current enemy unless another is decisively closer; prefer
    // enemies we can actually walk to.
    const enemies = fighters.filter((f) => f.e !== entity);
    const dist2 = (f: Fighter) => (f.x - px) ** 2 + (f.y - py) ** 2;
    let target = enemies.find((f) => f.slot === bot.target) ?? null;
    const pool = enemies.filter((f) => reachable(f.surf));
    const candidates = pool.length > 0 && !ranged ? pool : enemies;
    const nearest = candidates.reduce<Fighter | null>((best, f) => (!best || dist2(f) < dist2(best) ? f : best), null);
    if (!target || (nearest && bot.think % 30 === 0 && dist2(nearest) < dist2(target) * 0.5)) target = nearest;
    if (target && !ranged && !reachable(target.surf) && nearest && reachable(nearest.surf)) target = nearest;
    bot.target = target?.slot ?? -1;

    // --- Weapon fetching: unarmed (or dry) bots go for the nearest reachable gun.
    let pickup: Pickup | null = null;
    if (!held || outOfAmmo) {
      let bestScore = Infinity;
      for (const p of pickups) {
        const dx = p.x - px;
        const dy = p.y - py;
        if (Math.abs(dx) > 16 || dy > 6 || dy < -9) continue;
        if (bot.shunTicks > 0 && (p.e as unknown as number) === bot.shunned) continue;
        if (!reachable(p.surf)) continue;
        const under = raycastClosest(world, p.x, p.y + 0.2, p.x, p.y - 1.5, skip);
        if (!under || isDeadly(world, under)) continue;
        const score = Math.abs(dx) + Math.abs(dy) * 1.5 + (p.def.projectile.rare ? -3 : 0);
        if (score < bestScore) {
          bestScore = score;
          pickup = p;
        }
      }
    }

    let moveX = 0;
    let wantJump = false;
    let aimX = ctrl.facing;
    let aimY = 0;
    let attack = false;
    let navigating = false;
    let climbing = false;

    /** Follow the surface graph toward a goal on another surface. Returns false when no route exists. */
    const navigate = (goalSurf: number): boolean => {
      if (mySurf < 0 || goalSurf < 0 || goalSurf === mySurf) return false;
      const step = routeStep(nav, mySurf, goalSurf);
      if (!step) return false;
      // Ledges climbable from either side: take the approach nearest to where we stand.
      const hop = step.hop.alt && Math.abs(step.hop.alt.launchX - px) < Math.abs(step.hop.launchX - px) ? step.hop.alt : step.hop;
      navigating = true;
      if (ctrl.grounded) {
        const d = hop.launchX - px;
        const jumpDir = Math.sign(hop.landX - hop.launchX) || ctrl.facing;
        // Arriving at speed, take off a few ticks early: the jump is what stops us overshooting the
        // launch spot into whatever the gap holds.
        const closing = Math.sign(v.x) === jumpDir ? (Math.abs(v.x) * 3) / t.tickRate : 0;
        if (Math.abs(d) > 0.3 + closing) {
          moveX = clamp1(d * 2);
        } else {
          moveX = jumpDir;
          if (hop.rise > 0.05 || Math.abs(hop.landX - hop.launchX) > 0.9) wantJump = true;
        }
      } else {
        const d = hop.landX - px;
        moveX = Math.abs(d) < 0.15 ? 0 : clamp1(d * 2);
        if (hop.wall) {
          wantJump = true;
          climbing = true;
        }
      }
      return true;
    };

    const offStage = px < bounds.x + 0.4 || px > bounds.x + bounds.w - 0.4 || py < bounds.y + 1.2;
    if (offStage) {
      bot.mode = BotMode.Recover;
      moveX = Math.sign(bounds.x + bounds.w / 2 - px) || 1;
      wantJump = true;
      climbing = true;
    } else if (pickup && (!target || bot.mode === BotMode.Fetch || Math.abs(pickup.x - px) < Math.hypot(target.x - px, target.y - py) * 1.6)) {
      if (bot.mode !== BotMode.Fetch) {
        bot.mode = BotMode.Fetch;
        bot.timer = 300;
      }
      if (!navigate(pickup.surf)) {
        const dx = pickup.x - px;
        const dy = pickup.y - py;
        moveX = Math.abs(dx) < 0.12 ? 0 : clamp1(dx * 2.5);
        if (dy > 0.6 && Math.abs(dx) < 3 && ctrl.grounded) wantJump = true;
        // Standing over a gun that is out of reach below (buried under a corpse pile, wedged under
        // a lip): staring at it is not a plan.
        if (Math.abs(dx) < 0.35 && dy < -0.95) bot.timer = Math.min(bot.timer, 20);
      }
      if (target) {
        aimX = target.x - px;
        aimY = target.y - py;
      }
      if (bot.timer === 0) {
        // Couldn't get it: write this one off for a while and go fight.
        bot.mode = BotMode.Hunt;
        bot.shunned = pickup.e as unknown as number;
        bot.shunTicks = 600;
      }
    } else if (target) {
      bot.mode = BotMode.Hunt;
      const dx = target.x - px;
      const dy = target.y - py;
      const dist = Math.hypot(dx, dy);
      const band = rangeBand(def);
      const toward = Math.sign(dx) || ctrl.facing;
      const clear = ranged ? raycastClosest(world, px, py + 0.1, target.x, target.y, skip) : null;
      const los = !ranged || !clear || clear.fraction > 0.92;
      const inBand = ranged && los && dist >= band.min && dist <= band.max;

      if (inBand) {
        moveX = bot.strafe * 0.45;
      } else if (ranged && los && dist < band.min) {
        moveX = -toward * 0.9;
      } else if (!navigate(target.surf)) {
        if (mySurf >= 0 && target.surf >= 0 && target.surf !== mySurf) {
          // No route: hold this surface and wait for them (or a gun drop) rather than pace at a ledge.
          const s = nav.surfaces[mySurf]!;
          const want = Math.max(s.x1 + 0.6, Math.min(s.x2 - 0.6, target.x));
          moveX = Math.abs(want - px) < 0.3 ? 0 : clamp1((want - px) * 2);
        } else if (!ranged) {
          // Fists: close in, but stop short so the punch lands instead of walking through them.
          moveX = Math.abs(dx) < 0.7 ? 0 : clamp1(dx / 1.2);
          if (Math.abs(dx) < 0.7 && Math.abs(dy) > 1) moveX = bot.strafe * 0.6;
          if (dy > 1.1 && Math.abs(dx) < 4.5 && ctrl.grounded) wantJump = true;
        } else {
          moveX = toward;
          if (dy > 1.1 && Math.abs(dx) < 4.5 && ctrl.grounded) wantJump = true;
        }
      }

      // Aim with lead; lob gravity projectiles.
      let lead = 0;
      let lob = 0;
      if (ranged && def) {
        const speed = Math.max(8, def.projectile.speed);
        lead = dist / speed;
        if (def.projectile.gravity > 0) lob = 0.5 * def.projectile.gravity * lead * lead;
      }
      aimX = dx + target.vx * lead;
      aimY = dy + target.vy * lead + lob;
      const err = bot.aimErr;
      const ca = Math.cos(err);
      const sa = Math.sin(err);
      const rx = aimX * ca - aimY * sa;
      const ry = aimX * sa + aimY * ca;
      aimX = rx;
      aimY = ry;

      if (live) {
        if (!ranged) {
          const reach = def ? rangeBand(def).max + 0.4 : Math.max(t.punchRange, t.kickRange) + 0.55;
          const cadence = def ? Math.max(6, def.fireIntervalTicks) : Math.max(6, t.punchCooldownTicks);
          if (dist < reach && bot.think % cadence < 2) {
            if (def) {
              attack = true;
            } else {
              // Bare hands: a kick when they are turtling or just past punching range, and every third swing anyway.
              const tc = target.e.get(Combat);
              const kick = !!tc?.blocking || dist > t.punchRange + 0.5 || bot.think % 3 === 0;
              if (kick) input.kick = true;
              else attack = true;
            }
          }
        } else if (def && !outOfAmmo && dist < band.max * 1.4 && los) {
          const semi = def.fireMode === 'semi' || def.fireMode === 'burst';
          const interval = Math.max(semi ? 6 : 1, def.fireIntervalTicks);
          attack = semi ? bot.think % interval < 2 : bot.think % 50 < 38;
        }
        // Dry weapon: hurl it at them when close, then go find another.
        if (outOfAmmo && dist < 7 && bot.throwArmed === 0) {
          input.throw = true;
          bot.throwArmed = 30;
        }
      }
      if (bot.throwArmed > 0) bot.throwArmed -= 1;
    } else {
      bot.mode = BotMode.Hunt;
      moveX = 0;
    }

    // --- Countdown: hold position (the round isn't live; no reason to sprint onto a hazard).
    if (!live && !offStage) {
      moveX = 0;
      wantJump = false;
    }

    // --- Shoved into something the nav probes ignore (a corpse against a wall, a stacked
    // fighter, a crate): running flat out and not moving for a fifth of a second means hop it.
    const shoving = live && ctrl.grounded && Math.abs(moveX) > 0.5 && Math.abs(v.x) < 0.6 && !wantJump;
    bot.blocked = shoving ? bot.blocked + 1 : 0;
    if (bot.blocked >= 12) {
      wantJump = true;
      bot.blocked = 0;
    }

    // --- Progress watchdog: stalled for ~1.5 s while trying to move → detour the other way briefly.
    if (bot.think % 90 === 0) {
      const moved = Math.hypot(px - bot.stuckX, py - bot.stuckY);
      if (live && moveX !== 0 && moved < 0.5 && bot.detour === 0) {
        bot.detour = 40;
        bot.detourDir = -(Math.sign(moveX) || bot.strafe);
      }
      bot.stuckX = px;
      bot.stuckY = py;
    }
    if (bot.detour > 0 && !offStage) {
      moveX = bot.detourDir;
      wantJump = ctrl.grounded && bot.detour > 30;
      navigating = false;
    }

    // --- Local navigation: walls, ledges, deadly floors, and stacked players.
    let wallAhead = false;
    if (moveX !== 0) {
      const dir = Math.sign(moveX);
      const wallHi = raycastClosest(world, px, py + 0.3, px + dir * 0.75, py + 0.3, skip);
      const wallLo = raycastClosest(world, px, py - 0.6, px + dir * 0.75, py - 0.6, skip);
      wallAhead = !!(wallHi || wallLo);
      if (wallAhead && ctrl.grounded) wantJump = true;
      const aheadX = px + dir * 1.0;
      const ledge = raycastClosest(world, aheadX, py, aheadX, py - 2.6, skip);
      const deadlyAhead = ledge !== null && isDeadly(world, ledge);
      // On a route the graph already placed the launch point before any spike strip; a sweeping
      // saw that wandered underfoot is hopped rather than strolled into.
      if (navigating && deadlyAhead && ctrl.grounded) wantJump = true;
      // Recovering from off-stage, the only way is back in: never let the ledge check turn us round.
      if (!navigating && !offStage) {
        if (!ledge || deadlyAhead) {
          const deep = ledge ?? raycastClosest(world, aheadX, py, aheadX, bounds.y - 2, skip);
          const dangerous = !deep || isDeadly(world, deep);
          const goalAcross =
            (target && bot.mode === BotMode.Hunt && Math.sign(target.x - px) === dir && Math.abs(target.x - px) > 1.4 && target.y > py - 1.5) ||
            (bot.mode === BotMode.Fetch && pickup && Math.sign(pickup.x - px) === dir && pickup.y > py - 1.5);
          if (ctrl.grounded && goalAcross && !dangerous) {
            wantJump = true;
          } else if (dangerous) {
            moveX = -dir * 0.5;
            bot.strafe = -dir;
            bot.strafeTicks = 40;
          }
        }
      }
    }
    for (const other of fighters) {
      if (other.e === entity) continue;
      const dx = other.x - px;
      const dy = other.y - py;
      if (Math.abs(dx) < 0.75 && Math.abs(dy) > 0.9 && Math.abs(dy) < 2.4) {
        moveX = bot.strafe;
        if (dy < 0 && ctrl.grounded) wantJump = true;
      }
    }

    // --- In flight: look where this arc comes down. Chasing a target that doubled back mid-jump
    // must not end on a spike strip or in the void when steering the other way (or coasting) lands
    // on something solid.
    // --- Lasers: the beam kills at chest height only, so one standing in it is hopped just as it
    // fires (the airtime outlasts the burst); beams firing within a flight's duration are kill
    // bands for the arc checks below.
    const bands = beams
      .filter((b) => b.armed || b.warn < 60)
      .map((b) => ({ x1: b.x - 0.3, x2: b.x + b.reach + 0.3, y1: b.y - 0.45, y2: b.y + 0.45 }));
    if (live && ctrl.grounded) {
      for (const b of beams) {
        if (px < b.x - 0.3 || px > b.x + b.reach + 0.3 || Math.abs(py - b.y) > 0.55) continue;
        const reaction = Math.round(3 + (1 - bot.skill) * 10);
        if (!b.armed && b.warn <= reaction) wantJump = true;
        else if (b.armed) wantJump = true;
      }
    }

    if (!ctrl.grounded && !climbing && !offStage) {
      const lands = (dir: number) => {
        const land = predictLanding(nav, px, feetY, v.x, v.y, dir, t, bands);
        if (land.deadly || land.surf < 0) return false;
        const under = raycastClosest(world, land.x, land.feet + 0.5, land.x, land.feet - 0.3, skip);
        return !isDeadly(world, under);
      };
      if (!lands(moveX)) {
        const flip = -(Math.sign(moveX) || Math.sign(v.x) || ctrl.facing);
        if (lands(flip)) moveX = flip;
        else if (moveX !== 0 && lands(0)) moveX = 0;
      }
    } else if (wantJump && ctrl.grounded && !offStage) {
      // Don't leap head-first into a saw hanging over this spot, or through a beam about to fire;
      // walk on and jump once clear. A beam through our own chest is the exception: that jump is
      // the escape.
      const inBeam = bands.some((b) => px > b.x1 && px < b.x2 && py > b.y1 && py < b.y2);
      if (!inBeam && predictLanding(nav, px, feetY, v.x, t.jumpSpeed, moveX, t, bands).deadly) {
        wantJump = false;
        // Something the graph does not know about (a crate, a breakable block) stands between us
        // and a pit, and a full-push hop over it would carry us into the pit. A gentle hop that
        // comes down on or just past the obstacle is fine; without it the bot runs into the block
        // until the watchdog turns it round, forever.
        if (wallAhead) {
          moveX = Math.sign(moveX) * 0.25;
          wantJump = !predictLanding(nav, px, feetY, v.x, t.jumpSpeed, moveX, t, bands).deadly;
        }
      }
    }

    // --- Defense: block bullets that are about to arrive; rarely guess at point-blank punches.
    let threat: Shot | null = null;
    for (const s of shots) {
      if (s.owner === entity) continue;
      const rx = px - s.x;
      const ry = py - s.y;
      const sp = Math.hypot(s.vx, s.vy);
      const along = (rx * s.vx + ry * s.vy) / sp;
      if (along < 0 || along > 9) continue;
      const perp = Math.abs(rx * s.vy - ry * s.vx) / sp;
      if (perp < 1.1) {
        threat = s;
        break;
      }
    }
    if (threat && bot.blockTicks === 0 && bot.reactTicks === 0) {
      bot.reactTicks = 24;
      if (rng.next() < bot.skill * 0.85) bot.blockTicks = 14;
    }
    if (bot.blockTicks > 0) {
      input.block = true;
      attack = false;
      if (threat) {
        aimX = threat.x - px;
        aimY = threat.y - py;
      }
    } else if (target && !ranged && Math.hypot(target.x - px, target.y - py) < 1.6) {
      const tc = target.e.get(Combat);
      if (tc?.strikeActive && rng.next() < 0.3) bot.blockTicks = 8;
    }

    // --- Emit the frame's input. Jumps are pulsed so the controller sees rising edges; airborne
    // jump presses are only allowed when deliberately wall-climbing, otherwise a bot brushing a
    // ledge would wall-kick itself off the stage.
    const wallTouch =
      !ctrl.grounded &&
      moveX !== 0 &&
      !!raycastClosest(world, px, py + 0.15, px + Math.sign(moveX) * t.wallDetectDistance, py + 0.15, skip);
    const tallWall =
      wallTouch && !!raycastClosest(world, px, py + 1.6, px + Math.sign(moveX) * (t.wallDetectDistance + 0.2), py + 1.6, skip);
    input.moveX = clamp1(moveX);
    if (ctrl.grounded || ctrl.coyote > 0) input.jump = wantJump && bot.think % 2 === 0;
    else input.jump = wantJump && climbing && tallWall && bot.think % 6 === 0;
    input.attack = attack;
    const alen = Math.hypot(aimX, aimY);
    input.aimX = alen > 1e-6 ? aimX / alen : ctrl.facing;
    input.aimY = alen > 1e-6 ? aimY / alen : 0;

    ctx.inputs[player.inputIndex] = input;
    ctx.rawInputs[player.inputIndex] = { ...input };
    entity.set(Bot, bot);
  });
}
