import { PrismaticJoint, RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { HazardKind } from '../traits';
import { createKinematicBox } from './common';
import type { HazardModule } from './types';

/** Tilts / sinks under weight (PLAN Appendix D): dynamic deck + spring joints. */
export const momentumPlatform: HazardModule = {
  typeId: 'platform.momentum',
  kind: HazardKind.Momentum,
  create(world, obj) {
    const entity = createKinematicBox(world, obj, HazardKind.Momentum, {
      dynamic: true,
      density: 0.8,
    });
    const ctx = getContext(world);
    const deck = ctx.bodies.get(entity);
    if (!deck) return entity;
    const anchor = ctx.physics.createBody({ type: 'static', position: { x: obj.x, y: obj.y } });
    ctx.physics.createJoint(
      new RevoluteJoint(
        {
          collideConnected: false,
          enableLimit: true,
          lowerAngle: -0.45,
          upperAngle: 0.45,
          enableMotor: true,
          maxMotorTorque: 80,
          motorSpeed: 0,
        },
        anchor,
        deck,
        { x: obj.x, y: obj.y },
      ),
    );
    ctx.physics.createJoint(
      new PrismaticJoint(
        {
          collideConnected: false,
          enableLimit: true,
          lowerTranslation: -0.6,
          upperTranslation: 0.15,
          enableMotor: true,
          maxMotorForce: 40,
          motorSpeed: 0.8,
        },
        anchor,
        deck,
        { x: obj.x, y: obj.y },
        { x: 0, y: 1 },
      ),
    );
    return entity;
  },
};
