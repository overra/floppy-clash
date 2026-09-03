import { decode, encode, type NetMessage } from './protocol';

export type PeerRole = 'host' | 'client';

export type NetSession = {
  role: PeerRole;
  room: string;
  send: (msg: NetMessage, reliable?: boolean) => void;
  onMessage: (fn: (msg: NetMessage) => void) => void;
  close: () => void;
  bytesOut: number;
};

export async function connectSignaling(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('signaling failed'));
  });
}

export function createLocalLoopback(): NetSession {
  const handlers: ((msg: NetMessage) => void)[] = [];
  return {
    role: 'host',
    room: 'LOCAL',
    bytesOut: 0,
    send(msg) {
      this.bytesOut += encode(msg).length;
      for (const h of handlers) h(msg);
    },
    onMessage(fn) {
      handlers.push(fn);
    },
    close() {
      handlers.length = 0;
    },
  };
}

export async function createWebRtcSession(
  signalingUrl: string,
  room: string,
  role: PeerRole,
): Promise<NetSession> {
  const ws = await connectSignaling(signalingUrl);
  ws.send(encode({ t: 'room', code: room }));
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const reliable = pc.createDataChannel('reliable', { ordered: true });
  const unreliable = pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 });
  const handlers: ((msg: NetMessage) => void)[] = [];
  const session: NetSession = {
    role,
    room,
    bytesOut: 0,
    send(msg, rel = true) {
      const data = encode(msg);
      session.bytesOut += data.length;
      const ch = rel ? reliable : unreliable;
      if (ch.readyState === 'open') ch.send(data);
    },
    onMessage(fn) {
      handlers.push(fn);
    },
    close() {
      pc.close();
      ws.close();
    },
  };
  const onData = (ev: MessageEvent) => {
    if (typeof ev.data === 'string') {
      const msg = decode(ev.data);
      for (const h of handlers) h(msg);
    }
  };
  reliable.onmessage = onData;
  unreliable.onmessage = onData;
  pc.ondatachannel = (ev) => {
    ev.channel.onmessage = onData;
  };
  ws.onmessage = async (ev) => {
    const msg = decode(String(ev.data));
    if (msg.t === 'sdp') await pc.setRemoteDescription(msg.desc);
    if (msg.t === 'ice' && msg.cand) await pc.addIceCandidate(msg.cand);
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) ws.send(encode({ t: 'ice', cand: ev.candidate.toJSON() }));
  };
  if (role === 'host') {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(encode({ t: 'sdp', desc: offer }));
  }
  return session;
}
