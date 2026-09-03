import type { TraitSnapshot, WorldSnapshot } from '../sim/snapshot';

/** PLAN 4.13 quantized WorldSnapshot (v2). First byte is the version. */
export const SNAPSHOT_WIRE_VERSION = 2;

const FLAG_FULL = 1;
const FLAG_LEVEL = 2;
const FLAG_ADDED = 4;
const FLAG_REMOVED = 8;
const FLAG_WINS = 16;
const FLAG_SCOREBOARD = 32;

const TRAIT = {
  Transform: 0,
  BodyVel: 1,
  Health: 2,
  Player: 3,
  RagdollRoot: 4,
  Controller: 5,
  Aim: 6,
  Weapon: 7,
  Projectile: 8,
  Snake: 9,
  RagdollPart: 10,
  Combat: 11,
  Status: 12,
  OwnedBy: 13,
  Hazard: 14,
  Lifetime: 15,
  Destructible: 16,
  Boss: 17,
  Crown: 18,
  Dead: 19,
  Static: 20,
  Kinematic: 21,
  Solid: 22,
  Loose: 23,
  Held: 24,
  HazardPath: 25,
  BodyShape: 26,
} as const;

const LAST_TRAIT_ID = TRAIT.BodyShape;

const TRAIT_NAME = Object.fromEntries(Object.entries(TRAIT).map(([k, v]) => [v, k])) as Record<
  number,
  string
>;

class Writer {
  u8: Uint8Array;
  view: DataView;
  o = 0;

  constructor(cap = 4096) {
    this.u8 = new Uint8Array(cap);
    this.view = new DataView(this.u8.buffer);
  }

  private grow(need: number): void {
    if (this.o + need <= this.u8.byteLength) return;
    let cap = this.u8.byteLength;
    while (cap < this.o + need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.u8.subarray(0, this.o));
    this.u8 = next;
    this.view = new DataView(next.buffer);
  }

  bytes(): Uint8Array {
    return this.u8.subarray(0, this.o);
  }

  u8w(v: number): void {
    this.grow(1);
    this.u8[this.o] = v & 0xff;
    this.o += 1;
  }

  u16(v: number): void {
    this.grow(2);
    this.view.setUint16(this.o, v & 0xffff, true);
    this.o += 2;
  }

  i16(v: number): void {
    this.grow(2);
    this.view.setInt16(this.o, Math.max(-32768, Math.min(32767, v | 0)), true);
    this.o += 2;
  }

  i16q(v: number, scale = 100): void {
    this.i16(Math.round(v * scale));
  }

  u32(v: number): void {
    this.grow(4);
    this.view.setUint32(this.o, v >>> 0, true);
    this.o += 4;
  }

  i32(v: number): void {
    this.grow(4);
    this.view.setInt32(this.o, v | 0, true);
    this.o += 4;
  }

  f32(v: number): void {
    this.grow(4);
    this.view.setFloat32(this.o, v, true);
    this.o += 4;
  }

  str(s: string): void {
    const raw = new TextEncoder().encode(s);
    this.u8w(Math.min(255, raw.byteLength));
    this.grow(raw.byteLength);
    this.u8.set(raw.subarray(0, Math.min(255, raw.byteLength)), this.o);
    this.o += Math.min(255, raw.byteLength);
  }
}

class Reader {
  view: DataView;
  u8: Uint8Array;
  o = 0;

  constructor(buf: Uint8Array) {
    this.u8 = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  u8r(): number {
    const v = this.u8[this.o] ?? 0;
    this.o += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.o, true);
    this.o += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.o, true);
    this.o += 2;
    return v;
  }

  i16q(scale = 100): number {
    return this.i16() / scale;
  }

  u32(): number {
    const v = this.view.getUint32(this.o, true);
    this.o += 4;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.o, true);
    this.o += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }

  str(): string {
    const n = this.u8r();
    const slice = this.u8.subarray(this.o, this.o + n);
    this.o += n;
    return new TextDecoder().decode(slice);
  }
}

