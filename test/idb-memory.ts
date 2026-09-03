/** Minimal IndexedDB stand-in so editor library tests exercise the IDB path in Node. */

type Req = {
  result: unknown;
  error: Error | null;
  onsuccess: ((this: Req, ev: { target: Req }) => void) | null;
  onerror: ((this: Req, ev: { target: Req }) => void) | null;
  onupgradeneeded: ((this: Req, ev: { target: Req }) => void) | null;
};

function makeReq(): Req {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
}

function succeed(req: Req, value: unknown): void {
  req.result = value;
  queueMicrotask(() => req.onsuccess?.({ target: req }));
}

export function installMemoryIndexedDB(): Map<string, Map<string, unknown>> {
  const dbs = new Map<string, Map<string, unknown>>();

  const open = (name: string) => {
    const req = makeReq();
    queueMicrotask(() => {
      const fresh = !dbs.has(name);
      if (fresh) dbs.set(name, new Map());
      const db = {
        createObjectStore() {
          return undefined;
        },
        transaction(_store: string) {
          const data = dbs.get(name)!;
          const store = {
            put(value: unknown, key: string) {
              data.set(String(key), value);
              return makeReq();
            },
            delete(key: string) {
              data.delete(String(key));
              return makeReq();
            },
            getAll() {
              const r = makeReq();
              queueMicrotask(() => succeed(r, [...data.values()]));
              return r;
            },
          };
          const tx = {
            objectStore: () => store,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            error: null as Error | null,
          };
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
      };
      req.result = db;
      if (fresh) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    });
    return req;
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: { open },
  });
  return dbs;
}
