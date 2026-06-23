import { describe, it, expect } from 'vitest';
import { pixelize } from '@/utils/pixelize';
import { hexToRgb } from '@/utils/color';
import type { ImagePixels } from '@/types/pattern';

// 100×100，左红(x<55)右蓝，分界落在 cell 5 中间（制造跨格）
function redBlueSplit(): ImagePixels {
  const W = 100;
  const H = 100;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (x < 55) {
        data[i] = 255;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 255;
      }
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

describe('pixelize (主导色，非均值)', () => {
  it('grid dims follow longerSide + aspect', () => {
    expect(pixelize(redBlueSplit(), 10, 1)).toMatchObject({ rows: 10, cols: 10 });
    expect(pixelize(redBlueSplit(), 50, 2)).toMatchObject({ cols: 50, rows: 25 });
  });

  it('每格取主导色：左红右蓝，跨格边界不产生紫色均值', () => {
    const { hexGrid } = pixelize(redBlueSplit(), 10, 1);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const [R, , B] = hexToRgb(hexGrid[r][c]);
        const redish = R > 150 && B < 100;
        const bluish = B > 150 && R < 100;
        expect(redish || bluish, `cell (${r},${c}) = [${R},_,${B}] should not be gray/purple`).toBe(true);
      }
    }
  });
});
