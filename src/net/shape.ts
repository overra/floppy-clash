export type NetShape = { latencyMs: number; loss: number };

/** `?net=100,2` → 100 ms delay and 2 % loss on the unreliable channel. */
export function netShapeFromSearch(search = ''): NetShape {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const net = q.get('net');
  if (net) {
    const [ms, pct] = net.split(',');
    return {
      latencyMs: Math.max(0, Number(ms) || 0),
      loss: Math.max(0, (Number(pct) || 0) / 100),
    };
  }
  return {
    latencyMs: Math.max(0, Number(q.get('lag')) || 0),
    loss: Math.max(0, Number(q.get('loss')) || 0),
  };
}
