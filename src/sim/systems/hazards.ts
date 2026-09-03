import { createQuery, Not, type Entity, type World } from 'koota';
import { Vec2 } from 'planck';
import { getContext } from '../context';
import { takeDamage } from '../player/health';
import { spawnWeapon } from './weapons';
import { weaponByIndex } from '../weapons/defs';
import { Controller, Dead, Destructible, Hazard, HazardKind, Player, StandingOn, Transform } from '../traits';

const hazards = createQuery(Hazard, Transform);
const lavaTouch = new Map<number, number>();

function kill(world: World, player: Entity, x: number, y: number): void {
  takeDamage(world, player, 9999, 'body', -1, x, y, true);
}

export function hazardsStep(world: World): void {
  const ctx = getContext(world);
  const dt = 1 / ctx.tuning.tickRate;

  world.query(hazards).updateEach(([hz, tr], entity) => {
    const body = ctx.bodies.get(entity);
    switch (hz.kind) {
      case HazardKind.MovingPlatform: {
        const pathLen = Math.max(2, Math.round(hz.param0));
        const speed = hz.param1 || 3;
        const pingpong = hz.param2 >= 1;
        hz.param3 += dt * speed;
        void pathLen;
        void pingpong;
        if (body) {
          const targetX = tr.x + Math.sin(hz.param3) * (hz.param0 || 4);
          const targetY = tr.y + Math.cos(hz.param3 * 0.35) * (hz.param1 > 4 ? 0 : 0);
          const p = body.getPosition();
          body.setLinearVelocity(new Vec2((targetX - p.x) / dt, (targetY - p.y) / dt));
        }
        break;
      }
      case HazardKind.RotatingPlatform: {
        if (body) body.setAngularVelocity(hz.param0 || 1);
        break;
      }
      case HazardKind.Disappearing: {
        const period = hz.param0 || 180;
        const phase = (ctx.tick + (hz.param1 || 0)) % period;
        const solid = phase < period * 0.55;
        hz.armed = solid ? 1 : 0;
        if (body) body.setActive(solid);
        break;
      }
      case HazardKind.Collapsing: {
        if (hz.armed === 1) {
          let stood = false;
          world.query(Player, Transform, Not(Dead)).updateEach(([_p, pt]) => {
            if (Math.abs(pt.x - tr.x) < (hz.param0 || 2) && pt.y > tr.y && pt.y < tr.y + 1.4) stood = true;
          });
          if (stood) hz.param1 += 1;
          if (hz.param1 > (hz.param2 || 20) && body) {
            body.setType('dynamic');
            hz.armed = 0;
          }
        }
        break;
      }
      case HazardKind.Lava: {
        if (hz.param0 !== 0) tr.y += hz.param0 * dt;
        if (body) body.setPosition(new Vec2(tr.x, tr.y));
        break;
      }
      case HazardKind.Saw: {
        if (body) {
          body.setAngularVelocity(hz.param0 || 6);
          if (hz.param1 > 0) {
            const ox = Math.sin(ctx.tick / 40) * hz.param1;
            body.setLinearVelocity(new Vec2((tr.x + ox - body.getPosition().x) / dt, 0));
          }
        }
        break;
      }
      case HazardKind.Laser: {
        const cycle = (hz.param0 || 90) + (hz.param1 || 90);
        const phase = (ctx.tick + (hz.param2 || 0)) % cycle;
        hz.armed = phase > (hz.param0 || 90) ? 1 : 0;
        break;
      }
      case HazardKind.Crusher: {
        const t = Math.sin(ctx.tick / (hz.param0 || 50));
        if (body) body.setLinearVelocity(new Vec2(t * (hz.param1 || 4), 0));
        break;
      }
      case HazardKind.Spikeball: {
        if (body) body.setAngularVelocity(3);
        break;
      }
      case HazardKind.TriggerDrop: {
        if (hz.armed && ctx.tick >= hz.param0) {
          const def = weaponByIndex(hz.param1 || 1);
          spawnWeapon(world, def.id, tr.x, tr.y);
          hz.armed = 0;
        }
        break;
      }
      default:
        break;
    }
  });

  world.query(Player, Transform, Controller, Not(Dead)).updateEach(([_p, pt, ctrl], player) => {
    world.query(hazards).updateEach(([hz, ht], hazard) => {
      const dx = Math.abs(pt.x - ht.x);
      const dy = Math.abs(pt.y - ht.y);
      const near = dx < 1.6 && dy < 1.6;
      if (!near && hz.kind !== HazardKind.Laser && hz.kind !== HazardKind.Conveyor) return;
      switch (hz.kind) {
        case HazardKind.Spikes:
        case HazardKind.Saw:
        case HazardKind.Spikeball:
          if (dx < 0.7 && dy < 0.7) kill(world, player, pt.x, pt.y);
          break;
        case HazardKind.Lava:
          if (dx < (hz.param1 || 4) && pt.y < ht.y + 0.6 && pt.y > ht.y - 1) {
            const last = lavaTouch.get(player) ?? -999;
            if (ctx.tick - last >= ctx.tuning.lavaCooldownTicks) {
              takeDamage(world, player, ctx.tuning.lavaDamage, 'body', -1, pt.x, pt.y);
              lavaTouch.set(player, ctx.tick);
              const body = ctx.bodies.get(player);
              if (body) {
                const v = body.getLinearVelocity();
                body.setLinearVelocity(new Vec2(v.x, v.y + 8));
              }
            }
          }
          break;
        case HazardKind.Laser:
          if (hz.armed) {
            const reach = hz.param3 || 14;
            if (Math.abs(pt.y - ht.y) < 0.35 && pt.x > ht.x && pt.x < ht.x + reach) {
              kill(world, player, pt.x, pt.y);
            }
          }
          break;
        case HazardKind.Conveyor: {
          if (ctrl.grounded && dx < (hz.param0 || 3) && dy < 1.1) {
            const body = ctx.bodies.get(player);
            if (body && !ctrl.ducking) {
              const v = body.getLinearVelocity();
              body.setLinearVelocity(new Vec2(v.x + (hz.param1 || 4) * dt * 8, v.y));
            }
          }
          break;
        }
        case HazardKind.Bounce:
          if (ctrl.grounded && dx < (hz.param0 || 1.2) && dy < 1) {
            const body = ctx.bodies.get(player);
            if (body) {
              const v = body.getLinearVelocity();
              body.setLinearVelocity(new Vec2(v.x, hz.param1 || 16));
            }
          }
          break;
        case HazardKind.Crusher:
          if (dx < 0.5 && dy < 0.8) kill(world, player, pt.x, pt.y);
          break;
        case HazardKind.MovingPlatform:
        case HazardKind.RotatingPlatform:
          if (ctrl.grounded && dx < 2.4 && pt.y > ht.y && pt.y < ht.y + 1.4) {
            player.add(StandingOn(hazard));
            const pb = ctx.bodies.get(hazard);
            const body = ctx.bodies.get(player);
            if (pb && body) {
              const pv = pb.getLinearVelocity();
              const v = body.getLinearVelocity();
              body.setLinearVelocity(new Vec2(v.x + pv.x * dt * 10, v.y + pv.y));
            }
          }
          break;
        default:
          break;
      }
    });
  });

  world.query(Destructible).updateEach(([d], entity) => {
    if (d.hp <= 0) ctx.pendingDestroy.push(entity);
  });
}
