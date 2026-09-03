import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startSignaling } from '../server/signaling';
import { encode, decode } from '../src/net/protocol';

describe('signaling rooms', () => {
  it('relays SDP/ICE between two localhost sockets and replays offer to a late joiner', async () => {
    const handle = await startSignaling(0);
    const url = `ws://127.0.0.1:${handle.port}`;
    const a = new WebSocket(url);
    const b = new WebSocket(url);
    await Promise.all([
      new Promise<void>((res) => {
        a.on('open', () => res());
      }),
      new Promise<void>((res) => {
        b.on('open', () => res());
      }),
    ]);
    const fromB = new Promise<string>((res) => {
      b.on('message', (raw) => {
        const msg = decode(String(raw));
        if (msg.t === 'sdp') res(String(raw));
      });
    });
    a.send(encode({ t: 'room', code: 'SIG01' }));
    a.send(encode({ t: 'sdp', desc: { type: 'offer', sdp: 'v=0' } }));
    b.send(encode({ t: 'room', code: 'SIG01' }));
    const got = decode(await fromB);
    expect(got.t).toBe('sdp');
    if (got.t === 'sdp') expect(got.desc.type).toBe('offer');
    a.close();
    b.close();
    await handle.close();
  });
});