function num(rec: Record<string, number | boolean | string> | undefined, key: string, fallback = 0): number {
  const v = rec?.[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return Number(v) || fallback;
  return fallback;
}

function flag(rec: Record<string, number | boolean | string> | undefined, key: string): boolean {
  const v = rec?.[key];
  if (typeof v === 'boolean') return v;
  return Number(v) !== 0;
}

function writeTrait(w: Writer, name: string, rec: Record<string, number | boolean | string>): void {
  switch (name) {
    case 'Transform':
      w.i16q(num(rec, 'x'));
      w.i16q(num(rec, 'y'));
      w.i16q(num(rec, 'angle'), 1000);
      return;
    case 'BodyVel':
      w.i16q(num(rec, 'vx'));
      w.i16q(num(rec, 'vy'));
      w.i16q(num(rec, 'omega'));
      return;
    case 'Health':
    case 'Destructible':
      w.u16(Math.max(0, Math.round(num(rec, 'hp'))));
      w.u16(Math.max(0, Math.round(num(rec, 'maxHp') || num(rec, 'hp'))));
      return;
    case 'Player':
      w.u8w(num(rec, 'slot'));
      w.u8w(num(rec, 'color'));
      w.u8w(num(rec, 'inputIndex'));
      return;
    case 'RagdollRoot':
      w.u8w(num(rec, 'slot'));
      w.u8w(num(rec, 'color'));
      return;
    case 'Controller': {
      let bits = 0;
      if (flag(rec, 'grounded')) bits |= 1;
      if (flag(rec, 'ducking')) bits |= 2;
      if (flag(rec, 'wallSliding')) bits |= 4;
      w.u8w(bits);
      w.i16(Math.round(num(rec, 'facing')));
      w.i16(Math.round(num(rec, 'wallDir')));
      w.i16q(num(rec, 'vx'));
      w.i16q(num(rec, 'vy'));
      w.u8w(num(rec, 'coyote'));
      w.u8w(num(rec, 'jumpBuffer'));
      w.u8w(num(rec, 'lockTicks'));
      return;
    }
    case 'Aim':
      w.i16q(num(rec, 'x'), 1000);
      w.i16q(num(rec, 'y'), 1000);
      w.u8w(num(rec, 'holdTicks'));
      return;
    case 'Weapon': {
      let bits = 0;
      if (flag(rec, 'thrown')) bits |= 1;
      if (flag(rec, 'thrownHit')) bits |= 2;
      if (flag(rec, 'held')) bits |= 4;
      if (flag(rec, 'loose')) bits |= 8;
      w.u8w(num(rec, 'defId'));
      w.u16(Math.max(0, Math.round(num(rec, 'ammo'))));
      w.u8w(num(rec, 'pickupCooldown'));
      w.u8w(bits);
      w.i16(Math.round(num(rec, 'holderNetId', -1)));
      return;
    }
    case 'Projectile':
      w.i16q(num(rec, 'x'));
      w.i16q(num(rec, 'y'));
      w.i16q(num(rec, 'vx'));
      w.i16q(num(rec, 'vy'));
      w.u8w(num(rec, 'kind'));
      w.u8w(num(rec, 'bounces'));
      w.u8w(num(rec, 'ownerGrace'));
      w.u8w(num(rec, 'defId'));
      w.u16(Math.max(0, Math.round(num(rec, 'damage'))));
      w.u16(Math.max(0, Math.round(num(rec, 'fuse'))));
      w.i16q(num(rec, 'speed'));
      w.i16q(num(rec, 'gravity'), 1000);
      return;
    case 'Snake':
      w.u16(Math.max(0, Math.round(num(rec, 'hp'))));
      w.u8w(num(rec, 'giant'));
      w.u8w(num(rec, 'flying'));
      w.u8w(num(rec, 'biteCooldown'));
      return;
    case 'RagdollPart':
      w.u8w(num(rec, 'part'));
      w.i16(Math.round(num(rec, 'rootNetId', -1)));
      return;
    case 'Combat':
      w.u8w(Math.max(0, Math.min(255, Math.round(num(rec, 'blockMeter') * 255))));
      w.u8w(flag(rec, 'blocking') ? 1 : 0);
      w.i16(Math.round(num(rec, 'blockStartTick')));
      w.u8w(num(rec, 'punchActive'));
      w.u8w(num(rec, 'punchCooldown'));
      w.u8w(num(rec, 'refillDelay'));
      return;
    case 'Status':
      w.u16(Math.max(0, Math.round(num(rec, 'burning'))));
      w.u16(Math.max(0, Math.round(num(rec, 'slowed'))));
      w.u16(Math.max(0, Math.round(num(rec, 'glued'))));
      w.u16(Math.max(0, Math.round(num(rec, 'bubbled'))));
      return;
    case 'OwnedBy':
      w.i16(Math.round(num(rec, 'ownerNetId', -1)));
      return;
    case 'Hazard':
      w.u8w(num(rec, 'kind'));
      w.u8w(num(rec, 'armed'));
      w.f32(num(rec, 'param0'));
      w.f32(num(rec, 'param1'));
      w.f32(num(rec, 'param2'));
      w.f32(num(rec, 'param3'));
      w.i16(Math.round(num(rec, 'hp')));
      return;
    case 'Lifetime':
      w.u16(Math.max(0, Math.round(num(rec, 'ticksLeft'))));
      return;
    case 'Boss':
      w.u16(Math.max(0, Math.round(num(rec, 'hp'))));
      w.u8w(num(rec, 'bite'));
      w.i16q(num(rec, 'speed'));
      return;
    case 'BodyShape':
      w.u8w(flag(rec, 'circle') ? 1 : 0);
      w.i16q(num(rec, 'hx'));
      w.i16q(num(rec, 'hy'));
      w.i16q(num(rec, 'radius'));
      return;
    case 'HazardPath': {
      const points = String(rec.points ?? '')
        .split(';')
        .map((pair) => {
          const [px, py] = pair.split(',');
          return { x: Number(px), y: Number(py) };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      w.u8w(num(rec, 'index'));
      w.u8w(num(rec, 'mode'));
      w.i16(Math.round(num(rec, 'dir', 1)));
      w.i16q(num(rec, 'accum'));
      w.i16q(num(rec, 'speed'));
      w.u8w(Math.min(255, points.length));
      for (const p of points.slice(0, 255)) {
        w.i16q(p.x);
        w.i16q(p.y);
      }
      return;
    }
    default:
      return;
  }
}

function readTrait(r: Reader, id: number): Record<string, number | boolean | string> {
  switch (id) {
    case TRAIT.Transform:
      return { x: r.i16q(), y: r.i16q(), angle: r.i16q(1000) };
    case TRAIT.BodyVel:
      return { vx: r.i16q(), vy: r.i16q(), omega: r.i16q() };
    case TRAIT.Health:
    case TRAIT.Destructible:
      return { hp: r.u16(), maxHp: r.u16() };
    case TRAIT.Player:
      return { slot: r.u8r(), color: r.u8r(), inputIndex: r.u8r() };
    case TRAIT.RagdollRoot:
      return { slot: r.u8r(), color: r.u8r() };
    case TRAIT.Controller: {
      const bits = r.u8r();
      return {
        grounded: (bits & 1) !== 0,
        facing: r.i16(),
        ducking: bits & 2 ? 1 : 0,
        wallSliding: bits & 4 ? 1 : 0,
        wallDir: r.i16(),
        vx: r.i16q(),
        vy: r.i16q(),
        coyote: r.u8r(),
        jumpBuffer: r.u8r(),
        lockTicks: r.u8r(),
      };
    }
    case TRAIT.Aim:
      return { x: r.i16q(1000), y: r.i16q(1000), holdTicks: r.u8r() };
    case TRAIT.Weapon: {
      const defId = r.u8r();
      const ammo = r.u16();
      const pickupCooldown = r.u8r();
      const bits = r.u8r();
      return {
        defId,
        ammo,
        pickupCooldown,
        thrown: (bits & 1) !== 0,
        thrownHit: bits & 2 ? 1 : 0,
        held: bits & 4 ? 1 : 0,
        loose: bits & 8 ? 1 : 0,
        holderNetId: r.i16(),
      };
    }
    case TRAIT.Projectile:
      return {
        x: r.i16q(),
        y: r.i16q(),
        vx: r.i16q(),
        vy: r.i16q(),
        kind: r.u8r(),
        bounces: r.u8r(),
        ownerGrace: r.u8r(),
        defId: r.u8r(),
        damage: r.u16(),
        fuse: r.u16(),
        speed: r.i16q(),
        gravity: r.i16q(1000),
      };
    case TRAIT.Snake:
      return { hp: r.u16(), giant: r.u8r(), flying: r.u8r(), biteCooldown: r.u8r() };
    case TRAIT.RagdollPart:
      return { part: r.u8r(), rootNetId: r.i16() };
    case TRAIT.Combat:
      return {
        blockMeter: r.u8r() / 255,
        blocking: r.u8r() === 1,
        blockStartTick: r.i16(),
        punchActive: r.u8r(),
        punchCooldown: r.u8r(),
        refillDelay: r.u8r(),
      };
    case TRAIT.Status:
      return { burning: r.u16(), slowed: r.u16(), glued: r.u16(), bubbled: r.u16() };
    case TRAIT.OwnedBy:
      return { ownerNetId: r.i16() };
    case TRAIT.Hazard:
      return {
        kind: r.u8r(),
        armed: r.u8r(),
        param0: r.f32(),
        param1: r.f32(),
        param2: r.f32(),
        param3: r.f32(),
        hp: r.i16(),
      };
    case TRAIT.Lifetime:
      return { ticksLeft: r.u16() };
    case TRAIT.Boss:
      return { hp: r.u16(), bite: r.u8r(), speed: r.i16q() };
    case TRAIT.Crown:
    case TRAIT.Dead:
    case TRAIT.Static:
    case TRAIT.Kinematic:
    case TRAIT.Solid:
    case TRAIT.Loose:
    case TRAIT.Held:
      return { on: 1 };
    case TRAIT.BodyShape:
      return { circle: r.u8r(), hx: r.i16q(), hy: r.i16q(), radius: r.i16q() };
    case TRAIT.HazardPath: {
      const index = r.u8r();
      const mode = r.u8r();
      const dir = r.i16();
      const accum = r.i16q();
      const speed = r.i16q();
      const n = r.u8r();
      const pts: string[] = [];
      for (let i = 0; i < n; i++) pts.push(`${r.i16q()},${r.i16q()}`);
      return { index, mode, dir, accum, speed, points: pts.join(';') };
    }
    default:
      return {};
  }
}

/** Quantized binary WorldSnapshot for the 20 Hz unreliable channel (PLAN 4.13). */
export function encodeSnapshotBinary(snap: WorldSnapshot): Uint8Array {
  const w = new Writer();
  let flags = 0;
  if (snap.full !== false) flags |= FLAG_FULL;
  if (snap.levelId) flags |= FLAG_LEVEL;
  if (snap.added?.length) flags |= FLAG_ADDED;
  if (snap.removed?.length) flags |= FLAG_REMOVED;
  if (snap.wins) flags |= FLAG_WINS;
  if (snap.scoreboardTicks != null) flags |= FLAG_SCOREBOARD;
  w.u8w(SNAPSHOT_WIRE_VERSION);
  w.u8w(flags);
  w.u32(snap.tick >>> 0);
  w.u32(snap.rng >>> 0);
  w.u16(snap.nextId);
  w.i32(snap.seed ?? 0);
  w.u8w(snap.playerCount ?? 0);
  w.i32(snap.phase ?? 0);
  w.i32(snap.roundTicks ?? 0);
  w.i32(snap.aliveMask ?? 0);
  w.i32(snap.lastKiller ?? -1);
  w.u16(snap.matchRound ?? 0);
  w.u16(snap.firstTo ?? 0);
  w.u16(snap.levelIndex ?? 0);
  w.u16(snap.rotation ?? 0);
  w.u16(snap.showWins ?? 0);
  w.u16(snap.maxHp ?? 100);
  w.i32(Math.max(-0x7fffffff, Math.min(0x7fffffff, snap.nextDrop ?? 0)));
  w.u16(snap.looseCount ?? 0);
  w.i16q(snap.stepScale ?? 1, 1000);
  if (flags & FLAG_LEVEL) w.str(snap.levelId ?? '');
  if (flags & FLAG_WINS) {
    const wins = snap.wins ?? [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) w.u16(wins[i] ?? 0);
  }
  w.u16(snap.entities.length);
  for (const e of snap.entities) {
    let mask = 0;
    for (const key of Object.keys(e.traits)) {
      const id = TRAIT[key as keyof typeof TRAIT];
      if (id != null) mask |= 1 << id;
    }
    w.u16(e.netId);
    w.u32(mask >>> 0);
    for (let id = 0; id <= LAST_TRAIT_ID; id++) {
      if ((mask & (1 << id)) === 0) continue;
      const name = TRAIT_NAME[id]!;
      writeTrait(w, name, e.traits[name] ?? {});
    }
  }
  if (flags & FLAG_ADDED) {
    const added = snap.added ?? [];
    w.u16(added.length);
    for (const id of added) w.u16(id);
  }
  if (flags & FLAG_REMOVED) {
    const removed = snap.removed ?? [];
    w.u16(removed.length);
    for (const id of removed) w.u16(id);
  }
  // Trailing optional field: old v2 decoders ignore leftover bytes.
  if (flags & FLAG_SCOREBOARD) {
    w.u16(Math.max(0, Math.min(0xffff, Math.round(snap.scoreboardTicks ?? 90))));
  }
  return w.bytes();
}

export function decodeSnapshotBinary(buf: Uint8Array): WorldSnapshot {
  const r = new Reader(buf);
  const version = r.u8r();
  if (version !== SNAPSHOT_WIRE_VERSION) {
    throw new Error(`decodeSnapshotBinary: unsupported version ${version}`);
  }
  const flags = r.u8r();
  const tick = r.u32();
  const rng = r.u32();
  const nextId = r.u16();
  const seed = r.i32();
  const playerCount = r.u8r();
  const phase = r.i32();
  const roundTicks = r.i32();
  const aliveMask = r.i32();
  const lastKiller = r.i32();
  const matchRound = r.u16();
  const firstTo = r.u16();
  const levelIndex = r.u16();
  const rotation = r.u16();
  const showWins = r.u16();
  const maxHp = r.u16();
  const nextDrop = r.i32();
  const looseCount = r.u16();
  const stepScale = r.i16q(1000);
  const levelId = flags & FLAG_LEVEL ? r.str() : undefined;
  const wins =
    flags & FLAG_WINS ? [r.u16(), r.u16(), r.u16(), r.u16()] : undefined;
  const n = r.u16();
  const entities: TraitSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const netId = r.u16();
    const mask = r.u32();
    const traits: TraitSnapshot['traits'] = {};
    for (let id = 0; id <= LAST_TRAIT_ID; id++) {
      if ((mask & (1 << id)) === 0) continue;
      const name = TRAIT_NAME[id]!;
      traits[name] = readTrait(r, id);
    }
    entities.push({ netId, traits });
  }
  let added: number[] | undefined;
  let removed: number[] | undefined;
  if (flags & FLAG_ADDED) {
    const c = r.u16();
    added = [];
    for (let i = 0; i < c; i++) added.push(r.u16());
  }
  if (flags & FLAG_REMOVED) {
    const c = r.u16();
    removed = [];
    for (let i = 0; i < c; i++) removed.push(r.u16());
  }
  const scoreboardTicks = flags & FLAG_SCOREBOARD ? r.u16() : undefined;
  return {
    tick,
    rng,
    nextId,
    seed,
    levelId,
    playerCount,
    phase,
    roundTicks,
    aliveMask,
    lastKiller,
    wins,
    matchRound,
    firstTo,
    levelIndex,
    rotation,
    showWins,
    maxHp,
    nextDrop,
    looseCount,
    stepScale,
    scoreboardTicks,
    entities,
    full: (flags & FLAG_FULL) !== 0,
    added,
    removed,
  };
}

export function snapshotBytes(snap: WorldSnapshot): number {
  return encodeSnapshotBinary(snap).byteLength;
}

export function isSnapshotBinary(data: unknown): data is ArrayBuffer | ArrayBufferView {
  if (data instanceof ArrayBuffer) return true;
  return ArrayBuffer.isView(data);
}

export function bytesFromWire(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}
