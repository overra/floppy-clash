import { describe, expect, it } from 'vitest';
import { addObject, createEditorState, exportLevel, importLevel, moveSelected, resizeSelected } from '../src/editor/editor';
import { PALETTE } from '../src/editor/editor';
import { parseLevel } from '../src/sim/level/schema';

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
  });
});
