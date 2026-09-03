import { builtInMatchLevels } from '../levels/catalog';
import type { LevelDef } from '../sim/level/schema';
import { DEFAULT_MAP, type PadMap } from '../input/remap';
import { HP_PRESETS } from '../input/seats';
import { WEAPON_DEFS, weaponDisplayName } from '../sim/weapons/defs';
import { scoreboardMarkup } from './scoreboard';
import { DEFAULT_USER_SETTINGS, type UserSettings } from './settingsStore';

export type Screen =
  | 'menu'
  | 'join'
  | 'settings'
  | 'pause'
  | 'scoreboard'
  | 'lobby'
  | 'editor'
  | 'play'
  | 'disconnect';

export type Seat = {
  taken: boolean;
  ready: boolean;
  color: number;
  padId: string | 'keyboard' | 'bot';
  name: string;
};

export type MenuState = {
  screen: Screen;
  seats: Seat[];
  notice: string;
  firstTo: number;
  maxHp: number;
  bots: number;
  roomCode: string;
  chat: string[];
  draftChat: string;
  netRole: '' | 'host' | 'client';
  netState: 'idle' | 'connecting' | 'up' | 'error';
  lastSnapTick: number;
  /** Seat index opened by a mid-round disconnect; first new pad may claim it. */
  claimSeat: number;
  /** Pad id that triggered the automatic remap offer (PLAN 4.12). */
  remapPadId: string;
  /** Screen to restore after Settings opened by remap / Back. */
  returnScreen: Screen | '';
  wins?: number[];
};

export type MenuActions = {
  [key: string]: (() => void) | ((payload?: string) => void) | undefined;
};

export function createMenuState(): MenuState {
  return {
    screen: 'menu',
    seats: Array.from({ length: 4 }, () => ({
      taken: false,
      ready: false,
      color: 0,
      padId: '',
      name: '',
    })),
    notice: '',
    firstTo: 0,
    maxHp: 100,
    bots: 0,
    roomCode: '',
    chat: [],
    draftChat: '',
    netRole: '',
    netState: 'idle',
    lastSnapTick: 0,
    claimSeat: -1,
    remapPadId: '',
    returnScreen: '',
  };
}

/** PLAN 4.12: offer remap at connect time, not mid-round (play/pause/disconnect). */
export function shouldOfferRemapOnScreen(screen: Screen): boolean {
  return screen === 'menu' || screen === 'join' || screen === 'lobby' || screen === 'settings';
}

/** Read lobby/settings HP + first-to so Start match is not stale vs the form. */
export function readMatchSettingsFromCard(root: ParentNode, menus: MenuState): void {
  const hp = root.querySelector('#hp') as HTMLInputElement | HTMLSelectElement | null;
  const ft = root.querySelector('#ft') as HTMLInputElement | null;
  if (hp) menus.maxHp = Number(hp.value) || menus.maxHp;
  if (ft) menus.firstTo = Number(ft.value) || 0;
}

export function syncMatchSettingsFromDom(
  root: ParentNode,
  menus: MenuState,
  settings: { maxHp: number; firstTo: number },
): void {
  readMatchSettingsFromCard(root, menus);
  settings.maxHp = menus.maxHp;
  settings.firstTo = menus.firstTo;
}

/** PLAN 4.12: remember which joined seat lost its pad. */
export function markDisconnectedSeat(seats: Seat[], padId: string | undefined): number {
  if (padId) {
    const idx = seats.findIndex((s) => s.taken && s.padId === padId);
    if (idx >= 0) return idx;
  }
  return seats.findIndex((s) => s.taken && s.padId !== 'keyboard' && s.padId !== 'bot');
}

/** First newly connected pad claims the disconnected seat (same id already handled by caller). */
export function claimDisconnectedSeat(seats: Seat[], newPadId: string, claimIndex: number): Seat | undefined {
  const claim =
    (claimIndex >= 0 ? seats[claimIndex] : undefined) ??
    seats.find((s) => s.taken && s.padId !== 'keyboard' && s.padId !== 'bot') ??
    seats.find((s) => s.taken);
  if (claim) claim.padId = newPadId;
  return claim;
}

const COLORS = ['Yellow', 'Blue', 'Red', 'Green'];

export function cycleSeatColor(seat: Seat, dir: number): void {
  seat.color = (seat.color + dir + 4) % 4;
}

