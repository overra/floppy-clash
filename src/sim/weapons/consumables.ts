import type { Entity, World } from 'koota';
import { emit } from '../context';
import { isLaunch } from '../rules/mode';
import { EffectKind, Health, Modifiers } from '../traits';
import type { WeaponDef } from './schema';

/** Mend Kit: hp back in standing mode, percent off in launch mode. */
const MEND_HP = 50;
const MEND_PERCENT = 60;
/** Lead Coat: heavy for ten seconds. */
const LEAD_TICKS = 600;
/** Sprint Charm: quick for twelve seconds. */
const SPRINT_TICKS = 720;
/** Mirror Pin: projectiles bounce off for ten seconds. */
const MIRROR_TICKS = 600;

export const NO_EFFECT = { speed: 1, jump: 1, knockbackTaken: 1, reflect: 0, ticks: 0, kind: EffectKind.None };

/** Apply a consumable to the fighter who touched it. Returns false when the def is not a consumable. */
export function consume(world: World, player: Entity, def: WeaponDef): boolean {
  if (def.category !== 'consumable') return false;
  switch (def.effect) {
    case 'mend': {
      const h = player.get(Health);
      if (h) {
        if (isLaunch(world)) player.set(Health, { percent: Math.max(0, h.percent - MEND_PERCENT) });
        else player.set(Health, { hp: Math.min(h.maxHp, h.hp + MEND_HP) });
      }
      break;
    }
    case 'lead':
      player.set(Modifiers, { ...NO_EFFECT, speed: 0.85, jump: 0.8, knockbackTaken: 0.4, ticks: LEAD_TICKS, kind: EffectKind.Lead });
      break;
    case 'sprint':
      player.set(Modifiers, { ...NO_EFFECT, speed: 1.5, jump: 1.2, ticks: SPRINT_TICKS, kind: EffectKind.Sprint });
      break;
    case 'mirror':
      player.set(Modifiers, { ...NO_EFFECT, reflect: 1, ticks: MIRROR_TICKS, kind: EffectKind.Mirror });
      break;
    default:
      return false;
  }
  emit(world, { type: 'pickup', player, weaponId: def.id });
  return true;
}

/** Count an effect down; when it runs out everything snaps back to neutral. */
export function tickModifiers(player: Entity): void {
  const m = player.get(Modifiers);
  if (!m || m.ticks <= 0) return;
  if (m.ticks === 1) player.set(Modifiers, NO_EFFECT);
  else player.set(Modifiers, { ticks: m.ticks - 1 });
}

export function reflects(player: Entity): boolean {
  const m = player.get(Modifiers);
  return !!m && m.ticks > 0 && m.reflect > 0;
}
