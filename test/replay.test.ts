import { describe, expect, it } from 'vitest';
import { createRecorder, playReplay } from '../src/input/replay';
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
  });

  it('keeps the tape exact through growth: analog doubles and every button survive the round trip', () => {
    const rec = createRecorder(1, 'gym');
    const ticks: ReturnType<typeof hold>[][] = [];
    // Past the initial 1024-tick block so the tape has to grow at least once.
    for (let i = 0; i < 2500; i++) {
      const tick = [
        hold({ moveX: Math.sin(i * 0.37), aimX: Math.cos(i * 0.11), aimY: Math.sin(i * 0.11), jump: i % 2 === 0, down: i % 3 === 0 }),
        hold({ attack: i % 5 === 0, block: i % 7 === 0, throw: i % 11 === 0, moveX: -0.123456789 }),
      ];
      ticks.push(tick);
      rec.push(tick);
    }
    expect(rec.length).toBe(2500);
    const out = rec.toJSON();
    expect(out.inputs).toHaveLength(2500);
    expect(out.inputs[0]).toHaveLength(2);
    expect(out.inputs).toEqual(ticks);
  });
});
