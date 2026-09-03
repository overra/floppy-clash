/** Helpers for PLAN §6 GPU e2e: copy a crop of the WebGPU canvas and count pixels. */

export const READBACK_W = 96;
export const READBACK_H = 96;
export const PIXEL_BYTES = 4;

export type FramebufferReadback = {
  source: 'webgpu-copy' | 'canvas-2d' | 'unavailable';
  /** How the GPU bytes were produced. Swapchain copy is preferred; offscreen replay avoids a dead present device. */
  via?: 'swapchain' | 'offscreen-replay';
  width: number;
  height: number;
  colored: number;
  samples: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }>;
  error: string;
};

export function alignBytesPerRow(unaligned: number): number {
  return Math.ceil(unaligned / 256) * 256;
}

export function emptyReadback(
  source: FramebufferReadback['source'],
  error: string,
): FramebufferReadback {
  return { source, width: 0, height: 0, colored: 0, samples: [], error, via: undefined };
}

export function countColoredPixels(
  bytes: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
): number {
  let n = 0;
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const i = row + x * PIXEL_BYTES;
      const r = bytes[i] ?? 0;
      const g = bytes[i + 1] ?? 0;
      const b = bytes[i + 2] ?? 0;
      const a = bytes[i + 3] ?? 0;
      if (r > 8 || g > 8 || b > 8 || a > 8) n++;
    }
  }
  return n;
}

export function samplePixels(
  bytes: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
): FramebufferReadback['samples'] {
  const pts: Array<[number, number]> = [
    [0, 0],
    [width >> 1, height >> 1],
    [width - 1, height - 1],
    [8, 8],
    [width - 9, height - 9],
  ];
  return pts.map(([x, y]) => {
    const i = y * bytesPerRow + x * PIXEL_BYTES;
    return {
      x,
      y,
      r: bytes[i] ?? 0,
      g: bytes[i + 1] ?? 0,
      b: bytes[i + 2] ?? 0,
      a: bytes[i + 3] ?? 0,
    };
  });
}

export function inspectMappedRgba(
  bytes: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  source: FramebufferReadback['source'],
  via?: FramebufferReadback['via'],
): FramebufferReadback {
  return {
    source,
    via,
    width,
    height,
    colored: countColoredPixels(bytes, width, height, bytesPerRow),
    samples: samplePixels(bytes, width, height, bytesPerRow),
    error: '',
  };
}
