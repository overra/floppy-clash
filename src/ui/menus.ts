import { builtInMatchLevels } from '../levels/catalog';
import { DEFAULT_MAP, type PadMap } from '../input/remap';
import { cleanPeerName, isRoomCode, normalizeRoomCode } from '../net/relay';
import { WEAPON_DEFS, weaponDisplayName } from '../sim/weapons/defs';
import { DEFAULT_USER_SETTINGS, type UserSettings } from './settingsStore';

export type Screen = 'menu' | 'join' | 'settings' | 'pause' | 'scoreboard' | 'lobby' | 'editor' | 'play' | 'disconnect';

export type Seat = {
  taken: boolean;
  ready: boolean;
  color: number;
  padId: string | 'keyboard' | 'bot';
  name: string;
};

export type LobbyPeer = { id: number; name: string; slot: number; color: number; host: boolean; me: boolean };

export type LobbyState = {
  phase: 'idle' | 'connecting' | 'connected';
  role: 'host' | 'client';
  name: string;
  peers: LobbyPeer[];
  /** Round trip to the relay in ms; 0 until measured. */
  ping: number;
  /** The host is mid-match (and this peer is watching from the lobby until the next one). */
  inMatch: boolean;
  shareUrl: string;
  /** Rules as the host has them, mirrored to clients so the lobby reads the same everywhere. */
  maxHp: number;
  firstTo: number;
  bots: number;
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
  lobby: LobbyState;
  /** An online match is running behind the pause card (the sim does not stop for one player). */
  online: boolean;
};

export type MenuActions = {
  [key: string]: (() => void) | ((payload?: string) => void) | undefined;
};

export function createLobbyState(): LobbyState {
  return { phase: 'idle', role: 'client', name: '', peers: [], ping: 0, inMatch: false, shareUrl: '', maxHp: 100, firstTo: 0, bots: 0 };
}

export function createMenuState(): MenuState {
  return {
    screen: 'menu',
    seats: Array.from({ length: 4 }, () => ({ taken: false, ready: false, color: 0, padId: '', name: '' })),
    notice: '',
    firstTo: 0,
    maxHp: 100,
    bots: 0,
    roomCode: '',
    chat: [],
    draftChat: '',
    lobby: createLobbyState(),
    online: false,
  };
}

const COLORS = ['Yellow', 'Blue', 'Red', 'Green'];
export const MAX_SEATS = 4;

/** Step to the next palette entry nobody else at the table has claimed. */
export function cycleSeatColor(seat: Seat, dir: number, seats: Seat[] = []): void {
  const used = new Set(seats.filter((s) => s !== seat && s.taken).map((s) => s.color));
  let next = seat.color;
  for (let i = 0; i < 4; i++) {
    next = (next + dir + 4) % 4;
    if (!used.has(next)) break;
  }
  seat.color = next;
}

function freeColor(seats: Seat[]): number {
  const used = new Set(seats.filter((s) => s.taken).map((s) => s.color));
  for (let c = 0; c < 4; c++) if (!used.has(c)) return c;
  return 0;
}

/** First press takes the next free seat; the same pad/keyboard pressing again readies (PLAN 4.12). */
export function takeOrReadySeat(seats: Seat[], padId: string, name = ''): Seat | undefined {
  const existing = seats.find((s) => s.taken && s.padId === padId);
  if (existing) {
    existing.ready = true;
    return existing;
  }
  const empty = seats.find((s) => !s.taken);
  if (!empty) return undefined;
  empty.color = freeColor(seats);
  empty.taken = true;
  empty.padId = padId;
  empty.ready = false;
  empty.name = name || (padId === 'keyboard' ? 'Keyboard' : '');
  return empty;
}

/** Connection / first sighting of a pad: occupy a seat, do not ready yet. */
export function takeSeat(seats: Seat[], padId: string, name = ''): Seat | undefined {
  const existing = seats.find((s) => s.padId === padId);
  if (existing) {
    existing.taken = true;
    if (name) existing.name = name;
    return existing;
  }
  const empty = seats.find((s) => !s.taken);
  if (!empty) return undefined;
  empty.color = freeColor(seats);
  empty.taken = true;
  empty.padId = padId;
  empty.ready = false;
  empty.name = name;
  return empty;
}

