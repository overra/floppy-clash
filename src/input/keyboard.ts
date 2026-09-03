import type { PlayerInput } from '../sim/input';
import { worldToScreen, type CameraState } from '../render/camera';

export type KeyLatch = {
  jump: boolean;
  attack: boolean;
  block: boolean;
  throw: boolean;
  pause: boolean;
};

export function createKeyboardFallback(): {
  sample: (playerPos: { x: number; y: number }, cam: CameraState, viewW: number, viewH: number) => PlayerInput;
  consume: () => void;
  /** True once per Escape/P press, however brief; polling `down` would miss a tap shorter than a frame. */
  takePause: () => boolean;
  down: Set<string>;
  mouse: { x: number; y: number };
} {
  const down = new Set<string>();
  const mouse = { x: 0, y: 0 };
  const latch: KeyLatch = { jump: false, attack: false, block: false, throw: false, pause: false };
  window.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code === 'Space' || e.code === 'KeyW') latch.jump = true;
    if (e.code === 'KeyC' || e.code === 'KeyK') latch.attack = true;
    if (e.code === 'KeyV') latch.block = true;
    if (e.code === 'KeyF') latch.throw = true;
    if (e.code === 'Escape' || e.code === 'KeyP') latch.pause = true;
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) latch.attack = true;
    if (e.button === 2) latch.block = true;
  });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    down,
    mouse,
    sample(playerPos, cam, viewW, viewH) {
      const left = down.has('KeyA') || down.has('ArrowLeft');
      const right = down.has('KeyD') || down.has('ArrowRight');
      const duck = down.has('KeyS') || down.has('ArrowDown');
      const screen = worldToScreen(cam, playerPos.x, playerPos.y, viewW, viewH);
      const aimX = mouse.x - screen.x;
      const aimY = screen.y - mouse.y;
      const len = Math.hypot(aimX, aimY) || 1;
      return {
        moveX: (right ? 1 : 0) - (left ? 1 : 0),
        jump: latch.jump || down.has('Space') || down.has('KeyW'),
        down: duck,
        attack: latch.attack || down.has('KeyC'),
        block: latch.block || down.has('KeyV'),
        throw: latch.throw || down.has('KeyF'),
        aimX: aimX / len,
        aimY: aimY / len,
      };
    },
    consume() {
      latch.jump = false;
      latch.attack = false;
      latch.block = false;
      latch.throw = false;
    },
    takePause() {
      const p = latch.pause;
      latch.pause = false;
      return p;
    },
  };
}
