/**
 * After a client view exists, snapshot apply must not be a silent `catch`.
 * One rebuild retry, then fail loud (PLAN 4.13 host-authoritative view).
 */
export function applyExistingClientSnap<T>(opts: {
  view: T;
  apply: (view: T) => void;
  rebuild: () => T | null;
  log?: (err: unknown) => void;
}): T {
  try {
    opts.apply(opts.view);
    return opts.view;
  } catch (err) {
    (opts.log ?? console.error)(err);
    const next = opts.rebuild();
    if (!next) throw err;
    return next;
  }
}
