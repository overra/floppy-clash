import { describe, expect, it } from 'vitest';
import { createRecorder, parseReplay, playReplay } from '../src/input/replay';
import { getLevel } from '../src/levels/catalog';
import { hold, makeSim } from './helpers';

describe('replay playback', () => {
  it('replays a recorded tape to the same hash', () => {
    const seed = 44;
    const rec = createRecorder(seed, 'gym');
    const live = makeSim({ seed, settings: { playerCount: 2 } });
    for (let i = 0; i < 90; i++) {
      const inputs = [hold({ moveX: i % 20 < 10 ? 1 : -1, jump: i % 30 === 0 }), hold({ block: i % 15 < 4 }), hold({}), hold({})];
      rec.push(inputs);
      live.step(inputs);
    }
    const expected = live.hash();
    const replay = rec.toJSON();
    const played = playReplay(replay, (r) => makeSim({ seed: r.seed, level: getLevel(r.levelId === 'gym' ? 'gym' : r.levelId), settings: { playerCount: 2 } }));
    expect(played.ticks).toBe(90);
    expect(played.hash).toBe(expected);
    const parsed = parseReplay(JSON.stringify(replay));
    expect(parsed.inputs.length).toBe(90);
  });
});
