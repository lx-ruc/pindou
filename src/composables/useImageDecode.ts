import type { ImagePixels, PickedImage } from '@/types/pattern'

// 微信小程序的 wx 全局，@dcloudio/types 没声明
declare const wx: any

// 调试用：同步写日志到全局数组
;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
const _t0 = Date.now()
function _log(tag: string, ...args: any[]): void {
  const dt = ((Date.now() - _t0) / 1000).toFixed(2) + 's'
  const line = `[${dt}][${tag}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
  ;(globalThis as any).__pindouLogs.push(line)
  console.log(line)
}

// 压缩到长边 2048，避免低端机 >4096 时 getImageData 静默失败。
async function compressToMaxEdge(tempFilePath: string, maxEdge = 2048): Promise<string> {
  try {
    const res = (await uni.compressImage({
      src: tempFilePath,
      quality: 100,
      compressedWidth: maxEdge,
    } as any)) as any
    _log('decode', 'compress ok →', res?.tempFilePath)
    return res?.tempFilePath || tempFilePath
  } catch (e) {
    _log('decode', 'compress failed, use original', (e as Error)?.message)
    return tempFilePath
  }
}

// 用 offscreen canvas 装载图像并读像素。
async function decodePixels(tempFilePath: string): Promise<ImagePixels> {
  const compressed = await compressToMaxEdge(tempFilePath, 2048)
  _log('decode', 'start decode', compressed)

  // #ifdef MP-WEIXIN
  if (typeof wx?.createOffscreenCanvas !== 'function') {
    throw new Error('wx.createOffscreenCanvas not available')
  }
  const off = wx.createOffscreenCanvas({ type: '2d', width: 2048, height: 2048 })
  const ctx = off.getContext('2d')
  const img = off.createImage()

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      _log('decode', 'image loaded', img.width, '×', img.height)
      resolve()
    }
    img.onerror = (e: any) => {
      _log('decode', 'image onerror', JSON.stringify(e))
      reject(new Error('image load error: ' + JSON.stringify(e)))
    }
    // 超时保护：某些情况下 onload/onerror 都不触发
    setTimeout(() => reject(new Error('image load timeout (5s)')), 5000)
    img.src = compressed
  })

  const W = img.width
  const H = img.height
  ctx.clearRect(0, 0, 2048, 2048)
  ctx.drawImage(img, 0, 0, W, H)
  const imageData = ctx.getImageData(0, 0, W, H)
  _log('decode', 'got pixels', imageData.data.length, 'bytes')
  return {
    data: new Uint8ClampedArray(imageData.data),
    width: W,
    height: H,
  }
  // #endif

  // #ifndef MP-WEIXIN
  // H5 fallback
  const res = await fetch(compressed)
  const blob = await res.blob()
  const bmp = await createImageBitmap(blob)
  const sc = document.createElement('canvas')
  sc.width = bmp.width
  sc.height = bmp.height
  const sctx = sc.getContext('2d')!
  sctx.drawImage(bmp, 0, 0)
  const { data } = sctx.getImageData(0, 0, bmp.width, bmp.height)
  return { data: new Uint8ClampedArray(data), width: bmp.width, height: bmp.height }
  // #endif
}

export async function pickAndDecodeImage(): Promise<PickedImage | null> {
  _log('decode', 'chooseImage start')
  // chooseImage 在 H5 和 mp-weixin 两端都支持；chooseMedia 仅 mp 端有
  const chooseRes = (await uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    sizeType: ['original', 'compressed'],
  } as any)) as any
  _log('decode', 'chooseImage result', JSON.stringify(chooseRes))

  // chooseImage 返回 tempFilePaths: string[] 和 tempFiles: [{path, size}]
  const tempFilePath = chooseRes?.tempFilePaths?.[0] || chooseRes?.tempFiles?.[0]?.tempFilePath
  if (!tempFilePath) {
    _log('decode', 'no tempFilePath in result')
    return null
  }

  const pixels = await decodePixels(tempFilePath)
  _log('decode', 'done', pixels.width, '×', pixels.height)
  return { tempFilePath, pixels }
}
