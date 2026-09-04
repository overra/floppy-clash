import { describe, expect, it } from 'vitest';
import { getLevel } from '../src/levels/catalog';
import { createProfiler } from '../src/core/perf';
import { armFighters, makeStressRng, stressEvents } from '../src/debug/stress';
import { createCamera } from '../src/render/camera';
import { buildFrame } from '../src/render/buildFrame';
import { createDecalLayer } from '../src/render/fx/decals';
import { createParticles, emitFromEvents, stepParticles, type Decal } from '../src/render/fx/particles';
import { packGroups } from '../src/render/gpu/pack';
import { blankInputs } from '../src/sim/input';
import { makeSim } from './helpers';

/*
 * The headless half of the 120 Hz budget check. This is the same scene `?stress=600` plays in the
 * browser (four armed fighters, ≥600 live particles, explosions every tick), run through the same
 * per-frame stages the game loop runs — sim step, particle step, frame build, GPU packing — at the
 * 120 Hz cadence (a 60 Hz sim tick every other frame). Only the GPU pass itself is missing; that is
 * measured in the browser with timestamp queries (window.__floppy.perf().gpu).
 *
 * The budget is 8.33 ms per frame. Node on a laptop does these stages in about a millisecond, so
 * the assertions leave room for a loaded CI box while still catching a real regression (a 5× slip
 * fails). Windows are retried because parallel test workers can steal a whole one.
 */
const FRAME_BUDGET_MS = 1000 / 120;
const FRAMES = 720; // 6 s at 120 Hz
const TARGET_PARTICLES = 600;

type Bench = { frame: { med: number; p99: number; max: number }; stages: string; particles: number; groups: number };

function runStress(): Bench {
  const level = getLevel('castle-01');
  const sim = makeSim({ level, seed: 3, settings: { playerCount: 0, bots: 4 } });
  const rng = makeStressRng();
  const particles = createParticles(4096);
  const decals: Decal[] = [];
  const decalLayer = createDecalLayer(level.bounds);
  const cam = createCamera(level.bounds);
  const profiler = createProfiler(FRAMES);
  const inputs = blankInputs(4);
  const dt = 1 / 120;
  let alpha = 0;
  let maxParticles = 0;
  let maxGroups = 0;
  for (let f = 0; f < FRAMES; f++) {
    let t = profiler.begin();
    if (f % 2 === 0) {
      const events = sim.step(inputs);
      emitFromEvents(events, particles, decals);
      if (sim.ctx.tick % 30 === 0) armFighters(sim, rng);
      if (particles.count < TARGET_PARTICLES) emitFromEvents(stressEvents(sim, rng), particles, decals);
      decalLayer.stampNew(decals, () => true);
      alpha = 0;
    } else {
      alpha = 0.5;
    }
    t = profiler.lap('sim', t);
    stepParticles(particles, dt);
    t = profiler.lap('fx', t);
    const frame = buildFrame(sim, cam, alpha, 1920, 1080, particles, { decalLayer, dt });
    t = profiler.lap('build', t);
    packGroups(frame.groups, particles);
    profiler.lap('pack', t);
    profiler.end();
    maxParticles = Math.max(maxParticles, particles.count);
    maxGroups = Math.max(maxGroups, frame.groups.length);
  }
  const s = profiler.stats();
  const stages = ['sim', 'fx', 'build', 'pack'].map((k) => `${k} ${s[k]!.med.toFixed(2)}/${s[k]!.p99.toFixed(2)}`).join('  ');
  return { frame: { med: s.frame!.med, p99: s.frame!.p99, max: s.frame!.max }, stages, particles: maxParticles, groups: maxGroups };
}

describe('120 Hz stress scene (headless)', () => {
  it('four armed fighters and a 600-particle battlefield fit the frame budget with room to spare', () => {
    // Warm-up run so the JIT has seen every stage; the measured run follows.
    runStress();
    let bench = runStress();
    for (let attempt = 0; attempt < 2 && bench.frame.p99 >= FRAME_BUDGET_MS; attempt++) bench = runStress();
    console.info(
      `stress: frame med ${bench.frame.med.toFixed(2)} ms  p99 ${bench.frame.p99.toFixed(2)} ms  max ${bench.frame.max.toFixed(2)} ms  ` +
        `(${bench.stages})  particles ≤${bench.particles}  groups ≤${bench.groups}`,
    );
    // The scene really is the stress scene.
    expect(bench.particles).toBeGreaterThanOrEqual(TARGET_PARTICLES);
    // Median well inside the budget, p99 inside it: a 120 Hz frame is never missed by the CPU side.
    expect(bench.frame.med).toBeLessThan(FRAME_BUDGET_MS / 2);
    expect(bench.frame.p99).toBeLessThan(FRAME_BUDGET_MS);
  });
});
