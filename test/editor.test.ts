import { describe, expect, it } from 'vitest';
import {
  addObject,
  createEditorState,
  exportLevel,
  fromHash,
  importLevel,
  loadMemory,
  moveSelected,
  PALETTE,
  resetMemoryLibrary,
  resizeSelected,
  saveMemory,
  shareHash,
} from '../src/editor/editor';
import { parseLevel } from '../src/sim/level/schema';
import { hold, makeSim } from './helpers';

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
});
