import { describe, it, expect } from 'vitest';
import { nearestHex, hexToRgb } from '@/utils/color';
import { PALETTE_HEX } from '@/utils/palette';

describe('nearestHex (32³ LUT, O(1))', () => {
  it('always returns a valid palette entry', () => {
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [255, 255, 255],
      [250, 244, 200],
      [128, 64, 200],
    ];
    for (const [r, g, b] of samples) {
      expect(PALETTE_HEX).toContain(nearestHex(r, g, b));
    }
  });

  it('distant inputs map to different palette entries', () => {
    expect(nearestHex(255, 0, 0)).not.toBe(nearestHex(0, 0, 255));
  });

  it('hexToRgb round-trips', () => {
    expect(hexToRgb('#FAF4C8')).toEqual([0xfa, 0xf4, 0xc8]);
  });
});
