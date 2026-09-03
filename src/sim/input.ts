export interface PlayerInput {
  moveX: number;
  jump: boolean;
  down: boolean;
  attack: boolean;
  block: boolean;
  throw: boolean;
  aimX: number;
  aimY: number;
}

export const EMPTY_INPUT: PlayerInput = {
  moveX: 0,
  jump: false,
  down: false,
  attack: false,
  block: false,
  throw: false,
  aimX: 1,
  aimY: 0,
};

export function cloneInput(input: PlayerInput): PlayerInput {
  return { ...input };
}

export function blankInputs(count = 4): PlayerInput[] {
  return Array.from({ length: count }, () => cloneInput(EMPTY_INPUT));
}

export function rising(prev: boolean, next: boolean): boolean {
  return next && !prev;
}

export function normalizeInput(input: PlayerInput): PlayerInput {
  const moveX = Math.max(-1, Math.min(1, input.moveX));
  const aimLen = Math.hypot(input.aimX, input.aimY);
  const aimX = aimLen > 1e-6 ? input.aimX / aimLen : 1;
  const aimY = aimLen > 1e-6 ? input.aimY / aimLen : 0;
  return {
    moveX,
    jump: !!input.jump,
    down: !!input.down,
    attack: !!input.attack,
    block: !!input.block,
    throw: !!input.throw,
    aimX,
    aimY,
  };
}
