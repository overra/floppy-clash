import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS, loadSettings, saveSettings } from '../src/ui/settingsStore';
import { objectSchemaFields, applyField } from '../src/editor/properties';
import { createEditorState, addObject, addSpawn, setDropEdge } from '../src/editor/editor';

function memoryStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

describe('settings persistence', () => {
  it('round-trips weapon/level toggles and lighting', () => {
    memoryStorage();
    saveSettings({
      ...DEFAULT_USER_SETTINGS,
      lighting: true,
      includeUserLevels: true,
      enabledWeapons: ['pistol', 'rpg'],
      enabledLevels: ['woods-clearing'],
      sfx: 0.2,
      renderer: 'canvas',
    });
    const loaded = loadSettings();
    expect(loaded.lighting).toBe(true);
    expect(loaded.includeUserLevels).toBe(true);
    expect(loaded.enabledWeapons).toEqual(['pistol', 'rpg']);
    expect(loaded.sfx).toBe(0.2);
    expect(loaded.renderer).toBe('canvas');
  });
});

describe('editor tools', () => {
  it('exposes zod fields and spawn / drop-range tools', () => {
    const fields = objectSchemaFields();
    expect(fields.some((f) => f.key === 'type')).toBe(true);
    expect(fields.some((f) => f.key === 'dir' && f.kind === 'enum')).toBe(true);
    const state = createEditorState();
    state.tool = 'spikes';
    addObject(state, 8, 4);
    const obj = state.level.objects[state.selected]!;
    applyField(obj, 'dir', 'left');
    expect(obj.dir).toBe('left');
    addSpawn(state, 6, 5);
    expect(state.level.spawns.length).toBeGreaterThanOrEqual(5);
    setDropEdge(state, 2);
    expect(state.level.drops?.xMin).toBeLessThanOrEqual(2);
  });
});
