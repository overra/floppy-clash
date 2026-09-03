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
  'platform.rotating',
  'platform.disappearing',
  'platform.collapsing',
  'platform.momentum',
  'laser',
  'barrel.explosive',
  'block.destructible',
  'chain',
  'spikeball',
  'crusher',
  'trigger.drop',
  'boss',
];

export type EditorTool = string;

export type EditorState = {
  level: LevelDef;
  selected: number;
  selectedSpawn: number;
  tool: EditorTool;
  grid: number;
  history: LevelDef[];
  future: LevelDef[];
};

export const EXTRA_TOOLS = ['spawn', 'drop-range'] as const;

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
    selectedSpawn: 0,
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
  if (state.tool === 'spawn') {
    addSpawn(state, x, y);
    return;
  }
  if (state.tool === 'drop-range') {
    setDropEdge(state, x);
    return;
  }
  pushHistory(state);
  const obj: LevelObject = {
    type: state.tool,
    x: snap(x, state.grid),
    y: snap(y, state.grid),
    w: 2,
    h: 1,
  };
  state.level.objects.push(obj);
  state.selected = state.level.objects.length - 1;
}

export function addSpawn(state: EditorState, x: number, y: number): void {
  pushHistory(state);
  state.level.spawns.push({ x: snap(x, state.grid), y: snap(y, state.grid) });
  state.selectedSpawn = state.level.spawns.length - 1;
}

export function moveSpawn(state: EditorState, i: number, x: number, y: number): void {
  const s = state.level.spawns[i];
  if (!s) return;
  s.x = snap(x, state.grid);
  s.y = snap(y, state.grid);
}

export function setDropEdge(state: EditorState, x: number): void {
  pushHistory(state);
  const sx = snap(x, state.grid);
  const drops = state.level.drops ?? { enabled: true, xMin: 4, xMax: 28, intervalScale: 1 };
  const mid = (drops.xMin + drops.xMax) / 2;
  if (sx < mid) drops.xMin = sx;
  else drops.xMax = sx;
  if (drops.xMin > drops.xMax) {
    const t = drops.xMin;
    drops.xMin = drops.xMax;
    drops.xMax = t;
  }
  state.level.drops = drops;
}

export function selectSpawnAt(state: EditorState, x: number, y: number): number {
  let best = -1;
  let bestD = 1.2;
  state.level.spawns.forEach((s, i) => {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best >= 0) state.selectedSpawn = best;
  return best;
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
  pushHistory(state);
  obj.w = Math.max(state.grid, snap(w, state.grid));
  obj.h = Math.max(state.grid, snap(h, state.grid));
}

export function rotateSelected(state: EditorState, delta: number): void {
  const obj = state.level.objects[state.selected];
  if (!obj) return;
  pushHistory(state);
  obj.angle = (obj.angle ?? 0) + delta;
}

export type EditorPadButtons = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
  lb: boolean;
  rb: boolean;
  start: boolean;
};

export const IDLE_EDITOR_PAD: EditorPadButtons = {
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
  b: false,
  lb: false,
  rb: false,
  start: false,
};

