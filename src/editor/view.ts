import {
  addObject,
  exportLevel,
  fromHash,
  hitTest,
  loadLibrary,
  moveSelected,
  PALETTE,
  redo,
  rotateSelected,
  saveLibrary,
  shareHash,
  undo,
  type EditorState,
} from './editor';
import type { LevelDef } from '../sim/level/schema';

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
  pal.innerHTML = `<h2 style="margin:8px">Level Editor</h2><p style="color:#9aa3b2;padding:0 8px">Pad: tools. Mouse: click to place, drag to move.</p>`;
  for (const t of PALETTE) {
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
  const props = document.createElement('pre');
  props.id = 'edjson';
  props.style.cssText = 'font-size:11px;max-height:40vh;overflow:auto;background:#151820;padding:8px';
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
      void saveLibrary(state.level);
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
    const { importLevel } = await import('./editor');
    importLevel(state, text);
    draw();
  };
  side.append(actions, file, props);

  wrap.append(pal, mid, side);
  root.append(wrap);
  paintTools();

  const hash = location.hash.startsWith('#l=') ? location.hash.slice(3) : '';
  if (hash) {
    const loaded = fromHash(hash);
    if (loaded) state.level = loaded;
  }
  void loadLibrary();

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
    const hit = hitTest(state, w.x, w.y);
    if (hit < 0) addObject(state, w.x, w.y);
    drag = true;
    draw();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const w = toWorld(ev);
    moveSelected(state, w.x, w.y);
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
        obj.w = Math.max(0.5, (obj.w ?? 2) - state.grid);
        draw();
      }
    }
    if (ev.code === 'BracketRight') {
      const obj = state.level.objects[state.selected];
      if (obj) {
        obj.w = (obj.w ?? 2) + state.grid;
        draw();
      }
    }
  });

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
    state.level.objects.forEach((obj, i) => {
      const w = (obj.w ?? 2) * ppm;
      const h = (obj.h ?? 1) * ppm;
      ctx.fillStyle = i === state.selected ? '#f2c14e' : '#4c8dff';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(obj.x * ppm - w / 2, sy(obj.y) - h / 2, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(obj.type, obj.x * ppm - w / 2, sy(obj.y));
    });
    ctx.fillStyle = '#3dcf7a';
    for (const s of state.level.spawns) {
      ctx.beginPath();
      ctx.arc(s.x * ppm, sy(s.y), 6, 0, Math.PI * 2);
      ctx.fill();
    }
    props.textContent = exportLevel(state);
  }
  requestAnimationFrame(draw);
  new ResizeObserver(() => draw()).observe(mid);
}
