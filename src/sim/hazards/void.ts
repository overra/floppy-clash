import type { HazardModule } from './types';

/**
 * Void is out-of-bounds, not a physics body (PLAN Appendix D).
 * The kill is the bounds + killMargin check in `systems/damage.ts`.
 */
export const voidHazard: HazardModule = {
  typeId: 'void',
  kind: -1,
  create: () => undefined,
};