/** First press takes the next free seat; the same pad/keyboard pressing again readies (PLAN 4.12). */
export function takeOrReadySeat(seats: Seat[], padId: string): Seat | undefined {
  const existing = seats.find((s) => s.taken && s.padId === padId);
  if (existing) {
    existing.ready = true;
    return existing;
  }
  const empty = seats.find((s) => !s.taken);
  if (!empty) return undefined;
  empty.taken = true;
  empty.padId = padId;
  empty.ready = false;
  empty.color = seats.indexOf(empty);
  empty.name = padId === 'keyboard' ? 'You' : '';
  return empty;
}

/** Connection / first sighting of a pad: occupy a seat, do not ready yet. */
export function takeSeat(seats: Seat[], padId: string): Seat | undefined {
  const existing = seats.find((s) => s.padId === padId);
  if (existing) {
    existing.taken = true;
    return existing;
  }
  const empty = seats.find((s) => !s.taken);
  if (!empty) return undefined;
  empty.taken = true;
  empty.padId = padId;
  empty.ready = false;
  empty.color = seats.indexOf(empty);
  return empty;
}

export function canStartMatch(seats: Seat[]): boolean {
  return seats.some((s) => s.taken && s.ready);
}

export function collectSettings(
  card: HTMLElement,
  menus: MenuState,
  settings: UserSettings,
  userLevels: LevelDef[] = [],
): UserSettings {
  const num = (id: string, fallback: number) => {
    const el = card.querySelector(`#${id}`) as HTMLInputElement | null;
    return el ? Number(el.value) : fallback;
  };
  const chk = (id: string, fallback: boolean) => {
    const el = card.querySelector(`#${id}`) as HTMLInputElement | null;
    return el ? el.checked : fallback;
  };
  const sel = (id: string, fallback: string) => {
    const el = card.querySelector(`#${id}`) as HTMLSelectElement | null;
    return el ? el.value : fallback;
  };
  menus.maxHp = num('hp', menus.maxHp);
  menus.firstTo = num('ft', menus.firstTo);
  menus.bots = num('bots', menus.bots);
  const weapons = WEAPON_DEFS.filter((d) => d.dropWeight > 0);
  const enabledW = weapons.filter((d) => chk(`w-${d.id}`, true)).map((d) => d.id);
  const levels = [...builtInMatchLevels(), ...userLevels];
  const enabledL = levels.filter((l) => chk(`l-${l.id}`, true)).map((l) => l.id);
  return {
    ...settings,
    maxHp: menus.maxHp,
    firstTo: menus.firstTo,
    showWins: chk('wins', settings.showWins),
    haptics: chk('hap', settings.haptics),
    colorblind: chk('cb', settings.colorblind),
    reduceShake: chk('rs', settings.reduceShake),
    reduceBlood: chk('rb', settings.reduceBlood),
    lighting: chk('lit', settings.lighting),
    physicsArms: chk('arms', settings.physicsArms),
    includeUserLevels: chk('usr', settings.includeUserLevels),
    renderer: sel('ren', settings.renderer) as UserSettings['renderer'],
    rotation: sel('rot', settings.rotation) as UserSettings['rotation'],
    sfx: num('sfx', settings.sfx),
    music: num('mus', settings.music),
    enabledWeapons: enabledW.length === weapons.length ? 'all' : enabledW,
    enabledLevels: enabledL.length === levels.length ? 'all' : enabledL,
  };
}

export function collectPadMap(card: HTMLElement): { padId: string; map: PadMap } {
  const padId = (card.querySelector('#padid') as HTMLInputElement | null)?.value || 'custom';
  const n = (id: string, fallback: number) => {
    const el = card.querySelector(`#${id}`) as HTMLInputElement | null;
    return el ? Number(el.value) : fallback;
  };
  return {
    padId,
    map: {
      jump: n('map-jump', DEFAULT_MAP.jump),
      attack: n('map-attack', DEFAULT_MAP.attack),
      block: n('map-block', DEFAULT_MAP.block),
      throw: n('map-throw', DEFAULT_MAP.throw),
      pause: n('map-pause', DEFAULT_MAP.pause),
    },
  };
}

