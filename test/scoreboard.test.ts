import { describe, expect, it } from 'vitest';
import { scoreboardMarkup } from '../src/ui/scoreboard';

describe('M5 scoreboard art (DOM)', () => {
  it('renders a crest, per-seat rows, and a crown on the leader', () => {
    const html = scoreboardMarkup({ title: 'Round over', wins: [1, 3, 0, 2], firstTo: 5 });
    expect(html).toContain('data-round-over="1"');
    expect(html).toContain('score-crest');
    expect(html).toContain('Round over');
    expect(html).toContain('first to 5');
    expect(html).toContain('leader');
    expect(html).toContain('crown-mark');
    expect(html).toContain('P2');
  });
});
