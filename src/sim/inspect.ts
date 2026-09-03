import type { World } from 'koota';
import {
  Aim,
  Bot,
  Combat,
  Controller,
  Crown,
  Dead,
  Destructible,
  Hazard,
  Health,
  Held,
  Loose,
  NetId,
  Player,
  Projectile,
  RagdollPart,
  Snake,
  Transform,
  Weapon,
} from './traits';

const TRAIT_ROWS: { name: string; trait: unknown }[] = [
  { name: 'NetId', trait: NetId },
  { name: 'Player', trait: Player },
  { name: 'Transform', trait: Transform },
  { name: 'Health', trait: Health },
  { name: 'Controller', trait: Controller },
  { name: 'Aim', trait: Aim },
  { name: 'Combat', trait: Combat },
  { name: 'Weapon', trait: Weapon },
  { name: 'Projectile', trait: Projectile },
  { name: 'Hazard', trait: Hazard },
  { name: 'Dead', trait: Dead },
  { name: 'Crown', trait: Crown },
  { name: 'Held', trait: Held },
  { name: 'Loose', trait: Loose },
  { name: 'RagdollPart', trait: RagdollPart },
  { name: 'Snake', trait: Snake },
  { name: 'Bot', trait: Bot },
  { name: 'Destructible', trait: Destructible },
];

export type EntityInspect = {
  netId: number;
  traits: string[];
  x: number;
  y: number;
};

/** PLAN 4.16 entity/trait inspector dump. */
export function inspectWorld(world: World, limit = 24): EntityInspect[] {
  const rows: EntityInspect[] = [];
  world.query(NetId).updateEach(([net], entity) => {
    if (rows.length >= limit) return;
    const t = entity.get(Transform);
    const traits = TRAIT_ROWS.filter((row) => entity.has(row.trait as never)).map(
      (row) => row.name,
    );
    rows.push({ netId: net.id, traits, x: t?.x ?? 0, y: t?.y ?? 0 });
  });
  return rows.sort((a, b) => a.netId - b.netId);
}

export function formatInspect(rows: EntityInspect[]): string {
  return rows
    .map((r) => `#${r.netId} (${r.x.toFixed(1)},${r.y.toFixed(1)}) ${r.traits.join(',')}`)
    .join('\n');
}
