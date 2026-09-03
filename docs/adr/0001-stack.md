# ADR 0001 — TypeScript, Koota, Planck, TypeGPU

- Status: accepted
- Date: 2026-09-03

## Decision

Ship Floppy Clash as a TypeScript + Vite web game. Simulation state lives in Koota. Physics is Planck.js. Presentation is an instanced SDF renderer (TypeGPU) with a Canvas 2D fallback.

## Consequences

- `src/sim` stays DOM-free and is the source of truth for tests, bots, and later an authoritative host.
- TypeGPU and Koota are pinned to exact versions.
- Canvas fallback is the CI logic renderer and the debug overlay.
