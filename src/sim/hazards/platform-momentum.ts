import { Box, PrismaticJoint, RevoluteJoint } from 'planck';
import { getContext } from '../context';
import { HazardKind } from '../traits';
import { createKinematicBox } from './common';
import type { HazardModule } from './types';

/**
 * Tilts and sinks under weight (PLAN Appendix D):
 * static anchor → prismatic slider → revolute → dynamic deck.
 * Two joints on three bodies so the deck is not overconstrained.
 */
export const momentumPlatform: HazardModule = {
  typeId: 'platform.momentum',
  kind: HazardKind.Momentum,
  create(world, obj) {
    const entity = createKinematicBox(world, obj, HazardKind.Momentum, {
      dynamic: true,
      density: 0.35,
    });
    const ctx = getContext(world);
    const deck = ctx.bodies.get(entity);
    if (!deck) return entity;
    const anchor = ctx.physics.createBody({ type: 'static', position: { x: obj.x, y: obj.y } });
    const slider = ctx.physics.createBody({
      type: 'dynamic',
      position: { x: obj.x, y: obj.y },
      fixedRotation: true,
      allowSleep: false,
    });
    slider.createFixture({
      shape: new Box(0.08, 0.08),
      density: 0.15,
      isSensor: true,
    });
    ctx.physics.createJoint(
      new PrismaticJoint(
        {
          collideConnected: false,
          enableLimit: true,
          lowerTranslation: -0.8,
          upperTranslation: 0.05,
          enableMotor: true,
          maxMotorForce: 6,
          motorSpeed: 0.35,
        },
        anchor,
        slider,
        { x: obj.x, y: obj.y },
        { x: 0, y: 1 },
      ),
    );
    ctx.physics.createJoint(
      new RevoluteJoint(
        {
          collideConnected: false,
          enableLimit: true,
          lowerAngle: -0.55,
          upperAngle: 0.55,
          enableMotor: true,
          maxMotorTorque: 6,
          motorSpeed: 0,
        },
        slider,
        deck,
        { x: obj.x, y: obj.y },
      ),
    );
    return entity;
  },
};
