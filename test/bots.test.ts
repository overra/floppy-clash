import { describe, expect, it } from 'vitest';
import { attachBots } from '../src/sim/ai/bots';
import { Bot, Player } from '../src/sim/traits';
import { makeSim } from './helpers';

describe('M9 bots', () => {
  it('bots produce inputs and the match advances', () => {
    const sim = makeSim({ seed: 90, settings: { playerCount: 1, bots: 3 } });
    const slots: number[] = [];
    sim.ecs.query(Player).updateEach(([p], e) => {
      if (p.slot > 0) {
        e.add(Bot({ slot: p.slot, think: 0 }));
        slots.push(p.slot);
      }
    });
    attachBots(sim.ecs, slots);
    expect(() => {
      for (let i = 0; i < 240; i++) sim.step();
    }).not.toThrow();
    expect(sim.getTick()).toBe(240);
  });
});
