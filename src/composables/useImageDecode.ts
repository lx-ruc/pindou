import type { ImagePixels, PickedImage } from '@/types/pattern'
import { UnsafeImageError, CLOUD_ENV_ID } from '@/utils/cloud'

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

// 压缩到「长边」≤ maxEdge。
// 旧实现误把 compressedWidth 当长边——只压宽，竖向拍照图（3000×4000）压完变 2048×2731，
// 高度仍 > maxEdge，下游 offscreen canvas（按图实际尺寸创建）会超大、甚至 getImageData fail。
// 正确做法：先 getImageInfo 拿宽高，按长边算缩放比，再换算成 compressedWidth。
async function compressToMaxEdge(tempFilePath: string, maxEdge = 2048): Promise<string> {
  try {
    const info = (await uni.getImageInfo({ src: tempFilePath })) as any
    const srcW = info?.width || 0
    const srcH = info?.height || 0
    const longer = Math.max(srcW, srcH)
    if (longer <= 0 || longer <= maxEdge) {
      _log('decode', 'no compress needed', srcW, '×', srcH)
      return tempFilePath
    }
    const scale = maxEdge / longer
    const targetWidth = Math.max(1, Math.round(srcW * scale))
    const res = (await uni.compressImage({
      src: tempFilePath,
      quality: 100,
      compressedWidth: targetWidth,
    } as any)) as any
    _log('decode', 'compress ok', srcW, '×', srcH, '→ long-edge', maxEdge, '(w', targetWidth, ') →', res?.tempFilePath)
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
  // 先用占位尺寸创建 canvas（仅为拿 createImage 工厂），图加载后再按实际 W×H 调整 canvas 尺寸。
  // 旧实现固定 2048×2048：竖向拍照图压缩后高度仍 > 2048 时，drawImage 被裁、getImageData 越界
  // 直接 fail —— 拍照上传"不生成像素图"的根因。
  const off = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
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
  if (W <= 0 || H <= 0) {
    throw new Error('decoded image has zero dimension')
  }
  // 关键：canvas 尺寸必须 == 图片尺寸，否则 drawImage 被裁 / getImageData 越界 fail。
  // 赋 width/height 会清空 canvas 并重置 context，因此必须在其后重新 getContext。
  off.width = W
  off.height = H
  const ctx = off.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)
  const imageData = ctx.getImageData(0, 0, W, H)
  _log('decode', 'got pixels', imageData.data.length, 'bytes', 'canvas', W, '×', H)
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

// 图片内容安全检测：uploadFile → callFunction('checkImage') → 判 suggest
// review/block → 抛 UnsafeImageError（上层提示更换）；API 异常 → fail-open 放行
// MP-WEIXIN 走云函数；H5 noop（审核只查小程序）
async function checkImageSafe(tempFilePath: string): Promise<void> {
  // #ifdef MP-WEIXIN
  if (!CLOUD_ENV_ID) {
    _log('safety', 'no env, fail-open')
    return
  }
  let fileID: string | null = null
  try {
    const up = await wx.cloud.uploadFile({
      cloudPath: `check/${Date.now()}.jpg`,
      filePath: tempFilePath,
    })
    fileID = up.fileID
    const r = await wx.cloud.callFunction({ name: 'checkImage', data: { fileID } })
    const res = (r && r.result) || {}
    _log('safety', 'result', JSON.stringify(res))
    if (res.suggest === 'review' || res.suggest === 'block') {
      throw new UnsafeImageError()
    }
    // pass 或 ok:false（fail-open）→ 放行
  } catch (e: any) {
    if (e && e.name === 'UnsafeImageError') throw e
    _log('safety', 'api error, fail-open', (e && e.message) || e)
  } finally {
    if (fileID) wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
  }
  // #endif
  // #ifndef MP-WEIXIN
  void tempFilePath // H5 noop —— 审核只查小程序
  // #endif
}

// 仅选图，返回临时路径（null = 用户取消）。拆出来让调用方在选图成功后、
// 解码前先清旧画布 + 显示 loading，避免"换图时旧像素图还在"的错觉。
export async function chooseImageTemp(): Promise<string | null> {
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
  return tempFilePath
}

// 内容安全检测 + 像素解码（选图后的耗时阶段）
export async function decodeImage(tempFilePath: string): Promise<ImagePixels> {
  await checkImageSafe(tempFilePath)
  const pixels = await decodePixels(tempFilePath)
  _log('decode', 'done', pixels.width, '×', pixels.height)
  return pixels
}

// 便捷组合：选图 + 解码一步到位（取消选图返回 null）
export async function pickAndDecodeImage(): Promise<PickedImage | null> {
  const tempFilePath = await chooseImageTemp()
  if (!tempFilePath) return null
  const pixels = await decodeImage(tempFilePath)
  return { tempFilePath, pixels }
}