export function renderMenus(
  root: HTMLElement,
  state: MenuState,
  actions: MenuActions,
  settings: UserSettings = DEFAULT_USER_SETTINGS,
  maps: Record<string, PadMap> = {},
  stats?: {
    matches: number;
    wins: number;
    kos: number;
    achievements?: { firstBlood?: boolean; firstWin?: boolean; tenKos?: boolean };
  },
  userLevels: LevelDef[] = [],
): void {
  if (state.screen === 'editor') return;
  root.innerHTML = '';
  if (state.screen === 'play') return;
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,0.72);pointer-events:auto;';
  const card = document.createElement('div');
  card.style.cssText =
    'width:min(760px,94vw);max-height:92vh;overflow:auto;background:#1b1e27;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.4);';
  if (state.screen === 'menu') {
    card.innerHTML = `${brandMarkup()}
      <p style="color:#9aa3b2">Couch physics brawler. Press a button on a pad — or use the keyboard fallback.</p>
      <p id="localstats" style="color:#9aa3b2;font-size:13px"></p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px"></div>`;
    const row = card.querySelector('div')!;
    for (const [label, id] of [
      ['Local Play', 'local'],
      ['Solo vs Bots', 'bots'],
      ['Online', 'online'],
      ['Level Editor', 'editor'],
      ['Settings', 'settings'],
    ] as const) {
      row.append(btn(label, () => actions[id]?.()));
    }
    const statEl = card.querySelector('#localstats');
    if (statEl && stats) {
      const a = stats.achievements;
      const badges = [
        a?.firstBlood && 'first blood',
        a?.firstWin && 'first win',
        a?.tenKos && '10 KOs',
      ].filter(Boolean);
      statEl.textContent = `Local stats — matches ${stats.matches} · wins ${stats.wins} · KOs ${stats.kos}${badges.length ? ` · ${badges.join(', ')}` : ''}`;
    }
  } else if (state.screen === 'join') {
    card.innerHTML = `<h2>Join</h2><p>Press A / Space to join a seat. A / Space again readies. Left/Right change color. Start / Enter on a readied pad begins.</p>`;
    state.seats.forEach((s, i) => {
      const line = document.createElement('div');
      line.style.cssText = `margin:8px 0;padding:10px;border-radius:8px;background:${s.taken ? '#2a3144' : '#151820'}`;
      line.dataset.seat = String(i);
      if (s.ready) line.dataset.ready = '1';
      line.textContent = s.taken
        ? `P${i + 1} ${COLORS[s.color]} ${s.ready ? 'READY' : 'joined — press A / Space to ready'} (${s.padId})`
        : `P${i + 1} empty`;
      card.append(line);
    });
    card.append(btn('Start', () => actions.start?.()));
    card.append(btn('Back', () => actions.back?.()));
  } else if (state.screen === 'settings') {
    renderSettings(card, state, settings, maps, actions, userLevels);
  } else if (state.screen === 'pause') {
    card.innerHTML = `<h2>Paused</h2>`;
    card.append(btn('Resume', () => actions.resume?.()));
    card.append(btn('Quit', () => actions.quit?.()));
  } else if (state.screen === 'scoreboard') {
    card.innerHTML = scoreboardMarkup({
      title: 'Round over',
      wins: state.wins ?? [0, 0, 0, 0],
      firstTo: state.firstTo || undefined,
    });
    const note = document.createElement('p');
    note.textContent = 'Next level incoming…';
    card.append(note);
    card.append(btn('Back', () => actions.back?.()));
  } else if (state.screen === 'lobby') {
    renderLobby(card, state, settings, actions);
  } else if (state.screen === 'disconnect') {
    card.innerHTML = `<h2>Controller disconnected</h2><p>Reconnect the same pad to resume, or press a button on a new pad to claim the seat.</p>`;
  }
  if (state.notice) {
    const n = document.createElement('p');
    n.className = 'notice';
    n.textContent = state.notice;
    wrap.append(n);
  }
  wrap.append(card);
  root.append(wrap);
}

/** PLAN Appendix A host HP values as `<option>` markup. */
export function hpSelectOptions(current: number): string {
  const values = (HP_PRESETS as readonly number[]).includes(current)
    ? [...HP_PRESETS]
    : [...HP_PRESETS, current].sort((a, b) => a - b);
  return values
    .map((h) => `<option value="${h}" ${h === current ? 'selected' : ''}>${h}</option>`)
    .join('');
}

