import type { Entity, World } from 'koota';
import type { LevelObject } from '../level/schema';

export type HazardView = {
  kind: number;
  param0: number;
  param1: number;
  param2: number;
  param3: number;
  hp: number;
  armed: number;
};

export type TransformView = { x: number; y: number; angle: number };

export type ControllerView = { grounded: boolean; ducking: boolean };

export type HazardModule = {
  typeId: string;
  kind: number;
  create: (world: World, obj: LevelObject) => Entity | undefined;
  step?: (world: World, entity: Entity, hz: HazardView, tr: TransformView, dt: number) => void;
  contact?: (
    world: World,
    player: Entity,
    hz: HazardView,
    ht: TransformView,
    ctrl: ControllerView,
    dt: number,
    hazard: Entity,
  ) => void;
};
