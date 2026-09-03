export type Screen = 'menu' | 'join' | 'settings' | 'pause' | 'scoreboard' | 'lobby' | 'editor' | 'play' | 'disconnect';

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
};

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
  };
}

const COLORS = ['Yellow', 'Blue', 'Red', 'Green'];

export function renderMenus(root: HTMLElement, state: MenuState, actions: Record<string, () => void>): void {
  root.innerHTML = '';
  if (state.screen === 'play') return;
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,0.72);pointer-events:auto;';
  const card = document.createElement('div');
  card.style.cssText =
    'width:min(720px,92vw);background:#1b1e27;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.4);';
  if (state.screen === 'menu') {
    card.innerHTML = `<h1 style="margin:0 0 8px;font-size:42px">Floppy Clash</h1>
      <p style="color:#9aa3b2">Couch physics brawler. Press a button on a pad — or use the keyboard fallback.</p>
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
  } else if (state.screen === 'join') {
    card.innerHTML = `<h2>Join</h2><p>Press A / Space to join a seat. Left/Right change color. Start / Enter to begin.</p>`;
    state.seats.forEach((s, i) => {
      const line = document.createElement('div');
      line.style.cssText = `margin:8px 0;padding:10px;border-radius:8px;background:${s.taken ? '#2a3144' : '#151820'}`;
      line.textContent = s.taken
        ? `P${i + 1} ${COLORS[s.color]} ${s.ready ? 'READY' : ''} (${s.padId})`
        : `P${i + 1} empty`;
      card.append(line);
    });
    card.append(btn('Start', () => actions.start?.()));
    card.append(btn('Back', () => actions.back?.()));
  } else if (state.screen === 'settings') {
    card.innerHTML = `<h2>Settings</h2>
      <label>HP <input id="hp" type="number" value="${state.maxHp}"></label><br/>
      <label>First to <input id="ft" type="number" value="${state.firstTo}"></label><br/>
      <label>Bots <input id="bots" type="number" value="${state.bots}"></label><br/>
      <label>Show wins <input id="wins" type="checkbox" checked></label><br/>
      <label>Haptics <input id="hap" type="checkbox" checked></label><br/>
      <label>Colorblind palette <input id="cb" type="checkbox"></label><br/>
      <label>Reduce shake <input id="rs" type="checkbox"></label><br/>
      <label>Reduce blood <input id="rb" type="checkbox"></label><br/>
      <label>2D lighting (stretch) <input id="lit" type="checkbox"></label><br/>
      <label>Renderer
        <select id="ren">
          <option value="auto">Auto</option>
          <option value="gpu">SDF / WebGPU</option>
          <option value="canvas">Canvas</option>
        </select>
      </label>
      <p style="color:#9aa3b2">Weapon and level toggles apply from the host; per-pad remap is offered on non-standard mappings.</p>`;
    card.append(btn('Save', () => {
      state.maxHp = Number((card.querySelector('#hp') as HTMLInputElement).value);
      state.firstTo = Number((card.querySelector('#ft') as HTMLInputElement).value);
      state.bots = Number((card.querySelector('#bots') as HTMLInputElement).value);
      actions.save?.();
    }));
    card.append(btn('Back', () => actions.back?.()));
  } else if (state.screen === 'pause') {
    card.innerHTML = `<h2>Paused</h2>`;
    card.append(btn('Resume', () => actions.resume?.()));
    card.append(btn('Quit', () => actions.quit?.()));
  } else if (state.screen === 'scoreboard') {
    card.innerHTML = `<h2>Round over</h2><p>Next level incoming…</p>`;
  } else if (state.screen === 'lobby') {
    card.innerHTML = `<h2>Online lobby</h2><p>Room ${state.roomCode || '------'}</p>`;
    const chat = document.createElement('div');
    chat.style.maxHeight = '160px';
    chat.style.overflow = 'auto';
    chat.textContent = state.chat.join('\n');
    card.append(chat);
    card.append(btn('Host', () => actions.host?.()));
    card.append(btn('Join', () => actions.joinRoom?.()));
    card.append(btn('Back', () => actions.back?.()));
  } else if (state.screen === 'disconnect') {
    card.innerHTML = `<h2>Controller disconnected</h2><p>Reconnect the same pad to resume.</p>`;
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

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'margin:6px 6px 0 0;padding:10px 16px;border:0;border-radius:10px;background:#f2c14e;color:#111;font-weight:700;cursor:pointer';
  b.addEventListener('click', onClick);
  return b;
}
