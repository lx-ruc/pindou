interface Canvas2dHandle {
  canvas: any
  ctx: CanvasRenderingContext2D
  dpr: number
}

// 统一的 Canvas 2D node 获取封装。
// 注意：调用方必须在组件实例上下文里（onMounted / 方法内），否则 createSelectorQuery 找不到节点。
export function getCanvas2d(canvasId: string, scope?: any): Promise<Canvas2dHandle> {
  return new Promise((resolve, reject) => {
    const query = uni.createSelectorQuery().in(scope)
    query
      .select('#' + canvasId)
      .fields({ node: true, size: true } as any, (res: any) => {
        if (!res || !res.node) {
          reject(new Error('canvas node not found: #' + canvasId))
          return
        }
        const canvas = res.node
        const ctx = canvas.getContext('2d')
        const dpr = uni.getSystemInfoSync().pixelRatio
        resolve({ canvas, ctx, dpr })
      })
      .exec()
  })
}

// 调整 canvas 尺寸到指定 CSS px，并应用 dpr scale。
// 之后所有绘制按 CSS px 坐标系走。
export function setupCanvasSize(
  handle: Canvas2dHandle,
  widthCss: number,
  heightCss: number
): void {
  const { canvas, ctx, dpr } = handle
  canvas.width = Math.max(1, Math.floor(widthCss * dpr))
  canvas.height = Math.max(1, Math.floor(heightCss * dpr))
  // #ifdef MP-WEIXIN
  // mp-weixin canvas node 支持 style 属性
  if (canvas.style) {
    canvas.style.width = widthCss + 'px'
    canvas.style.height = heightCss + 'px'
  }
  // #endif
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
}
