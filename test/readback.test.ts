import { describe, expect, it } from 'vitest';
import {
  alignBytesPerRow,
  countColoredPixels,
  emptyReadback,
  inspectMappedRgba,
  PIXEL_BYTES,
  READBACK_H,
  READBACK_W,
  samplePixels,
} from '../src/render/gpu/readback';

describe('PLAN §6 framebuffer readback helpers', () => {
  it('aligns bytesPerRow to 256 for copyTextureToBuffer', () => {
    expect(alignBytesPerRow(READBACK_W * PIXEL_BYTES) % 256).toBe(0);
    expect(alignBytesPerRow(1)).toBe(256);
    expect(alignBytesPerRow(256)).toBe(256);
    expect(alignBytesPerRow(257)).toBe(512);
  });

  it('counts written pixels and samples corners plus center', () => {
    const w = 4;
    const h = 4;
    const row = w * PIXEL_BYTES;
    const bytes = new Uint8Array(h * row);
    bytes[0] = 17;
    bytes[1] = 19;
    bytes[2] = 24;
    bytes[3] = 255;
    const mid = 2 * row + 2 * PIXEL_BYTES;
    bytes[mid] = 242;
    bytes[mid + 1] = 193;
    bytes[mid + 2] = 78;
    bytes[mid + 3] = 255;
    expect(countColoredPixels(bytes, w, h, row)).toBe(2);
    const samples = samplePixels(bytes, w, h, row);
    expect(samples[0]).toMatchObject({ x: 0, y: 0, r: 17, g: 19, b: 24 });
    expect(samples[1]).toMatchObject({ x: 2, y: 2, r: 242 });
    const inspected = inspectMappedRgba(bytes, w, h, row, 'webgpu-copy', 'offscreen-replay');
    expect(inspected.source).toBe('webgpu-copy');
    expect(inspected.via).toBe('offscreen-replay');
    expect(inspected.colored).toBe(2);
    expect(inspected.error).toBe('');
  });

  it('does not invent pixels when the copy path is unavailable', () => {
    const miss = emptyReadback('unavailable', 'configure-rejected-copy-src');
    expect(miss.source).toBe('unavailable');
    expect(miss.colored).toBe(0);
    expect(miss.samples).toEqual([]);
    expect(miss.error).toContain('copy-src');
    expect(READBACK_W).toBe(96);
    expect(READBACK_H).toBe(96);
  });
});
