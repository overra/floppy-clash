import { decode, encode, type NetMessage } from './protocol';

export type PeerRole = 'host' | 'client';

export type NetSession = {
  role: PeerRole;
  room: string;
  send: (msg: NetMessage, reliable?: boolean) => void;
  onMessage: (fn: (msg: NetMessage) => void) => void;
  close: () => void;
  bytesOut: number;
  ready: boolean;
};

export function signalingUrlFromLocation(loc: { protocol: string; hostname: string; search: string } = location): string {
  const q = new URLSearchParams(loc.search).get('signal');
  if (q) return q;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.hostname}:8787`;
}

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
    ready: true,
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

/** Host-authoritative WebRTC DataChannels; signaling only exchanges SDP/ICE. */
export async function createWebRtcSession(
  signalingUrl: string,
  room: string,
  role: PeerRole,
): Promise<NetSession> {
  const ws = await connectSignaling(signalingUrl);
  const code = room.toUpperCase();
  const pc = new RTCPeerConnection({ iceServers: [] });
  const handlers: ((msg: NetMessage) => void)[] = [];
  let reliable: RTCDataChannel | null = role === 'host' ? pc.createDataChannel('reliable', { ordered: true }) : null;
  let unreliable: RTCDataChannel | null =
    role === 'host' ? pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 }) : null;

  const session: NetSession = {
    role,
    room: code,
    bytesOut: 0,
    ready: false,
    send(msg, rel = true) {
      const data = encode(msg);
      session.bytesOut += data.length;
      const ch = rel ? reliable : unreliable ?? reliable;
      if (ch?.readyState === 'open') ch.send(data);
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
    if (typeof ev.data !== 'string') return;
    const msg = decode(ev.data);
    for (const h of handlers) h(msg);
  };

  let markOpen: (() => void) | undefined;
  const opened = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('datachannel timeout')), 12_000);
    markOpen = () => {
      clearTimeout(t);
      resolve();
    };
  });

  const bindChannel = (ch: RTCDataChannel) => {
    ch.onmessage = onData;
    if (ch.label === 'unreliable') unreliable = ch;
    else reliable = ch;
    if (ch.readyState === 'open') markOpen?.();
    else ch.onopen = () => markOpen?.();
  };
  if (reliable) bindChannel(reliable);
  if (unreliable) bindChannel(unreliable);
  pc.ondatachannel = (ev) => bindChannel(ev.channel);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) ws.send(encode({ t: 'ice', cand: ev.candidate.toJSON() }));
  };

  ws.onmessage = async (ev) => {
    let msg: NetMessage | { t: 'peers'; n: number };
    try {
      msg = decode(String(ev.data)) as NetMessage | { t: 'peers'; n: number };
    } catch {
      return;
    }
    if (msg.t === 'sdp') {
      const desc = msg.desc;
      if (!desc?.type) return;
      if (desc.type === 'offer' && role === 'client') {
        await pc.setRemoteDescription(desc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(encode({ t: 'sdp', desc: answer }));
      }
      if (desc.type === 'answer' && role === 'host') {
        if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(desc);
      }
    }
    if (msg.t === 'ice' && msg.cand) {
      try {
        await pc.addIceCandidate(msg.cand);
      } catch {
        /* candidate may arrive before remote description */
      }
    }
  };

  ws.send(encode({ t: 'room', code }));

  if (role === 'host') {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(encode({ t: 'sdp', desc: offer }));
  }

  await opened;
  session.ready = true;
  return session;
}
