import { describe, it, expect } from 'vitest';
import { computeCounts, computeRoute, findNextUnplaced, zoneLabel, ZONE } from '@/utils/route';

describe('computeCounts + computeRoute (按色批量 + 蛇形)', () => {
  it('orders by frequency desc, then serpentine within color', () => {
    const grid = [
      ['红', '红'],
      ['红', '蓝'],
    ];
    const items = computeCounts(grid);
    expect(items).toEqual([['红', 3], ['蓝', 1]]);
    expect(computeRoute(grid, 2, 2, items)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0], // 红（用量 3）先排完
      [1, 1], // 蓝（用量 1）最后
    ]);
  });

  it('serpentine: odd rows go right-to-left', () => {
    const grid = [
      ['X', 'X', 'X'],
      ['X', 'X', 'X'],
    ];
    const items = computeCounts(grid);
    expect(computeRoute(grid, 2, 3, items)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 1],
      [1, 0],
    ]);
  });
});

describe('findNextUnplaced', () => {
  it('finds the first unplaced cell', () => {
    expect(
      findNextUnplaced(
        [
          [0, 0],
          [0, 1],
          [1, 0],
        ],
        [
          [true, true],
          [false],
        ],
      ),
    ).toBe(2);
  });

  it('returns -1 when all placed', () => {
    expect(findNextUnplaced([[0, 0]], [[true]])).toBe(-1);
  });
});

describe('zoneLabel (分区坐标)', () => {
  it('A1 / C1 / A3 / E5', () => {
    expect(zoneLabel(0, 0)).toBe('A1');
    expect(zoneLabel(0, 25)).toBe('C1');
    expect(zoneLabel(25, 0)).toBe('A3');
    expect(zoneLabel(49, 49)).toBe('E5');
  });

  it('ZONE = 10', () => {
    expect(ZONE).toBe(10);
  });
});
