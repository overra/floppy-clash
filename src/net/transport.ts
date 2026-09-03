import { decode, encode, type NetMessage } from './protocol';
import { netShapeFromSearch, type NetShape } from './shape';

export type PeerRole = 'host' | 'client';

/** PLAN 4.13: public STUN; TURN stays optional and is not bundled. */
export const PUBLIC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const rtcConfig: RTCConfiguration = { iceServers: PUBLIC_ICE_SERVERS };

export type NetSession = {
  role: PeerRole;
  room: string;
  send: (msg: NetMessage, reliable?: boolean, except?: string) => void;
  onMessage: (fn: (msg: NetMessage) => void) => void;
  close: () => void;
  bytesOut: number;
  ready: boolean;
  peerCount: number;
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
    peerCount: 0,
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

type PeerLink = {
  pc: RTCPeerConnection;
  reliable: RTCDataChannel | null;
  unreliable: RTCDataChannel | null;
};

function readShape(): NetShape {
  if (typeof location === 'undefined') return { latencyMs: 0, loss: 0 };
  return netShapeFromSearch(location.search);
}

function deliver(ch: RTCDataChannel | null, data: string, reliable: boolean, shape: NetShape): void {
  if (!ch || ch.readyState !== 'open') return;
  if (!reliable && shape.loss > 0 && Math.random() < shape.loss) return;
  const fire = () => {
    if (ch.readyState === 'open') ch.send(data);
  };
  if (shape.latencyMs > 0) setTimeout(fire, shape.latencyMs);
  else fire();
}

/** Host-authoritative WebRTC DataChannels; signaling only exchanges SDP/ICE. */
export async function createWebRtcSession(
  signalingUrl: string,
  room: string,
  role: PeerRole,
): Promise<NetSession> {
  const ws = await connectSignaling(signalingUrl);
  const code = room.toUpperCase();
  const shape = readShape();
  const handlers: ((msg: NetMessage) => void)[] = [];
  const peers = new Map<string, PeerLink>();
  let selfId = '';
  let reliable: RTCDataChannel | null = null;
  let unreliable: RTCDataChannel | null = null;
  const clientPc = role === 'client' ? new RTCPeerConnection(rtcConfig) : null;

  const session: NetSession = {
    role,
    room: code,
    bytesOut: 0,
    ready: false,
    peerCount: 0,
    send(msg, rel = true, except) {
      const data = encode(msg);
      session.bytesOut += data.length;
      if (role === 'host') {
        for (const [id, link] of peers) {
          if (except && id === except) continue;
          const ch = rel ? link.reliable : (link.unreliable ?? link.reliable);
          deliver(ch, data, rel, shape);
        }
        return;
      }
      const ch = rel ? reliable : (unreliable ?? reliable);
      deliver(ch, data, rel, shape);
    },
    onMessage(fn) {
      handlers.push(fn);
    },
    close() {
      for (const p of peers.values()) p.pc.close();
      clientPc?.close();
      ws.close();
    },
  };

  const onData = (peerId: string) => (ev: MessageEvent) => {
    if (typeof ev.data !== 'string') return;
    const msg = decode(ev.data);
    if (msg.t === 'chat' && role === 'host') session.send(msg, true, peerId);
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

  const bindChannel = (ch: RTCDataChannel, peerId: string) => {
    ch.onmessage = onData(peerId);
    if (ch.label === 'unreliable') {
      if (role === 'host') {
        const link = peers.get(peerId);
        if (link) link.unreliable = ch;
      } else unreliable = ch;
    } else if (role === 'host') {
      const link = peers.get(peerId);
      if (link) link.reliable = ch;
    } else reliable = ch;
    if (ch.readyState === 'open') markOpen?.();
    else ch.onopen = () => markOpen?.();
  };

  const addPeer = async (id: string) => {
    if (role !== 'host' || peers.has(id)) return;
    const pc = new RTCPeerConnection(rtcConfig);
    const rel = pc.createDataChannel('reliable', { ordered: true });
    const unrel = pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 });
    peers.set(id, { pc, reliable: rel, unreliable: unrel });
    session.peerCount = peers.size;
    bindChannel(rel, id);
    bindChannel(unrel, id);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) ws.send(encode({ t: 'ice', cand: ev.candidate.toJSON(), to: id }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        for (const h of handlers) h({ t: 'event', kind: 'disconnect', payload: id });
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(encode({ t: 'sdp', desc: offer, to: id }));
  };

  if (clientPc) {
    clientPc.ondatachannel = (ev) => bindChannel(ev.channel, 'host');
    clientPc.onicecandidate = (ev) => {
      if (ev.candidate) ws.send(encode({ t: 'ice', cand: ev.candidate.toJSON() }));
    };
    clientPc.onconnectionstatechange = () => {
      if (clientPc.connectionState === 'disconnected' || clientPc.connectionState === 'failed') {
        for (const h of handlers) h({ t: 'event', kind: 'disconnect', payload: 'host' });
      }
    };
  }

  ws.onmessage = async (ev) => {
    let msg: NetMessage;
    try {
      msg = decode(String(ev.data)) as NetMessage;
    } catch {
      return;
    }
    if (msg.t === 'you') selfId = msg.id;
    if (msg.t === 'peer-join' && role === 'host') void addPeer(msg.id);
    if (msg.t === 'sdp') {
      const desc = msg.desc;
      if (!desc?.type) return;
      if (desc.type === 'offer' && role === 'client' && clientPc) {
        if (msg.to && selfId && msg.to !== selfId) return;
        await clientPc.setRemoteDescription(desc);
        const answer = await clientPc.createAnswer();
        await clientPc.setLocalDescription(answer);
        ws.send(encode({ t: 'sdp', desc: answer, to: msg.from }));
      }
      if (desc.type === 'answer' && role === 'host') {
        const link = (msg.from && peers.get(msg.from)) || [...peers.values()][0];
        if (link && link.pc.signalingState === 'have-local-offer') await link.pc.setRemoteDescription(desc);
      }
    }
    if (msg.t === 'ice' && msg.cand) {
      try {
        if (role === 'host') {
          const link = msg.from ? peers.get(msg.from) : [...peers.values()][0];
          await link?.pc.addIceCandidate(msg.cand);
        } else {
          await clientPc?.addIceCandidate(msg.cand);
        }
      } catch {
        /* candidate may arrive before remote description */
      }
    }
  };

  ws.send(encode({ t: 'room', code, role }));

  await opened;
  session.ready = true;
  session.peerCount = role === 'host' ? peers.size : 1;
  return session;
}
