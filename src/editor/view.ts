import {
  addObject,
  applyEditorPad,
  deleteLibrary,
  exportLevel,
  EXTRA_TOOLS,
  hitTest,
  IDLE_EDITOR_PAD,
  importLevel,
  loadLibrary,
  moveSelected,
  moveSpawn,
  PALETTE,
  redo,
  resizeSelected,
  rotateSelected,
  saveLibrary,
  selectSpawnAt,
  shareHash,
  undo,
  type EditorPadButtons,
  type EditorState,
} from './editor';
import { applyField, fieldValue, objectSchemaFields } from './properties';
import type { LevelDef } from '../sim/level/schema';
import { joinStartIndex, loadMaps } from '../input/remap';
import { buttonOn } from '../input/gamepad';

export type EditorViewFns = {
  playtest: (level: LevelDef) => void;
  back: () => void;
};

export function mountEditor(root: HTMLElement, state: EditorState, fns: EditorViewFns): void {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:absolute;inset:0;background:#111318;color:#fff;display:grid;grid-template-columns:220px 1fr 280px;gap:8px;padding:8px;pointer-events:auto';

  const pal = document.createElement('div');
  pal.innerHTML = `<h2 style="margin:8px">Level Editor</h2><p style="color:#9aa3b2;padding:0 8px">Pad: D-pad moves selection. Mouse: click to place, drag to move. Property fields come from the zod schema.</p>`;
  for (const t of [...PALETTE, ...EXTRA_TOOLS]) {
    const b = document.createElement('button');
    b.textContent = t;
    b.dataset.tool = t;
    b.style.cssText = 'display:block;width:100%;margin:2px 0;padding:6px;text-align:left';
    b.onclick = () => {
      state.tool = t;
      paintTools();
    };
    pal.append(b);
  }
  function paintTools() {
    pal.querySelectorAll('button[data-tool]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      btn.style.background = btn.dataset.tool === state.tool ? '#f2c14e' : '#2a3144';
      btn.style.color = btn.dataset.tool === state.tool ? '#111' : '#fff';
    });
  }

  const mid = document.createElement('div');
  mid.style.cssText = 'position:relative;background:#0b0d12;border-radius:8px;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair';
  mid.append(canvas);

  const side = document.createElement('div');
  side.innerHTML = `<h3>Properties</h3>`;
  const fields = document.createElement('div');
  fields.id = 'edfields';
  const props = document.createElement('pre');
  props.id = 'edjson';
  props.style.cssText = 'font-size:11px;max-height:22vh;overflow:auto;background:#151820;padding:8px';
  const actions = document.createElement('div');
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.margin = '4px';
    b.onclick = fn;
    return b;
  };
  actions.append(
    mk('Add at 12,6', () => {
      addObject(state, 12, 6);
      draw();
    }),
    mk('Undo', () => {
      undo(state);
      draw();
    }),
    mk('Redo', () => {
      redo(state);
      draw();
    }),
    mk('Rotate', () => {
      rotateSelected(state, 0.2);
      draw();
    }),
    mk('Resize +', () => {
      const obj = state.level.objects[state.selected];
      if (!obj) return;
      resizeSelected(state, (obj.w ?? 2) + state.grid, (obj.h ?? 1) + state.grid);
      draw();
    }),
    mk('Resize -', () => {
      const obj = state.level.objects[state.selected];
      if (!obj) return;
      resizeSelected(state, (obj.w ?? 2) - state.grid, (obj.h ?? 1) - state.grid);
      draw();
    }),
    mk('Export', () => {
      const blob = new Blob([exportLevel(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.level.id}.json`;
      a.click();
    }),
    mk('Share URL', () => {
      location.hash = `l=${shareHash(state)}`;
    }),
    mk('Save library', () => {
      void saveLibrary(state.level).then(() => void refreshLibrary());
    }),
    mk('Playtest', () => fns.playtest(state.level)),
    mk('Back', () => fns.back()),
  );
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.onchange = async () => {
    const text = await file.files?.[0]?.text();
    if (!text) return;
    importLevel(state, text);
    draw();
  };
  const lib = document.createElement('div');
  lib.id = 'edlib';
  lib.style.cssText = 'font-size:12px;max-height:18vh;overflow:auto;background:#151820;padding:8px;margin:6px 0';
  side.append(actions, file, fields, lib, props);

  wrap.append(pal, mid, side);
  root.append(wrap);
  paintTools();

  async function refreshLibrary(): Promise<void> {
    const levels = await loadLibrary().catch(() => []);
    lib.innerHTML = levels.length
      ? ''
      : '<p style="color:#9aa3b2;margin:0">Library empty — Save library to keep this draft.</p>';
    for (const level of levels) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:4px 0';
      const label = document.createElement('span');
      label.textContent = `${level.name} (${level.id})`;
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => {
        state.level = structuredClone(level);
        state.selected = 0;
        draw();
      };
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => {
        void deleteLibrary(level.id).then(() => void refreshLibrary());
      };
      row.append(label, loadBtn, delBtn);
      lib.append(row);
    }
  }
  void refreshLibrary();

  let drag = false;
  const toWorld = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const ppm = Math.min(r.width / state.level.bounds.w, r.height / state.level.bounds.h);
    return {
      x: (ev.clientX - r.left) / ppm,
      y: state.level.bounds.h - (ev.clientY - r.top) / ppm,
    };
  };
  canvas.addEventListener('pointerdown', (ev) => {
    const w = toWorld(ev);
    if (state.tool === 'spawn') {
      const hit = selectSpawnAt(state, w.x, w.y);
      if (hit < 0) addObject(state, w.x, w.y);
    } else if (state.tool === 'drop-range') {
      addObject(state, w.x, w.y);
    } else {
      const hit = hitTest(state, w.x, w.y);
      if (hit < 0) addObject(state, w.x, w.y);
    }
    drag = true;
    draw();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const w = toWorld(ev);
    if (state.tool === 'spawn') moveSpawn(state, state.selectedSpawn, w.x, w.y);
    else if (state.tool !== 'drop-range') moveSelected(state, w.x, w.y);
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    drag = false;
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'KeyZ' && ev.ctrlKey) {
      undo(state);
      draw();
    }
    if (ev.code === 'KeyY' && ev.ctrlKey) {
      redo(state);
      draw();
    }
    if (ev.code === 'BracketLeft') {
      const obj = state.level.objects[state.selected];
      if (obj) {
        if (ev.shiftKey) resizeSelected(state, obj.w ?? 2, (obj.h ?? 1) - state.grid);
        else resizeSelected(state, (obj.w ?? 2) - state.grid, obj.h ?? 1);
        draw();
      }
    }
    if (ev.code === 'BracketRight') {
      const obj = state.level.objects[state.selected];
      if (obj) {
        if (ev.shiftKey) resizeSelected(state, obj.w ?? 2, (obj.h ?? 1) + state.grid);
        else resizeSelected(state, (obj.w ?? 2) + state.grid, obj.h ?? 1);
        draw();
      }
    }
    const step = ev.shiftKey ? state.grid * 4 : state.grid;
    if (ev.code === 'ArrowLeft') {
      nudge(-step, 0);
      ev.preventDefault();
    }
    if (ev.code === 'ArrowRight') {
      nudge(step, 0);
      ev.preventDefault();
    }
    if (ev.code === 'ArrowUp') {
      nudge(0, step);
      ev.preventDefault();
    }
    if (ev.code === 'ArrowDown') {
      nudge(0, -step);
      ev.preventDefault();
    }
    if (ev.code === 'KeyA' && !ev.ctrlKey && !ev.metaKey) {
      addObject(state, 12, 6);
      draw();
    }
  });

  function nudge(dx: number, dy: number) {
    if (state.tool === 'spawn') {
      const s = state.level.spawns[state.selectedSpawn];
      if (s) moveSpawn(state, state.selectedSpawn, s.x + dx, s.y + dy);
    } else {
      const obj = state.level.objects[state.selected];
      if (obj) moveSelected(state, obj.x + dx, obj.y + dy);
    }
    draw();
  }

  function paintFields() {
    fields.innerHTML = '';
    const obj = state.level.objects[state.selected];
    if (!obj) {
      const drop = document.createElement('p');
      drop.style.color = '#9aa3b2';
      drop.textContent = `Drops ${state.level.drops?.xMin ?? 4}–${state.level.drops?.xMax ?? 28}. Spawns: ${state.level.spawns.length}.`;
      fields.append(drop);
      return;
    }
    for (const field of objectSchemaFields()) {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;font-size:12px;margin:4px 0';
      row.textContent = `${field.key} `;
      if (field.kind === 'enum' && field.options) {
        const sel = document.createElement('select');
        for (const opt of field.options) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (fieldValue(obj, field.key) === opt) o.selected = true;
          sel.append(o);
        }
        sel.onchange = () => {
          applyField(obj, field.key, sel.value);
          draw();
        };
        row.append(sel);
      } else {
        const input = document.createElement('input');
        input.value = fieldValue(obj, field.key);
        input.style.width = '70%';
        input.onchange = () => {
          applyField(obj, field.key, input.value);
          draw();
        };
        row.append(input);
      }
      fields.append(row);
    }
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(4, Math.floor(r.width * devicePixelRatio));
    canvas.height = Math.max(4, Math.floor(r.height * devicePixelRatio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, r.width, r.height);
    const ppm = Math.min(r.width / state.level.bounds.w, r.height / state.level.bounds.h);
    const sy = (y: number) => r.height - y * ppm;
    ctx.strokeStyle = '#1f2430';
    for (let x = 0; x <= state.level.bounds.w; x += state.grid) {
      ctx.beginPath();
      ctx.moveTo(x * ppm, 0);
      ctx.lineTo(x * ppm, r.height);
      ctx.stroke();
    }
    for (let y = 0; y <= state.level.bounds.h; y += state.grid) {
      ctx.beginPath();
      ctx.moveTo(0, sy(y));
      ctx.lineTo(r.width, sy(y));
      ctx.stroke();
    }
    if (state.level.drops) {
      ctx.fillStyle = 'rgba(242,193,78,0.12)';
      const x0 = state.level.drops.xMin * ppm;
      const x1 = state.level.drops.xMax * ppm;
      ctx.fillRect(x0, 0, x1 - x0, r.height);
    }
    state.level.objects.forEach((obj, i) => {
      const w = (obj.w ?? 2) * ppm;
      const h = (obj.h ?? 1) * ppm;
      ctx.save();
      ctx.translate(obj.x * ppm, sy(obj.y));
      ctx.rotate(-(obj.angle ?? 0));
      ctx.fillStyle = i === state.selected ? '#f2c14e' : '#4c8dff';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(obj.type, -w / 2, 0);
      ctx.restore();
    });
    ctx.fillStyle = '#3dcf7a';
    state.level.spawns.forEach((s, i) => {
      ctx.beginPath();
      ctx.arc(s.x * ppm, sy(s.y), i === state.selectedSpawn ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
    });
    props.textContent = exportLevel(state);
    paintFields();
  }
  requestAnimationFrame(draw);
  new ResizeObserver(() => draw()).observe(mid);

  let padEdge: EditorPadButtons = { ...IDLE_EDITOR_PAD };
  const pollPad = () => {
    if (!wrap.isConnected) return;
    const pad = typeof navigator !== 'undefined' ? navigator.getGamepads?.().find(Boolean) : null;
    if (pad) {
      const now: EditorPadButtons = {
        left: !!pad.buttons[14]?.pressed,
        right: !!pad.buttons[15]?.pressed,
        up: !!pad.buttons[12]?.pressed,
        down: !!pad.buttons[13]?.pressed,
        a: !!pad.buttons[0]?.pressed,
        b: !!pad.buttons[1]?.pressed,
        lb: !!pad.buttons[4]?.pressed,
        rb: !!pad.buttons[5]?.pressed,
        start: buttonOn(pad.buttons[joinStartIndex(loadMaps()[pad.id])]),
      };
      const result = applyEditorPad(state, padEdge, now);
      if (result.nudged || result.placed) draw();
      if (result.toolChanged) paintTools();
      if (result.playtest) fns.playtest(state.level);
      if (result.back) fns.back();
      padEdge = now;
    }
    requestAnimationFrame(pollPad);
  };
  requestAnimationFrame(pollPad);
}
