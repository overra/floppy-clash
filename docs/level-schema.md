# Level schema

Levels are JSON validated by zod (`src/sim/level/schema.ts`). The in-browser editor exports the same shape and stores user copies in IndexedDB (`floppy-clash-levels`).

## Required fields

| Field | Meaning |
| --- | --- |
| `id` | Stable unique slug |
| `name` | Menu / editor label |
| `theme` | woods / desert / factory / castle / winter / lava / laser / western / halloween / arena |
| `bounds` | `{ x, y, w, h }` in meters |
| `spawns` | At least 4 points |
| `objects` | Hazard list (type + pose + optional props) |

## Object types (Appendix D)

`solid`, `block.destructible`, `crate`, `spikes`, `lava`, `saw`, `platform.moving`, `platform.rotating`, `platform.disappearing`, `platform.collapsing`, `platform.momentum`, `chain`, `barrel.explosive`, `laser`, `conveyor`, `ice`, `bounce`, `spikeball`, `crusher`, `trigger.drop`.

Optional props (`w`, `h`, `dir`, `path`, `speed`, `mode`, `style`, `period`, `onTicks`, …) are generated into the editor property panel from the zod object.

`spikeball.style` is `swing` (default hang joint), `roll` (free dynamic circle), or `drop` (falls from spawn height). `platform.disappearing` sets `armed=2` during the last 18 ticks of the solid phase (warning blink). A `chain` hangs a rideable platform from its last link (`w`/`h`, default 2.8×0.4). `block.destructible` death spawns short-lived debris chunks.

User levels saved to the library are merged into match rotation when **Include user levels** is on.
