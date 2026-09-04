import type { DeviceInfo } from './schema';

/**
 * Coarse device classification for telemetry: desktop / mobile / tablet, an OS family and a
 * browser family. Deliberately no versions and nothing rarer than a family — the point is to be
 * able to say "long frames are a Safari thing" or "half the players are on phones", not to
 * fingerprint anyone. Pure function over the UA string plus the client hints that exist, so it is
 * unit-testable without a browser.
 */

export type UserAgentHints = {
  /** `navigator.userAgentData.mobile` */
  mobile?: boolean;
  /** `navigator.userAgentData.platform` */
  platform?: string;
  /** `navigator.userAgentData.brands[].brand` */
  brands?: readonly string[];
  /** `navigator.maxTouchPoints` — iPadOS Safari reports a Mac UA but many touch points. */
  touchPoints?: number;
};

export function classifyUserAgent(ua: string, hints: UserAgentHints = {}): DeviceInfo {
  const os = osFamily(ua, hints);
  return { device: deviceClass(ua, os, hints), os, browser: browserFamily(ua, hints.brands) };
}

function osFamily(ua: string, hints: UserAgentHints): string {
  const platform = (hints.platform ?? '').toLowerCase();
  if (platform) {
    if (platform.includes('android')) return 'android';
    if (platform.includes('windows')) return 'windows';
    if (platform.includes('chrome os') || platform.includes('chromeos')) return 'chromeos';
    if (platform.includes('mac')) return (hints.touchPoints ?? 0) > 1 ? 'ios' : 'macos';
    if (platform.includes('linux')) return 'linux';
    if (platform.includes('ios')) return 'ios';
  }
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows/.test(ua)) return 'windows';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Mac OS X|Macintosh/.test(ua)) return (hints.touchPoints ?? 0) > 1 ? 'ios' : 'macos';
  if (/Linux|X11/.test(ua)) return 'linux';
  return 'other';
}

function deviceClass(ua: string, os: string, hints: UserAgentHints): DeviceInfo['device'] {
  if (/iPad|Tablet|PlayBook|Silk/.test(ua)) return 'tablet';
  if (os === 'ios' && /Macintosh/.test(ua)) return 'tablet';
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
  if (hints.mobile || /Mobi|iPhone|iPod|Android/.test(ua)) return 'mobile';
  return 'desktop';
}

function browserFamily(ua: string, brands: readonly string[] = []): string {
  const b = brands.map((x) => x.toLowerCase());
  if (b.some((x) => x.includes('edge'))) return 'edge';
  if (b.some((x) => x.includes('opera'))) return 'opera';
  if (b.some((x) => x.includes('brave'))) return 'brave';
  if (b.some((x) => x.includes('samsung'))) return 'samsung';
  if (b.some((x) => x.includes('google chrome') || x === 'chrome')) return 'chrome';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS/.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

/** The browser's own answer, for the running page. */
export function describeDevice(): DeviceInfo {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean; platform?: string; brands?: { brand: string }[] };
  };
  return classifyUserAgent(nav.userAgent ?? '', {
    mobile: nav.userAgentData?.mobile,
    platform: nav.userAgentData?.platform,
    brands: nav.userAgentData?.brands?.map((b) => b.brand),
    touchPoints: nav.maxTouchPoints,
  });
}