/** PLAN 4.15: pad-navigable placement (D-pad nudge, A place, LB/RB tool, Start playtest). */
export function applyEditorPad(
  state: EditorState,
  prev: EditorPadButtons,
  now: EditorPadButtons,
): { playtest: boolean; back: boolean; nudged: boolean; placed: boolean; toolChanged: boolean } {
  const tools = [...PALETTE, ...EXTRA_TOOLS];
  let nudged = false;
  let placed = false;
  let toolChanged = false;
  const nudge = (dx: number, dy: number) => {
    if (state.tool === 'spawn') {
      const s = state.level.spawns[state.selectedSpawn];
      if (s) {
        moveSpawn(state, state.selectedSpawn, s.x + dx, s.y + dy);
        nudged = true;
      }
    } else {
      const obj = state.level.objects[state.selected];
      if (obj) {
        moveSelected(state, obj.x + dx, obj.y + dy);
        nudged = true;
      }
    }
  };
  if (now.left && !prev.left) nudge(-state.grid, 0);
  if (now.right && !prev.right) nudge(state.grid, 0);
  if (now.up && !prev.up) nudge(0, state.grid);
  if (now.down && !prev.down) nudge(0, -state.grid);
  if (now.a && !prev.a) {
    addObject(state, 12, 6);
    placed = true;
  }
  if (now.lb && !prev.lb) {
    const i = Math.max(0, tools.indexOf(state.tool as (typeof tools)[number]));
    state.tool = tools[(i - 1 + tools.length) % tools.length]!;
    toolChanged = true;
  }
  if (now.rb && !prev.rb) {
    const i = Math.max(0, tools.indexOf(state.tool as (typeof tools)[number]));
    state.tool = tools[(i + 1) % tools.length]!;
    toolChanged = true;
  }
  return {
    playtest: now.start && !prev.start,
    back: now.b && !prev.b,
    nudged,
    placed,
    toolChanged,
  };
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

/** Dictionary + LZ77 token compression so share URLs stay short (PLAN 4.15). */
const DICT = [
  '"type":',
  '"x":',
  '"y":',
  '"w":',
  '"h":',
  '"spawns":',
  '"objects":',
  '"bounds":',
  '"theme":',
  '"drops":',
  '"enabled":',
  '"name":',
  '"id":',
  '"killMargin":',
  '"intervalScale":',
  '"xMin":',
  '"xMax":',
  'platform.',
  'true',
  'false',
];

function toUrlSafeB64(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromUrlSafeB64(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

export function compressLevelJson(json: string): string {
  let s = json;
  for (let i = 0; i < DICT.length; i++) {
    s = s.split(DICT[i]!).join(`\x01${String.fromCharCode(65 + i)}`);
  }
  const packed = lz77(s);
  return `c1${toUrlSafeB64(btoa(unescape(encodeURIComponent(packed))))}`;
}

export function decompressLevelJson(hash: string): string {
  const raw = hash.startsWith('c1') ? hash.slice(2) : hash;
  const packed = decodeURIComponent(escape(atob(fromUrlSafeB64(raw))));
  let s = unlz77(packed);
  for (let i = DICT.length - 1; i >= 0; i--) {
    s = s.split(`\x01${String.fromCharCode(65 + i)}`).join(DICT[i]!);
  }
  return s;
}

function lz77(input: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    let bestLen = 0;
    let bestOff = 0;
    const maxOff = Math.min(i, 255);
    for (let off = 1; off <= maxOff; off++) {
      let len = 0;
      while (len < 15 && i + len < input.length && input[i - off + len] === input[i + len])
        len += 1;
      if (len > bestLen) {
        bestLen = len;
        bestOff = off;
      }
    }
    if (bestLen >= 3) {
      out.push(`\x02${String.fromCharCode(bestOff)}${String.fromCharCode(bestLen)}`);
      i += bestLen;
    } else {
      out.push(input[i]!);
      i += 1;
    }
  }
  return out.join('');
}

function unlz77(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '\x02' && i + 2 < input.length) {
      const off = input.charCodeAt(i + 1);
      const len = input.charCodeAt(i + 2);
      out += out.slice(out.length - off, out.length - off + len);
      i += 2;
    } else {
      out += input[i];
    }
  }
  return out;
}

export function shareHash(state: EditorState): string {
  return compressLevelJson(JSON.stringify(state.level));
}

/** Payload after `#l=` — accepts percent-encoding and legacy `+/` base64. */
export function levelHashFromLocation(hash: string): string {
  const q = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!q.startsWith('l=')) return '';
  const raw = q.slice(2);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function fromHash(hash: string): LevelDef | null {
  try {
    const payload = hash.includes('l=') ? levelHashFromLocation(hash) : hash;
    const json = payload.startsWith('c1')
      ? decompressLevelJson(payload)
      : decodeURIComponent(escape(atob(fromUrlSafeB64(payload))));
    return parseLevel(JSON.parse(json));
  } catch {
    return null;
  }
}

const memoryStore = new Map<string, LevelDef>();

export function resetMemoryLibrary(): void {
  memoryStore.clear();
}

export async function saveMemory(level: LevelDef): Promise<void> {
  memoryStore.set(level.id, structuredClone(level));
}

export async function loadMemory(): Promise<LevelDef[]> {
  return [...memoryStore.values()].map((l) => structuredClone(l));
}

export async function saveLibrary(level: LevelDef): Promise<void> {
  memoryStore.set(level.id, structuredClone(level));
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('levels', 'readwrite');
    tx.objectStore('levels').put(level, level.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLibrary(): Promise<LevelDef[]> {
  const mem = await loadMemory();
  if (typeof indexedDB === 'undefined') return mem;
  try {
    const db = await openDb();
    const fromDb = await new Promise<LevelDef[]>((resolve, reject) => {
      const tx = db.transaction('levels', 'readonly');
      const req = tx.objectStore('levels').getAll();
      req.onsuccess = () => resolve((req.result as LevelDef[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    if (!fromDb.length) return mem;
    const seen = new Set(fromDb.map((l) => l.id));
    return [...fromDb, ...mem.filter((l) => !seen.has(l.id))];
  } catch {
    return mem;
  }
}

export async function deleteLibrary(id: string): Promise<void> {
  memoryStore.delete(id);
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('levels', 'readwrite');
    tx.objectStore('levels').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
