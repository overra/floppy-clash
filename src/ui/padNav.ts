/**
 * Gamepad (and arrow-key) navigation over the DOM menus: a spatial focus cursor plus "press" and
 * "nudge" semantics for the controls the menus are made of.
 */

export type NavDir = 'up' | 'down' | 'left' | 'right';

export type Rect = { x: number; y: number; w: number; h: number };

export const FOCUS_CLASS = 'pad-focus';

const FOCUSABLE = 'button, input, select';

/**
 * Pick the rect to move to from `from` in direction `dir`: the nearest one whose centre lies past
 * the current centre along that axis, preferring candidates that overlap the current row/column.
 * Returns -1 when nothing lies that way.
 */
export function pickNext(rects: Rect[], from: number, dir: NavDir): number {
  const cur = rects[from];
  if (!cur) return rects.length ? 0 : -1;
  const cx = cur.x + cur.w / 2;
  const cy = cur.y + cur.h / 2;
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === from) return;
    const rx = r.x + r.w / 2;
    const ry = r.y + r.h / 2;
    const dx = rx - cx;
    const dy = ry - cy;
    // Must be at least a little past the current element along the axis of travel.
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (along < 1) return;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    // Overlap on the cross axis (same row / same column) is cheap; sideways drift is expensive so
    // "down" out of a button row lands on the row below rather than a far-right neighbour.
    const overlap =
      dir === 'left' || dir === 'right'
        ? Math.min(cur.y + cur.h, r.y + r.h) - Math.max(cur.y, r.y)
        : Math.min(cur.x + cur.w, r.x + r.w) - Math.max(cur.x, r.x);
    const score = along + (overlap > 0 ? across * 0.2 : across * 2.5 + 200);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.getAttribute('type') === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function rectOf(el: HTMLElement): Rect {
  // A checkbox is a tiny square; steer by its label so a chip grid reads as a grid of chips.
  const host = el.getAttribute('type') === 'checkbox' && el.parentElement?.tagName === 'LABEL' ? el.parentElement : el;
  const r = host.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function focusedIn(root: HTMLElement): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  return el && root.contains(el) ? el : null;
}

export function setFocus(root: HTMLElement, el: HTMLElement | null): void {
  for (const old of root.querySelectorAll(`.${FOCUS_CLASS}`)) old.classList.remove(FOCUS_CLASS);
  if (!el) return;
  el.classList.add(FOCUS_CLASS);
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Where the cursor starts on a fresh screen: the primary button on the short cards (title, pause),
 * otherwise the first control, so a form is read top to bottom rather than from its Save button.
 */
export function defaultFocus(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.menu-card.title .menu-btn.primary, .menu-card.compact .menu-btn.primary') ?? focusables(root)[0] ?? null;
}

/** Ensure something is focused, then step the cursor. Returns the newly focused element. */
export function moveFocus(root: HTMLElement, dir: NavDir): HTMLElement | null {
  const items = focusables(root);
  if (!items.length) return null;
  const current = focusedIn(root);
  if (!current || !items.includes(current)) {
    const first = defaultFocus(root);
    setFocus(root, first);
    return first;
  }
  const next = pickNext(items.map(rectOf), items.indexOf(current), dir);
  if (next < 0) return current;
  setFocus(root, items[next]!);
  return items[next]!;
}

/** Left / right on a control that holds a value: step it instead of moving away. Returns true if handled. */
export function nudge(el: HTMLElement | null, dir: NavDir): boolean {
  if (!el) return false;
  const delta = dir === 'right' || dir === 'down' ? 1 : -1;
  if (dir === 'up' || dir === 'down') return false;
  if (el instanceof HTMLSelectElement) {
    const n = el.options.length;
    if (!n) return true;
    el.selectedIndex = (el.selectedIndex + delta + n) % n;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range')) {
    if (delta > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

/** The "A" button: press buttons, toggle checkboxes, cycle selects. Text fields are left alone. */
export function activate(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLButtonElement) {
    el.click();
    return true;
  }
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.click();
    return true;
  }
  if (el instanceof HTMLSelectElement) return nudge(el, 'right');
  return false;
}
