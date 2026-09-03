import { describe, expect, it } from 'vitest';
import { pickNext, type Rect } from '../src/ui/padNav';

// A title-style layout: a row of three buttons with a lone wide button below them.
const row: Rect[] = [
  { x: 0, y: 0, w: 100, h: 40 },
  { x: 120, y: 0, w: 100, h: 40 },
  { x: 240, y: 0, w: 100, h: 40 },
  { x: 60, y: 80, w: 220, h: 40 },
];

describe('pad focus cursor', () => {
  it('steps along a row and refuses to leave it sideways', () => {
    expect(pickNext(row, 0, 'right')).toBe(1);
    expect(pickNext(row, 1, 'right')).toBe(2);
    expect(pickNext(row, 2, 'right')).toBe(-1);
    expect(pickNext(row, 2, 'left')).toBe(1);
    expect(pickNext(row, 0, 'left')).toBe(-1);
  });

  it('drops to the row below from any button and comes back up to the nearest one', () => {
    expect(pickNext(row, 0, 'down')).toBe(3);
    expect(pickNext(row, 2, 'down')).toBe(3);
    // Up from the wide button: its centre sits under the middle button.
    expect(pickNext(row, 3, 'up')).toBe(1);
    expect(pickNext(row, 3, 'down')).toBe(-1);
  });

  it('prefers a same-column neighbour over a nearer diagonal one', () => {
    const grid: Rect[] = [
      { x: 0, y: 0, w: 50, h: 20 },
      { x: 0, y: 100, w: 50, h: 20 }, // straight down, far
      { x: 70, y: 40, w: 50, h: 20 }, // diagonal, near
    ];
    expect(pickNext(grid, 0, 'down')).toBe(1);
  });

  it('starts at the first control when nothing is focused', () => {
    expect(pickNext(row, -1, 'down')).toBe(0);
    expect(pickNext([], -1, 'down')).toBe(-1);
  });
});
