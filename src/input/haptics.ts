export type RumbleKind = 'hit' | 'boom';

export type RumbleParams = {
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
};

const PATTERNS: Record<RumbleKind, RumbleParams> = {
  hit: { duration: 60, strongMagnitude: 0.35, weakMagnitude: 0.4 },
  boom: { duration: 180, strongMagnitude: 0.8, weakMagnitude: 0.4 },
};

export function rumbleParams(kind: RumbleKind): RumbleParams {
  return PATTERNS[kind];
}

export function playRumble(
  pads: (Gamepad | null)[],
  kind: RumbleKind,
  enabled: boolean,
  playEffect: (pad: Gamepad, params: RumbleParams) => void = defaultPlayEffect,
): number {
  if (!enabled) return 0;
  const params = PATTERNS[kind];
  let n = 0;
  for (const pad of pads) {
    if (!pad) continue;
    playEffect(pad, params);
    n += 1;
  }
  return n;
}

function defaultPlayEffect(pad: Gamepad, params: RumbleParams): void {
  const actuator = pad.vibrationActuator;
  if (!actuator?.playEffect) return;
  void actuator.playEffect('dual-rumble', params);
}
