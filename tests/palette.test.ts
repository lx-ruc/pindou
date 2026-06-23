import { describe, it, expect } from 'vitest';
import { PALETTE_HEX, BRAND_CODES, BRANDS, DEFAULT_BRAND, PAL_RGB, LUT } from '@/utils/palette';

describe('palette (5 品牌 × 291 色)', () => {
  it('loads 291 colors', () => {
    expect(PALETTE_HEX.length).toBe(291);
  });

  it('has 5 brands', () => {
    expect(BRANDS).toEqual(['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']);
  });

  it('default brand is MARD (MVP)', () => {
    expect(DEFAULT_BRAND).toBe('MARD');
  });

  it('brand codes are brand-specific (品牌间色号不通用)', () => {
    expect(BRAND_CODES.MARD['#FAF4C8']).toBe('A01');
    expect(BRAND_CODES.COCO['#FAF4C8']).toBe('E02');
    expect(BRAND_CODES['漫漫']['#FAF4C8']).toBe('E2');
    expect(BRAND_CODES['盼盼']['#FAF4C8']).toBe('65');
    expect(BRAND_CODES['咪小窝']['#FAF4C8']).toBe('77');
  });

  it('precomputes PAL_RGB (291×3) and 32³ LUT', () => {
    expect(PAL_RGB.length).toBe(291 * 3);
    expect(LUT.length).toBe(32 * 32 * 32);
  });
});
