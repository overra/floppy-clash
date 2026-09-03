import type { LevelDef } from '../sim/level/schema';
import type { WorldSnapshot } from '../sim/snapshot';
import { snapshotCanOpenClientView } from './clientView';

const MAX_PENDING = 8;

export function enqueuePendingSnap(queue: WorldSnapshot[], snap: WorldSnapshot): WorldSnapshot[] {
  const next = queue.concat(snap);
  return next.length > MAX_PENDING ? next.slice(next.length - MAX_PENDING) : next;
}

/** Later snaps that must land on the view after `opened` (same or newer tick). */
export function extrasAfterOpen(queue: WorldSnapshot[], opened: WorldSnapshot): WorldSnapshot[] {
  return queue.filter((s) => s !== opened && s.tick >= opened.tick);
}

/**
 * First snap that can open a client view, plus newer extras.
 * Unopenable prefix (deltas, custom-without-JSON) is discarded with the open.
 */
export function takeOpenableFromQueue(
  queue: WorldSnapshot[],
  pendingLevel?: LevelDef,
): { opened: WorldSnapshot; extras: WorldSnapshot[] } | null {
  for (let i = 0; i < queue.length; i++) {
    const snap = queue[i]!;
    if (!snapshotCanOpenClientView(snap, pendingLevel)) continue;
    return { opened: snap, extras: extrasAfterOpen(queue.slice(i + 1), snap) };
  }
  return null;
}