function renderSettings(
  card: HTMLElement,
  state: MenuState,
  settings: UserSettings,
  maps: Record<string, PadMap>,
  actions: MenuActions,
  userLevels: LevelDef[] = [],
): void {
  const weaponBoxes = WEAPON_DEFS.filter((d) => d.dropWeight > 0)
    .map((d) => {
      const on = settings.enabledWeapons === 'all' || settings.enabledWeapons.includes(d.id);
      return `<label style="display:inline-block;margin:2px 8px 2px 0"><input id="w-${d.id}" type="checkbox" ${on ? 'checked' : ''}/> ${weaponDisplayName(d)}</label>`;
    })
    .join('');
  const boxFor = (l: LevelDef, tag = '') => {
    const on = settings.enabledLevels === 'all' || settings.enabledLevels.includes(l.id);
    return `<label style="display:block;font-size:12px"><input id="l-${l.id}" type="checkbox" ${on ? 'checked' : ''}/> ${l.name} <span style="color:#9aa3b2">(${l.theme}${tag})</span></label>`;
  };
  const levelBoxes = builtInMatchLevels().slice(0, 80).map((l) => boxFor(l)).join('');
  const userBoxes =
    userLevels.length === 0
      ? '<p style="color:#9aa3b2;font-size:12px">No saved editor levels yet.</p>'
      : userLevels.map((l) => boxFor(l, ' · user')).join('');
  const lastMap = (state.remapPadId && maps[state.remapPadId]) || Object.entries(maps)[0]?.[1] || DEFAULT_MAP;
  const lastId = state.remapPadId || Object.keys(maps)[0] || '';
  if (state.remapPadId) card.dataset.remapPad = state.remapPadId;
  card.innerHTML = `<h2>Settings</h2>
      <label>HP <select id="hp">${hpSelectOptions(state.maxHp)}</select></label><br/>
      <label>First to <input id="ft" type="number" value="${state.firstTo}"></label><br/>
      <label>Bots <input id="bots" type="number" value="${state.bots}"></label><br/>
      <label>Show wins <input id="wins" type="checkbox" ${settings.showWins ? 'checked' : ''}></label><br/>
      <label>Haptics <input id="hap" type="checkbox" ${settings.haptics ? 'checked' : ''}></label><br/>
      <label>Colorblind palette <input id="cb" type="checkbox" ${settings.colorblind ? 'checked' : ''}></label><br/>
      <label>Reduce shake <input id="rs" type="checkbox" ${settings.reduceShake ? 'checked' : ''}></label><br/>
      <label>Reduce blood <input id="rb" type="checkbox" ${settings.reduceBlood ? 'checked' : ''}></label><br/>
      <label>2D lighting (radiance cascades) <input id="lit" type="checkbox" ${settings.lighting ? 'checked' : ''}></label><br/>
      <label>Physics arms (alive) <input id="arms" type="checkbox" ${settings.physicsArms ? 'checked' : ''}></label><br/>
      <label>Include user levels in rotation <input id="usr" type="checkbox" ${settings.includeUserLevels ? 'checked' : ''}></label><br/>
      <label>SFX <input id="sfx" type="range" min="0" max="1" step="0.05" value="${settings.sfx}"></label><br/>
      <label>Music <input id="mus" type="range" min="0" max="1" step="0.05" value="${settings.music}"></label><br/>
      <label>Level order
        <select id="rot">
          <option value="random" ${settings.rotation === 'random' ? 'selected' : ''}>Random</option>
          <option value="ordered" ${settings.rotation === 'ordered' ? 'selected' : ''}>Ordered</option>
        </select>
      </label><br/>
      <label>Renderer
        <select id="ren">
          <option value="auto" ${settings.renderer === 'auto' ? 'selected' : ''}>Auto</option>
          <option value="gpu" ${settings.renderer === 'gpu' ? 'selected' : ''}>SDF / WebGPU</option>
          <option value="canvas" ${settings.renderer === 'canvas' ? 'selected' : ''}>Canvas</option>
        </select>
      </label>
      <h3>Weapon toggles</h3>
      <div style="max-height:140px;overflow:auto;background:#151820;padding:8px;border-radius:8px">${weaponBoxes}</div>
      <h3>Level toggles</h3>
      <div style="max-height:140px;overflow:auto;background:#151820;padding:8px;border-radius:8px">${levelBoxes}</div>
      <h3>User levels</h3>
      <div id="userlevels" style="max-height:100px;overflow:auto;background:#151820;padding:8px;border-radius:8px">${userBoxes}</div>
      <h3>Per-pad remap</h3>
      <p style="color:#9aa3b2;font-size:13px">Offered automatically for non-<code>standard</code> mappings. Button indices follow the W3C Gamepad API.</p>
      <label>Pad id <input id="padid" value="${lastId}" placeholder="Xbox / DualSense id string"></label><br/>
      <label>Jump <input id="map-jump" type="number" value="${lastMap.jump}"></label>
      <label>Attack <input id="map-attack" type="number" value="${lastMap.attack}"></label>
      <label>Block <input id="map-block" type="number" value="${lastMap.block}"></label>
      <label>Throw <input id="map-throw" type="number" value="${lastMap.throw}"></label>
      <label>Pause <input id="map-pause" type="number" value="${lastMap.pause}"></label>`;
  card.append(
    btn('Save', () => {
      const next = collectSettings(card, state, settings, userLevels);
      Object.assign(settings, next);
      actions.save?.();
    }),
  );
  card.append(
    btn('Save remap', () => {
      actions.saveRemap?.();
    }),
  );
  card.append(btn('Back', () => actions.back?.()));
}

