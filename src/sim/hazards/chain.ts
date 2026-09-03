import { RevoluteJoint, type Body } from 'planck';
import { getContext } from '../context';
import { assignNetId, createBoxBody, registerBody } from '../physics/bodies';
import { Destructible, Hazard, HazardKind, NetId, PrevTransform, Solid, Static, Transform } from '../traits';
import { spawnHazardEntity } from './common';
import type { HazardModule } from './types';

/** Shared negative group: links and the hung deck never collide with each other. */
const CHAIN_GROUP = -11;

export function isolateChainBody(body: Body): void {
  body.setLinearDamping(0.18);
  body.setAngularDamping(1.6);
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    f.setFilterGroupIndex(CHAIN_GROUP);
  }
}

export const chain: HazardModule = {
  typeId: 'chain',
  kind: HazardKind.Chain,
  create(world, obj) {
    const ctx = getContext(world);
    const entity = spawnHazardEntity(world, obj, HazardKind.Chain);
    const links = obj.links ?? 5;
    entity.add(Static(), Destructible({ hp: 40, maxHp: 40 }));
    const anchor = createBoxBody(ctx.physics, entity, 'solid', obj.x, obj.y, 0.1, 0.1, 'static');
    registerBody(world, entity, anchor);
    let prevBody = anchor;
    let prevNet = entity.get(NetId)?.id ?? 0;
    let lastNet = 0;
    for (let i = 0; i < links; i++) {
      const ly = obj.y - (i + 1) * 0.35;
      const link = world.spawn(
        Transform({ x: obj.x, y: ly, angle: 0 }),
        PrevTransform({ x: obj.x, y: ly, angle: 0 }),
        Hazard({ kind: HazardKind.Chain, param0: i, param1: prevNet, param2: 0, param3: 0, hp: 20, armed: 1 }),
        Destructible({ hp: 20, maxHp: 20 }),
      );
      lastNet = assignNetId(world, link);
      prevNet = lastNet;
      const body = createBoxBody(ctx.physics, link, 'prop', obj.x, ly, 0.08, 0.16, 'dynamic', {
        density: 0.4,
        friction: 0.3,
        fixedRotation: false,
      });
      isolateChainBody(body);
      registerBody(world, link, body);
      ctx.physics.createJoint(
        new RevoluteJoint(
          { collideConnected: false, enableLimit: true, lowerAngle: -0.8, upperAngle: 0.8 },
          prevBody,
          body,
          { x: obj.x, y: obj.y - i * 0.35 },
        ),
      );
      prevBody = body;
    }
    // PLAN Appendix D: hanging links can carry a platform.
    const platW = obj.w ?? 2.8;
    const platH = obj.h ?? 0.4;
    const platY = obj.y - links * 0.35 - platH * 0.5 - 0.12;
    const platform = spawnHazardEntity(
      world,
      { ...obj, x: obj.x, y: platY, w: platW, h: platH },
      HazardKind.Chain,
    );
    const ph = platform.get(Hazard);
    if (ph) platform.set(Hazard, { ...ph, param3: 1, param0: platW, param1: platH, param2: lastNet });
    platform.add(Destructible({ hp: 40, maxHp: 40 }), Solid());
    const deck = createBoxBody(
      ctx.physics,
      platform,
      'prop',
      obj.x,
      platY,
      platW / 2,
      platH / 2,
      'dynamic',
      { density: 0.45, friction: 1.15, restitution: 0, fixedRotation: true },
    );
    isolateChainBody(deck);
    registerBody(world, platform, deck);
    // PLAN Appendix D: hung deck is a dynamic body on a revolute, not a kinematic follow.
    ctx.physics.createJoint(
      new RevoluteJoint(
        { collideConnected: false, enableLimit: true, lowerAngle: -0.35, upperAngle: 0.35 },
        prevBody,
        deck,
        { x: obj.x, y: platY + platH / 2 + 0.06 },
      ),
    );
    return entity;
  },
  step(world, entity, hz, _tr, _dt) {
    if (hz.param3 !== 1 || hz.param2 <= 0) return;
    const ctx = getContext(world);
    const deck = ctx.bodies.get(entity);
    if (!deck) return;
    let hangLive = false;
    world.query(Hazard, Transform, NetId).updateEach(([h, _t, n]) => {
      if (h.kind !== HazardKind.Chain || h.param3 === 1 || n.id !== hz.param2) return;
      hangLive = true;
    });
    if (!hangLive && deck.getType() !== 'dynamic') deck.setDynamic();
  },
  contact(world, player, hz, ht, ctrl, _dt, hazard) {
    if (hz.param3 !== 1) return;
    const pt = player.get(Transform);
    if (!pt) return;
    const halfW = (hz.param0 || 2.8) / 2 + 0.35;
    const halfH = (hz.param1 || 0.4) / 2;
    if (Math.abs(pt.x - ht.x) >= halfW) return;
    if (pt.y <= ht.y - 0.05 || pt.y >= ht.y + halfH + 1.55) return;
    ctrl.grounded = true;
    const ctx = getContext(world);
    const pb = ctx.bodies.get(hazard);
    const body = ctx.bodies.get(player);
    if (pb && body) {
      const pv = pb.getLinearVelocity();
      const v = body.getLinearVelocity();
      body.setLinearVelocity({ x: pv.x + (v.x - pv.x) * 0.25, y: Math.min(v.y, pv.y) });
    }
  },
};
