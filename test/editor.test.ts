import { describe, expect, it } from 'vitest';
import {
  addObject,
  createEditorState,
  exportLevel,
  fromHash,
  importLevel,
  levelHashFromLocation,
  deleteLibrary,
  loadLibrary,
  loadMemory,
  moveSelected,
  PALETTE,
  resetMemoryLibrary,
  resizeSelected,
  saveLibrary,
  saveMemory,
  shareHash,
} from '../src/editor/editor';
import { parseLevel } from '../src/sim/level/schema';
import { hold, makeSim } from './helpers';
import { installMemoryIndexedDB } from './idb-memory';

describe('M7 editor', () => {
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
    const sim = makeSim({ level: parseLevel(JSON.parse(json)), seed: 3, settings: { playerCount: 1 } });
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
    const legacy = `c1${hash
      .slice(2)
      .replace(/-/g, '+')
      .replace(/_/g, '/')}`;
    expect(fromHash(legacy)?.name).toBe('Plus Pit');
    resetMemoryLibrary();
    await saveLibrary(state.level);
    const lib = await loadLibrary();
    expect(lib.some((l) => l.id === state.level.id && l.name === 'Plus Pit')).toBe(true);
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