function syncLobbyFields(card: HTMLElement, state: MenuState, settings: UserSettings): void {
  const room = (card.querySelector('#room') as HTMLInputElement | null)?.value.trim().toUpperCase();
  if (room) state.roomCode = room;
  const hp = card.querySelector('#hp') as HTMLInputElement | null;
  if (hp) state.maxHp = Number(hp.value) || settings.maxHp;
  const ft = card.querySelector('#ft') as HTMLInputElement | null;
  if (ft) state.firstTo = Number(ft.value) || 0;
}

function renderLobby(
  card: HTMLElement,
  state: MenuState,
  settings: UserSettings,
  actions: MenuActions,
): void {
  card.innerHTML = `<h2>Online lobby</h2>
    <p>Host-authoritative WebRTC. Signaling is local (<code>npm run server</code>); live WAN STUN/TURN is a hardware path.</p>
    <label>Room code <input id="room" value="${state.roomCode}" placeholder="ABC123" maxlength="8"></label>
    <label>HP <select id="hp">${hpSelectOptions(state.maxHp)}</select></label>
    <label>First to <input id="ft" type="number" value="${state.firstTo}"></label>
    <p style="color:#9aa3b2;font-size:13px">Host-only: HP / first-to apply when you Host. Chat is reliable-channel text.</p>
    <p id="netstatus" data-net-role="${state.netRole}" data-net-state="${state.netState}">${
      state.netState === 'up'
        ? `${state.netRole} ${state.roomCode} — WebRTC up${state.lastSnapTick ? ` · snap ${state.lastSnapTick}` : ''}`
        : state.netState === 'connecting'
          ? 'Connecting…'
          : state.netState === 'error'
            ? state.notice || 'Signaling failed'
            : 'Idle — Host or Join a room'
    }</p>`;
  const chat = document.createElement('div');
  chat.style.maxHeight = '160px';
  chat.style.overflow = 'auto';
  chat.style.background = '#151820';
  chat.style.padding = '8px';
  chat.style.whiteSpace = 'pre-wrap';
  chat.textContent = state.chat.join('\n') || '(no messages)';
  const row = document.createElement('div');
  const input = document.createElement('input');
  input.id = 'chat';
  input.placeholder = 'Type a message';
  input.value = state.draftChat;
  input.style.width = '70%';
  row.append(input);
  row.append(
    btn('Send', () => {
      const text = input.value.trim();
      if (!text) return;
      syncLobbyFields(card, state, settings);
      state.draftChat = '';
      actions.chat?.(text);
    }),
  );
  card.append(chat, row);
  card.append(
    btn('Host', () => {
      syncLobbyFields(card, state, settings);
      if (!state.roomCode) state.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      actions.host?.();
    }),
  );
  card.append(
    btn('Join', () => {
      syncLobbyFields(card, state, settings);
      state.roomCode = state.roomCode || 'JOINME';
      actions.joinRoom?.();
    }),
  );
  if (state.netRole === 'host' && state.netState === 'up') {
    card.append(
      btn('Start match', () => {
        actions.startOnline?.();
      }),
    );
  }
  card.append(btn('Back', () => actions.back?.()));
}

/** PLAN M6 / §9: distinctive title + logo, not text-only. */
export function brandMarkup(): string {
  return `<img id="brand-logo" class="brand-logo" src="/favicon.svg" width="72" height="72" alt="Floppy Clash"/>
      <h1 style="margin:8px 0 8px;font-size:42px">Floppy Clash</h1>`;
}

/** Rising-edge helper for join D-pad color (PLAN 4.12). */
export function edgePressed(wasDown: boolean, isDown: boolean): boolean {
  return isDown && !wasDown;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'margin:6px 6px 0 0;padding:10px 16px;border:0;border-radius:10px;background:#f2c14e;color:#111;font-weight:700;cursor:pointer';
  b.addEventListener('click', onClick);
  return b;
}
