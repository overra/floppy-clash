import type { World } from 'koota';
import { getContext } from '../context';

/** Launch mode: percent damage, blast-zone kills and stocks (see MatchSettings.mode). */
export function isLaunch(world: World): boolean {
  return getContext(world).settings.mode === 'launch';
}
