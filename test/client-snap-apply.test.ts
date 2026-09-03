import { describe, expect, it } from 'vitest';
import { applyExistingClientSnap } from '../src/net/clientSnapApply';

describe('applyExistingClientSnap (no silent catch after view exists)', () => {
  it('returns the same view when apply succeeds', () => {
    const view = { id: 1 };
    const out = applyExistingClientSnap({
      view,
      apply: () => undefined,
      rebuild: () => ({ id: 2 }),
      log: () => undefined,
    });
    expect(out).toBe(view);
  });

  it('rebuilds once when apply throws', () => {
    const logs: unknown[] = [];
    const rebuilt = { id: 9 };
    const out = applyExistingClientSnap({
      view: { id: 1 },
      apply: () => {
        throw new Error('corrupt view');
      },
      rebuild: () => rebuilt,
      log: (err) => logs.push(err),
    });
    expect(out).toBe(rebuilt);
    expect(logs.length).toBe(1);
  });

  it('rethrows when apply throws and rebuild fails', () => {
    const boom = new Error('still broken');
    expect(() =>
      applyExistingClientSnap({
        view: { id: 1 },
        apply: () => {
          throw boom;
        },
        rebuild: () => null,
        log: () => undefined,
      }),
    ).toThrow(boom);
  });
});