export function clearSeats(seats: Seat[]): void {
  seats.forEach((s, i) => {
    s.taken = false;
    s.ready = false;
    s.color = i;
    s.padId = '';
    s.name = '';
  });
}

export function canStartMatch(seats: Seat[]): boolean {
  return seats.some((s) => s.taken && s.ready);
}

/** How many bots fit beside the humans at the table. */
export function maxBots(seats: Seat[]): number {
  return MAX_SEATS - seats.filter((s) => s.taken).length;
}

/**
 * Palette index for every slot of a match: humans (taken seats, in order) keep what they picked,
 * bots take whatever is left, so no two fighters share a color.
 */
export function assignColors(seats: Seat[], total: number): number[] {
  const out: number[] = [];
  const used = new Set<number>();
  for (const s of seats.filter((s) => s.taken)) {
    let c = s.color;
    while (used.has(c)) c = (c + 1) % 4;
    used.add(c);
    out.push(c);
  }
  for (let c = 0; c < 4 && out.length < total; c++) {
    if (!used.has(c)) out.push(c);
  }
  while (out.length < total) out.push(out.length % 4);
  return out.slice(0, total);
}

export function collectSettings(card: HTMLElement, menus: MenuState, settings: UserSettings): UserSettings {
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
  const levels = builtInMatchLevels();
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
  stats?: { matches: number; wins: number; kos: number },
): void {
  root.innerHTML = '';
  if (state.screen === 'play') return;
  const wrap = document.createElement('div');
  wrap.className = `menu-wrap menu-${state.screen}`;
  const card = document.createElement('div');
  card.className = 'menu-card';
  if (state.screen === 'menu') {
    card.classList.add('title');
    card.innerHTML = `<h1 class="wordmark">Floppy <em>Clash</em></h1>
      <div class="wordmark-bar" aria-hidden="true"><i style="--c:var(--p0)"></i><i style="--c:var(--p1)"></i><i style="--c:var(--p2)"></i><i style="--c:var(--p3)"></i></div>
      <p class="tagline">Couch physics brawler. Press <kbd>A</kbd> on a pad to play — or use the keyboard.</p>
      <div class="menu-actions"></div>
      <p id="localstats" class="menu-stats"></p>
      <p class="menu-keys"><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd>/<kbd>Space</kbd> jump · <kbd>S</kbd> duck · mouse aim · <kbd>LMB</kbd>/<kbd>C</kbd> attack · <kbd>RMB</kbd>/<kbd>V</kbd> block · <kbd>F</kbd> throw</p>
      <p class="menu-keys"><kbd>Pad</kbd> left stick move · right stick aim · <kbd>A</kbd> jump · <kbd>RT</kbd>/<kbd>X</kbd> attack · <kbd>LT</kbd>/<kbd>B</kbd> block · <kbd>Y</kbd> throw · <kbd>Start</kbd> pause</p>`;
    const row = card.querySelector('.menu-actions')!;
    for (const [label, id, primary] of [
      ['Solo vs Bots', 'bots', true],
      ['Local Play', 'local', true],
      ['Online', 'online', false],
      ['Level Editor', 'editor', false],
      ['Settings', 'settings', false],
    ] as const) {
      row.append(btn(label, () => actions[id]?.(), primary ? 'primary' : ''));
    }
    const statEl = card.querySelector('#localstats');
    if (statEl && stats) {
      statEl.textContent = `Local stats — matches ${stats.matches} · wins ${stats.wins} · KOs ${stats.kos}`;
    }
  } else if (state.screen === 'join') {
    const bots = Math.min(state.bots, maxBots(state.seats));
    card.innerHTML = `<h2>Join</h2><p><kbd>A</kbd> / <kbd>Space</kbd> grabs a seat, again to ready up. <kbd>◀</kbd> <kbd>▶</kbd> picks a color, <kbd>▲</kbd> <kbd>▼</kbd> sets bots. <kbd>Start</kbd> / <kbd>Enter</kbd> begins${bots > 0 ? ` — ${bots} bot${bots === 1 ? '' : 's'} fill the empty seats` : ''}.</p>`;
    const seats = document.createElement('div');
    seats.className = 'seats';
    // Humans sit in the seats they took, in order; bots fill the seats after them, so the card
    // shows exactly who will stand where when the countdown starts.
    const colors = assignColors(state.seats, MAX_SEATS);
    let botsLeft = bots;
    state.seats.forEach((s, i) => {
      const bot = !s.taken && botsLeft > 0;
      if (bot) botsLeft -= 1;
      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.style.setProperty('--c', s.taken ? `var(--p${s.color})` : bot ? `var(--p${colors[i] ?? i})` : '#5a6170');
      seat.dataset.seat = String(i);
      seat.dataset.taken = s.taken ? '1' : '0';
      if (bot) seat.dataset.bot = '1';
      if (s.ready) seat.dataset.ready = '1';
      const face = document.createElement('div');
      face.className = 'hud-face';
      const name = document.createElement('div');
      name.className = 'seat-name';
      name.textContent = s.taken ? `P${i + 1} · ${COLORS[s.color]}` : bot ? `Bot ${i + 1}` : `P${i + 1}`;
      const status = document.createElement('div');
      status.className = 'seat-status';
      status.textContent = s.taken ? (s.ready ? 'READY' : 'joined — press A / Space to ready') : bot ? 'CPU' : 'empty';
      const pad = document.createElement('div');
      pad.className = 'seat-pad';
      pad.textContent = s.taken ? s.name || s.padId : '';
      seat.append(face, name, status, pad);
      seats.append(seat);
    });
    card.append(seats);
    const row = document.createElement('div');
    row.className = 'menu-actions';
    row.append(btn('Start', () => actions.start?.(), 'primary'));
    const botsBtn = btn(`Bots: ${bots}`, () => actions.cycleBots?.());
    botsBtn.id = 'cycle-bots';
    row.append(botsBtn);
    row.append(btn('Back', () => actions.back?.()));
    card.append(row);
  } else if (state.screen === 'settings') {
    renderSettings(card, state, settings, maps, actions);
  } else if (state.screen === 'pause') {
    card.classList.add('compact');
    if (state.online) {
      card.innerHTML = `<h2>Online match</h2><p>The fight goes on while this is open — nobody else's game pauses for you.</p>`;
    } else {
      card.innerHTML = `<h2>Paused</h2><p>Take a breather. The brawl waits.</p>`;
    }
    const row = document.createElement('div');
    row.className = 'menu-actions';
    row.append(btn('Resume', () => actions.resume?.(), 'primary'));
    row.append(btn(state.online ? (state.lobby.role === 'host' ? 'End match' : 'Leave match') : 'Quit', () => actions.quit?.()));
    card.append(row);
  } else if (state.screen === 'scoreboard') {
    card.innerHTML = `<h2 data-round-over="1">Round over</h2><p>Next level incoming…</p>`;
  } else if (state.screen === 'lobby') {
    renderLobby(card, state, settings, actions);
  } else if (state.screen === 'disconnect') {
    card.classList.add('compact');
    card.innerHTML = `<h2>Controller disconnected</h2><p>Reconnect the pad to pick up where you left off.</p>`;
    const row = document.createElement('div');
    row.className = 'menu-actions';
    row.append(btn('Resume anyway', () => actions.resume?.(), 'primary'));
    row.append(btn('Quit', () => actions.quit?.()));
    card.append(row);
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

function renderSettings(
  card: HTMLElement,
  state: MenuState,
  settings: UserSettings,
  maps: Record<string, PadMap>,
  actions: MenuActions,
): void {
  const weaponBoxes = WEAPON_DEFS.filter((d) => d.dropWeight > 0)
    .map((d) => {
      const on = settings.enabledWeapons === 'all' || settings.enabledWeapons.includes(d.id);
      return `<label class="chip"><input id="w-${d.id}" type="checkbox" ${on ? 'checked' : ''}/> ${weaponDisplayName(d)}</label>`;
    })
    .join('');
  const levelBoxes = builtInMatchLevels()
    .slice(0, 80)
    .map((l) => {
      const on = settings.enabledLevels === 'all' || settings.enabledLevels.includes(l.id);
      return `<label class="chip"><input id="l-${l.id}" type="checkbox" ${on ? 'checked' : ''}/> ${l.name} <span class="dim">${l.theme}</span></label>`;
    })
    .join('');
  const lastMap = Object.entries(maps)[0]?.[1] ?? DEFAULT_MAP;
  const lastId = Object.keys(maps)[0] ?? '';
  const check = (id: string, label: string, on: boolean) => `<label class="row"><span>${label}</span><input id="${id}" type="checkbox" ${on ? 'checked' : ''}></label>`;
  card.innerHTML = `<h2>Settings</h2>
      <h3>Match</h3>
      <div class="form-grid">
        <label class="row"><span>HP</span><input id="hp" type="number" min="1" value="${state.maxHp}"></label>
        <label class="row"><span>First to <small>(0 = endless)</small></span><input id="ft" type="number" min="0" value="${state.firstTo}"></label>
        <label class="row"><span>Bots</span><input id="bots" type="number" min="0" max="3" value="${state.bots}"></label>
        ${check('wins', 'Show wins', settings.showWins)}
        <label class="row"><span>Level order</span>
          <select id="rot">
            <option value="random" ${settings.rotation === 'random' ? 'selected' : ''}>Random</option>
            <option value="ordered" ${settings.rotation === 'ordered' ? 'selected' : ''}>Ordered</option>
          </select>
        </label>
        ${check('usr', 'Include user levels in rotation', settings.includeUserLevels)}
      </div>
      <h3>Feel &amp; accessibility</h3>
      <div class="form-grid">
        ${check('hap', 'Haptics', settings.haptics)}
        ${check('cb', 'Colorblind palette', settings.colorblind)}
        ${check('rs', 'Reduce shake', settings.reduceShake)}
        ${check('rb', 'Reduce blood', settings.reduceBlood)}
        <label class="row"><span>SFX</span><input id="sfx" type="range" min="0" max="1" step="0.05" value="${settings.sfx}"></label>
        <label class="row"><span>Music</span><input id="mus" type="range" min="0" max="1" step="0.05" value="${settings.music}"></label>
      </div>
      <h3>Video</h3>
      <div class="form-grid">
        <label class="row"><span>Renderer</span>
          <select id="ren">
            <option value="auto" ${settings.renderer === 'auto' ? 'selected' : ''}>Auto</option>
            <option value="gpu" ${settings.renderer === 'gpu' ? 'selected' : ''}>SDF / WebGPU</option>
            <option value="canvas" ${settings.renderer === 'canvas' ? 'selected' : ''}>Canvas</option>
          </select>
        </label>
        ${check('lit', '2D lighting (radiance cascades)', settings.lighting)}
      </div>
      <h3>Weapon toggles</h3>
      <div class="chips">${weaponBoxes}</div>
      <h3>Level toggles</h3>
      <div class="chips">${levelBoxes}</div>
      <h3>Per-pad remap</h3>
      <p class="dim">Offered automatically for non-<code>standard</code> mappings. Button indices follow the W3C Gamepad API.</p>
      <div class="form-grid">
        <label class="row wide"><span>Pad id</span><input id="padid" value="${lastId}" placeholder="Xbox / DualSense id string"></label>
        <label class="row"><span>Jump</span><input id="map-jump" type="number" value="${lastMap.jump}"></label>
        <label class="row"><span>Attack</span><input id="map-attack" type="number" value="${lastMap.attack}"></label>
        <label class="row"><span>Block</span><input id="map-block" type="number" value="${lastMap.block}"></label>
        <label class="row"><span>Throw</span><input id="map-throw" type="number" value="${lastMap.throw}"></label>
        <label class="row"><span>Pause</span><input id="map-pause" type="number" value="${lastMap.pause}"></label>
      </div>`;
  const row = document.createElement('div');
  row.className = 'menu-actions';
  row.append(
    btn(
      'Save',
      () => {
        const next = collectSettings(card, state, settings);
        Object.assign(settings, next);
        actions.save?.();
      },
      'primary',
    ),
  );
  row.append(
    btn('Save remap', () => {
      actions.saveRemap?.();
    }),
  );
  row.append(btn('Back', () => actions.back?.()));
  card.append(row);
}

/** Pull the lobby's editable fields back into state before an action reads them. */
export function syncLobbyFields(card: HTMLElement, state: MenuState): void {
  const room = card.querySelector('#room') as HTMLInputElement | null;
  if (room) state.roomCode = normalizeRoomCode(room.value);
  const name = card.querySelector('#name') as HTMLInputElement | null;
  if (name) state.lobby.name = cleanPeerName(name.value, '');
  const hp = card.querySelector('#hp') as HTMLInputElement | null;
  if (hp) state.lobby.maxHp = Math.max(1, Number(hp.value) || state.lobby.maxHp);
  const ft = card.querySelector('#ft') as HTMLInputElement | null;
  if (ft) state.lobby.firstTo = Math.max(0, Number(ft.value) || 0);
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function renderLobby(card: HTMLElement, state: MenuState, _settings: UserSettings, actions: MenuActions): void {
  const lobby = state.lobby;
  if (lobby.phase === 'idle') {
    const linked = isRoomCode(state.roomCode);
    card.innerHTML = `<h2>Online</h2>
      <p>Host a room and share the code or link — friends join from anywhere. The host's game runs the match; everyone else plays through it.</p>
      <div class="form-grid">
        <label class="row"><span>Your name</span><input id="name" value="${esc(lobby.name)}" placeholder="Player" maxlength="20" autocomplete="nickname"></label>
        <label class="row"><span>Room code</span><input id="room" value="${esc(state.roomCode)}" placeholder="leave blank to make one" maxlength="8" autocapitalize="characters" spellcheck="false"></label>
      </div>
      <p class="dim">Steer with the keyboard and mouse, or the first pad you press a button on.</p>`;
    const room = card.querySelector('#room') as HTMLInputElement;
    room.addEventListener('input', () => {
      const at = room.selectionStart;
      room.value = normalizeRoomCode(room.value);
      room.setSelectionRange(at, at);
    });
    card.querySelector('#name')?.addEventListener('change', () => {
      syncLobbyFields(card, state);
      actions.lobbyChanged?.();
    });
    const row = document.createElement('div');
    row.className = 'menu-actions';
    const host = btn(
      'Host',
      () => {
        syncLobbyFields(card, state);
        actions.host?.();
      },
      linked ? '' : 'primary',
    );
    const join = btn(
      'Join',
      () => {
        syncLobbyFields(card, state);
        actions.joinRoom?.();
      },
      linked ? 'primary' : '',
    );
    join.id = 'join-room';
    row.append(host, join, btn('Back', () => actions.back?.()));
    card.append(row);
    return;
  }

  if (lobby.phase === 'connecting') {
    card.classList.add('compact');
    card.innerHTML = `<h2>Connecting…</h2><p>Reaching room <b>${esc(state.roomCode)}</b>.</p>`;
    const row = document.createElement('div');
    row.className = 'menu-actions';
    row.append(btn('Cancel', () => actions.leave?.()));
    card.append(row);
    return;
  }

  const isHost = lobby.role === 'host';
  const hostPeer = lobby.peers.find((p) => p.host);
  card.innerHTML = `<h2>Room <span class="room-code" id="room-code">${esc(state.roomCode)}</span></h2>
    <p class="share-row">Invite: <code id="share-url">${esc(lobby.shareUrl)}</code></p>`;
  const share = card.querySelector('.share-row')!;
  const copy = btn('Copy link', () => actions.copyLink?.());
  copy.classList.add('small');
  share.append(copy);

  // Seats: peers in slot order, then the host's bots, then open chairs.
  const seats = document.createElement('div');
  seats.className = 'seats';
  const bots = isHost ? Math.min(state.bots, MAX_SEATS - lobby.peers.length) : lobby.bots;
  let botsLeft = bots;
  for (let i = 0; i < MAX_SEATS; i++) {
    const peer = lobby.peers.find((p) => p.slot === i);
    const bot = !peer && botsLeft > 0;
    if (bot) botsLeft -= 1;
    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.dataset.seat = String(i);
    seat.dataset.taken = peer ? '1' : '0';
    if (bot) seat.dataset.bot = '1';
    if (peer) seat.dataset.ready = '1';
    if (peer?.me) seat.dataset.me = '1';
    seat.style.setProperty('--c', peer || bot ? `var(--p${peer?.color ?? i})` : '#5a6170');
    const face = document.createElement('div');
    face.className = 'hud-face';
    const name = document.createElement('div');
    name.className = 'seat-name';
    name.textContent = peer ? peer.name : bot ? `Bot ${i + 1}` : 'Open';
    const status = document.createElement('div');
    status.className = 'seat-status';
    status.textContent = peer ? (peer.host ? 'HOST' : peer.me ? 'YOU' : 'READY') : bot ? 'CPU' : 'waiting for a player';
    const tag = document.createElement('div');
    tag.className = 'seat-pad';
    tag.textContent = peer?.me && peer.host ? 'you' : '';
    seat.append(face, name, status, tag);
    seats.append(seat);
  }
  card.append(seats);

  if (lobby.inMatch) {
    const p = document.createElement('p');
    p.className = 'lobby-status';
    p.textContent = isHost ? 'Your match is still running.' : 'A match is in progress — you are in the next one.';
    card.append(p);
  }

  if (isHost) {
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    grid.innerHTML = `
      <label class="row"><span>HP</span><input id="hp" type="number" min="1" value="${lobby.maxHp}"></label>
      <label class="row"><span>First to <small>(0 = endless)</small></span><input id="ft" type="number" min="0" value="${lobby.firstTo}"></label>`;
    card.append(grid);
    for (const id of ['#hp', '#ft']) {
      grid.querySelector(id)?.addEventListener('change', () => {
        syncLobbyFields(card, state);
        actions.lobbyChanged?.();
      });
    }
  } else {
    const rules = document.createElement('p');
    rules.className = 'dim';
    rules.textContent = `HP ${lobby.maxHp} · first to ${lobby.firstTo || 'endless'} · ${bots} bot${bots === 1 ? '' : 's'} · ${hostPeer ? `${hostPeer.name} starts the match` : 'waiting for the host'}`;
    card.append(rules);
  }

  const chat = document.createElement('div');
  chat.className = 'chat-log';
  chat.textContent = state.chat.join('\n') || '(say hi)';
  const chatRow = document.createElement('div');
  chatRow.className = 'chat-row';
  const input = document.createElement('input');
  input.id = 'chat';
  input.placeholder = 'Type a message';
  input.maxLength = 200;
  input.value = state.draftChat;
  input.addEventListener('input', () => {
    state.draftChat = input.value;
  });
  const sendChat = () => {
    const text = input.value.trim();
    if (!text) return;
    syncLobbyFields(card, state);
    state.draftChat = '';
    actions.chat?.(text);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  });
  chatRow.append(input, btn('Send', sendChat));
  card.append(chat, chatRow);
  chat.scrollTop = chat.scrollHeight;

  const ping = document.createElement('p');
  ping.className = 'dim';
  ping.innerHTML = `Relay ping <span id="ping">${lobby.ping || '–'}</span> ms · ${lobby.peers.length} of ${MAX_SEATS} connected`;
  card.append(ping);

  const row = document.createElement('div');
  row.className = 'menu-actions';
  if (isHost) {
    row.append(
      btn(
        lobby.inMatch ? 'Back to match' : 'Start',
        () => {
          syncLobbyFields(card, state);
          actions.startOnline?.();
        },
        'primary',
      ),
    );
    const botsBtn = btn(`Bots: ${bots}`, () => actions.cycleBots?.());
    botsBtn.id = 'cycle-bots';
    row.append(botsBtn);
  }
  row.append(btn('Leave', () => actions.leave?.()));
  card.append(row);
}

function btn(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = `menu-btn${variant ? ` ${variant}` : ''}`;
  b.addEventListener('click', onClick);
  return b;
}
