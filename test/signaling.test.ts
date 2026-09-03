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

  it('acks a host-only room so the host can wait for late joiners', async () => {
    const handle = await startSignaling(0);
    const url = `ws://127.0.0.1:${handle.port}`;
    const host = new WebSocket(url);
    await new Promise<void>((res) => {
      host.on('open', () => res());
    });
    const you = new Promise<string>((res) => {
      host.on('message', (raw) => {
        const msg = decode(String(raw));
        if (msg.t === 'you') res(msg.id);
      });
    });
    host.send(encode({ t: 'room', code: 'SOLO', role: 'host' }));
    expect((await you).length).toBeGreaterThan(0);
    host.close();
    await handle.close();
  });

  it('notifies the host of two joining peers for a 4-player star', async () => {
    const handle = await startSignaling(0);
    const url = `ws://127.0.0.1:${handle.port}`;
    const host = new WebSocket(url);
    const c1 = new WebSocket(url);
    const c2 = new WebSocket(url);
    await Promise.all(
      [host, c1, c2].map(
        (ws) =>
          new Promise<void>((res) => {
            ws.on('open', () => res());
          }),
      ),
    );
    const joins: string[] = [];
    const gotTwo = new Promise<void>((res) => {
      host.on('message', (raw) => {
        const msg = decode(String(raw));
        if (msg.t === 'peer-join') {
          joins.push(msg.id);
          if (joins.length >= 2) res();
        }
      });
    });
    host.send(encode({ t: 'room', code: 'FOUR', role: 'host' }));
    c1.send(encode({ t: 'room', code: 'FOUR', role: 'client' }));
    c2.send(encode({ t: 'room', code: 'FOUR', role: 'client' }));
    await gotTwo;
    expect(joins.length).toBeGreaterThanOrEqual(2);
    host.close();
    c1.close();
    c2.close();
    await handle.close();
  });
});
