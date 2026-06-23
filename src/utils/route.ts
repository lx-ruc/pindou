import type { Cell, Hex } from '@/types/pattern'

const ZONE = 10

export function zoneLabel(r: number, c: number): string {
  return String.fromCharCode(65 + (Math.floor(c / ZONE) % 26)) + (Math.floor(r / ZONE) + 1)
}

// 按 hex 频次降序；返回 [hex, count][] 列表
export function computeCounts(hexGrid: Hex[][]): [Hex, number][] {
  const counts = new Map<Hex, number>()
  for (const row of hexGrid) {
    for (const hex of row) {
      counts.set(hex, (counts.get(hex) || 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

// 拼装顺序：按 sortedItems 的颜色顺序，每种颜色一行行扫描；偶数行反向（蛇形）。
// 这样同色豆连续拼，减少换色次数。
export function computeRoute(hexGrid: Hex[][], rows: number, cols: number, sortedItems: [Hex, number][]): Cell[] {
  const order: Cell[] = []
  for (const [hex] of sortedItems) {
    for (let r = 0; r < rows; r++) {
      const cells: Cell[] = []
      for (let c = 0; c < cols; c++) {
        if (hexGrid[r][c] === hex) cells.push([r, c])
      }
      if (cells.length === 0) continue
      if (r % 2 === 1) cells.reverse()
      for (const rc of cells) order.push(rc)
    }
  }
  return order
}

export function findNextUnplaced(routeOrder: Cell[], placed: boolean[][]): number {
  for (let i = 0; i < routeOrder.length; i++) {
    const [r, c] = routeOrder[i]
    if (!placed[r][c]) return i
  }
  return -1
}

export { ZONE }
