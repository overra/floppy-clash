import { parseLevel, type LevelDef, type LevelObject } from '../sim/level/schema';

const PALETTE = [
  'solid',
  'spikes',
  'lava',
  'saw',
  'crate',
  'ice',
  'conveyor',
  'bounce',
  'platform.moving',
  'platform.disappearing',
  'platform.collapsing',
  'laser',
  'barrel.explosive',
  'block.destructible',
  'chain',
  'spikeball',
  'crusher',
  'trigger.drop',
];

export type EditorState = {
  level: LevelDef;
  selected: number;
  tool: string;
  grid: number;
  history: LevelDef[];
  future: LevelDef[];
};

export function createEditorState(): EditorState {
  return {
    level: {
      id: 'user-draft',
      name: 'Untitled',
      theme: 'arena',
      bounds: { x: 0, y: 0, w: 32, h: 18 },
      killMargin: 6,
      spawns: [
        { x: 4, y: 5 },
        { x: 28, y: 5 },
        { x: 10, y: 10 },
        { x: 22, y: 10 },
      ],
      drops: { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 },
      objects: [{ type: 'solid', x: 16, y: 1, w: 32, h: 2 }],
    },
    selected: 0,
    tool: 'solid',
    grid: 1,
    history: [],
    future: [],
  };
}

export function pushHistory(state: EditorState): void {
  state.history.push(structuredClone(state.level));
  state.future = [];
}

export function undo(state: EditorState): void {
  const prev = state.history.pop();
  if (!prev) return;
  state.future.push(structuredClone(state.level));
  state.level = prev;
}

export function redo(state: EditorState): void {
  const next = state.future.pop();
  if (!next) return;
  state.history.push(structuredClone(state.level));
  state.level = next;
}

export function addObject(state: EditorState, x: number, y: number): void {
  pushHistory(state);
  const obj: LevelObject = { type: state.tool, x: snap(x, state.grid), y: snap(y, state.grid), w: 2, h: 1 };
  state.level.objects.push(obj);
  state.selected = state.level.objects.length - 1;
}

export function moveSelected(state: EditorState, x: number, y: number): void {
  const obj = state.level.objects[state.selected];
  if (!obj) return;
  obj.x = snap(x, state.grid);
  obj.y = snap(y, state.grid);
}

export function resizeSelected(state: EditorState, w: number, h: number): void {
  const obj = state.level.objects[state.selected];
  if (!obj) return;
  obj.w = Math.max(state.grid, snap(w, state.grid));
  obj.h = Math.max(state.grid, snap(h, state.grid));
}

export function rotateSelected(state: EditorState, delta: number): void {
  const obj = state.level.objects[state.selected];
  if (!obj) return;
  obj.angle = (obj.angle ?? 0) + delta;
}

export function selectAt(state: EditorState, x: number, y: number): number {
  let best = -1;
  let bestD = 1.2;
  state.level.objects.forEach((obj, i) => {
    const d = Math.hypot(obj.x - x, obj.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best >= 0) state.selected = best;
  return best;
}

export function hitTest(state: EditorState, x: number, y: number): number {
  return selectAt(state, x, y);
}

export function exportLevel(state: EditorState): string {
  return JSON.stringify(parseLevel(state.level), null, 2);
}

export function importLevel(state: EditorState, raw: string): void {
  pushHistory(state);
  state.level = parseLevel(JSON.parse(raw));
}

export function shareHash(state: EditorState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state.level))));
}

export function fromHash(hash: string): LevelDef | null {
  try {
    return parseLevel(JSON.parse(decodeURIComponent(escape(atob(hash)))));
  } catch {
    return null;
  }
}

export async function saveLibrary(level: LevelDef): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('levels', 'readwrite');
    tx.objectStore('levels').put(level, level.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLibrary(): Promise<LevelDef[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('levels', 'readonly');
    const req = tx.objectStore('levels').getAll();
    req.onsuccess = () => resolve(req.result as LevelDef[]);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('floppy-clash-levels', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('levels');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function snap(v: number, g: number): number {
  return Math.round(v / g) * g;
}

export { PALETTE };
