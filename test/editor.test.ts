import { describe, expect, it } from 'vitest';
import {
  addObject,
  applyEditorPad,
  createEditorState,
  IDLE_EDITOR_PAD,
  exportLevel,
  fromHash,
  importLevel,
  levelHashFromLocation,
  deleteLibrary,
  loadLibrary,
  loadMemory,
  moveSelected,
  PALETTE,
  redo,
  removeSelected,
  resetMemoryLibrary,
  resizeSelected,
  rotateSelected,
  saveLibrary,
  saveMemory,
  shareHash,
  undo,
} from '../src/editor/editor';
import { applyLevelField, levelSchemaFields } from '../src/editor/properties';
import { joinStartIndex } from '../src/input/remap';
import { parseLevel } from '../src/sim/level/schema';
import { hold, makeSim } from './helpers';
import { installMemoryIndexedDB } from './idb-memory';

describe('M7 editor', () => {
  it('rotate and resize are undoable and persist on the object (PLAN 4.15)', () => {
    const state = createEditorState();
    const obj = state.level.objects[state.selected]!;
    const w0 = obj.w ?? 2;
    rotateSelected(state, 0.4);
    expect(state.level.objects[state.selected]?.angle).toBeCloseTo(0.4);
    resizeSelected(state, w0 + 2, 3);
    expect(state.level.objects[state.selected]?.w).toBe(w0 + 2);
    expect(state.level.objects[state.selected]?.h).toBe(3);
    undo(state);
    expect(state.level.objects[state.selected]?.w).toBe(w0);
    undo(state);
    expect(state.level.objects[state.selected]?.angle ?? 0).toBeCloseTo(0);
  });

  it('undo/redo restores object placement (PLAN 4.15)', () => {
    const state = createEditorState();
    const start = state.level.objects.length;
    state.tool = 'spikes';
    addObject(state, 10, 6);
    expect(state.level.objects.length).toBe(start + 1);
    expect(state.level.objects[state.selected]?.type).toBe('spikes');
    undo(state);
    expect(state.level.objects.length).toBe(start);
    redo(state);
    expect(state.level.objects.length).toBe(start + 1);
    expect(state.level.objects.some((o) => o.type === 'spikes')).toBe(true);
  });

  it('can place every hazard type, export, and reload', () => {
    const state = createEditorState();
    for (const tool of PALETTE) {
      state.tool = tool;
      addObject(state, 8 + PALETTE.indexOf(tool), 6);
    }
    const json = exportLevel(state);
    const copy = createEditorState();
    importLevel(copy, json);
    expect(copy.level.objects.length).toBeGreaterThanOrEqual(PALETTE.length);
    expect(() => parseLevel(JSON.parse(json))).not.toThrow();
    moveSelected(copy, 10, 7);
    resizeSelected(copy, 3, 2);
    expect(copy.level.objects[copy.selected]?.w).toBeGreaterThan(1);
    const sim = makeSim({
      level: parseLevel(JSON.parse(json)),
      seed: 3,
      settings: { playerCount: 1 },
    });
    expect(() => {
      for (let i = 0; i < 45; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    }).not.toThrow();
  });

  it('share URL hash round-trips and memory library stores a draft', async () => {
    const state = createEditorState();
    state.level.name = 'Hash Pit';
    const hash = shareHash(state);
    expect(hash.startsWith('c1')).toBe(true);
    expect(hash.length).toBeLessThan(JSON.stringify(state.level).length);
    const loaded = fromHash(hash);
    expect(loaded?.name).toBe('Hash Pit');
    expect(loaded?.objects.length).toBe(state.level.objects.length);
    resetMemoryLibrary();
    await saveMemory(state.level);
    const lib = await loadMemory();
    expect(lib.some((l) => l.id === state.level.id)).toBe(true);
  });

  it('share hash is URL-safe and still accepts legacy +/ base64', async () => {
    const state = createEditorState();
    state.level.name = 'Plus Pit';
    const hash = shareHash(state);
    expect(hash.startsWith('c1')).toBe(true);
    expect(hash.slice(2)).not.toMatch(/[+/]/);
    expect(fromHash(hash)?.name).toBe('Plus Pit');
    expect(fromHash(`#l=${hash}`)?.name).toBe('Plus Pit');
    expect(levelHashFromLocation(`#l=${hash}`)).toBe(hash);
    const legacy = `c1${hash.slice(2).replace(/-/g, '+').replace(/_/g, '/')}`;
    expect(fromHash(legacy)?.name).toBe('Plus Pit');
    resetMemoryLibrary();
    await saveLibrary(state.level);
    const lib = await loadLibrary();
    expect(lib.some((l) => l.id === state.level.id && l.name === 'Plus Pit')).toBe(true);
  });

  it('pad D-pad nudges and A places (PLAN 4.15)', () => {
    const state = createEditorState();
    const x0 = state.level.objects[state.selected]!.x;
    const held = { ...IDLE_EDITOR_PAD };
    const right = applyEditorPad(state, held, { ...IDLE_EDITOR_PAD, right: true });
    expect(right.nudged).toBe(true);
    expect(state.level.objects[state.selected]!.x).toBe(x0 + state.grid);
    const still = applyEditorPad(
      state,
      { ...IDLE_EDITOR_PAD, right: true },
      { ...IDLE_EDITOR_PAD, right: true },
    );
    expect(still.nudged).toBe(false);
    const n = state.level.objects.length;
    const place = applyEditorPad(state, held, { ...IDLE_EDITOR_PAD, a: true });
    expect(place.placed).toBe(true);
    expect(state.level.objects.length).toBe(n + 1);
    const cycle = applyEditorPad(state, held, { ...IDLE_EDITOR_PAD, rb: true });
    expect(cycle.toolChanged).toBe(true);
    expect(state.tool).not.toBe('solid');
    expect(applyEditorPad(state, held, { ...IDLE_EDITOR_PAD, start: true }).playtest).toBe(true);
    expect(applyEditorPad(state, held, { ...IDLE_EDITOR_PAD, b: true }).back).toBe(true);
  });

  it('deletes the selected object and restores it on undo (PLAN 4.15)', () => {
    const state = createEditorState();
    state.tool = 'spikes';
    addObject(state, 10, 6);
    const n = state.level.objects.length;
    expect(removeSelected(state)).toBe(true);
    expect(state.level.objects.length).toBe(n - 1);
    expect(state.level.objects.some((o) => o.type === 'spikes')).toBe(false);
    undo(state);
    expect(state.level.objects.some((o) => o.type === 'spikes')).toBe(true);
  });

  it('places starting weapons and decor, then play-exports them', () => {
    const state = createEditorState();
    state.tool = 'starting-weapon';
    addObject(state, 8, 5);
    expect(state.level.startingWeapons?.[state.selectedStart]?.weapon).toBe('pistol');
    state.tool = 'decor';
    addObject(state, 3, 2);
    expect(state.level.decor?.[state.selectedDecor]?.kind).toBe('tree');
    applyLevelField(state.level, 'theme', 'western');
    applyLevelField(state.level, 'name', 'Gun Pit');
    expect(state.level.theme).toBe('western');
    expect(state.level.name).toBe('Gun Pit');
    expect(
      levelSchemaFields().some((f) => f.key === 'theme' && f.options?.includes('western')),
    ).toBe(true);
    const json = exportLevel(state);
    const copy = createEditorState();
    importLevel(copy, json);
    expect(copy.level.startingWeapons?.some((s) => s.weapon === 'pistol')).toBe(true);
    expect(copy.level.decor?.some((d) => d.kind === 'tree')).toBe(true);
    expect(copy.level.theme).toBe('western');
    const sim = makeSim({
      level: parseLevel(JSON.parse(json)),
      seed: 9,
      settings: { playerCount: 1 },
    });
    expect(() => {
      for (let i = 0; i < 20; i++) sim.step([hold({}), hold({}), hold({}), hold({})]);
    }).not.toThrow();
  });

  it('keeps at least four spawn points when deleting (PLAN Appendix B)', () => {
    const state = createEditorState();
    state.tool = 'spawn';
    expect(state.level.spawns.length).toBe(4);
    expect(removeSelected(state)).toBe(false);
    addObject(state, 12, 6);
    expect(state.level.spawns.length).toBe(5);
    expect(removeSelected(state)).toBe(true);
    expect(state.level.spawns.length).toBe(4);
  });

  it('editor Start index follows the remapped pause button (PLAN 4.12 / 4.15)', () => {
    expect(joinStartIndex()).toBe(9);
    expect(joinStartIndex({ jump: 0, attack: 7, block: 6, throw: 3, pause: 1 })).toBe(1);
  });

  it('saveLibrary / loadLibrary persist through the IndexedDB object store', async () => {
    const dbs = installMemoryIndexedDB();
    resetMemoryLibrary();
    const state = createEditorState();
    state.level.id = 'idb-pit';
    state.level.name = 'IDB Pit';
    await saveLibrary(state.level);
    resetMemoryLibrary();
    expect((await loadMemory()).length).toBe(0);
    const fromDb = dbs.get('floppy-clash-levels');
    expect(fromDb?.has('idb-pit')).toBe(true);
    const lib = await loadLibrary();
    expect(lib.some((l) => l.id === 'idb-pit' && l.name === 'IDB Pit')).toBe(true);
    await deleteLibrary('idb-pit');
    expect((await loadLibrary()).some((l) => l.id === 'idb-pit')).toBe(false);
  });
});
