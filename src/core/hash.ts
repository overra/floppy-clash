/** FNV-1a 32-bit, stable across JS engines for the same byte stream. */
export function fnv1a(input: string | number[]): number {
  let hash = 0x811c9dc5;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      const n = input[i]!;
      hash ^= n & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (n >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

export function hashToHex(hash: number): string {
  return hash.toString(16).padStart(8, '0');
}

export function quantize(value: number, scale = 1000): number {
  return Math.round(value * scale);
}
