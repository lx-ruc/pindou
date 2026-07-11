// 微信云开发：内容安全检测初始化 + 错误类型
// envID 通过 .env.local 的 VITE_CLOUD_ENV_ID 注入（不入库；envID 无 secret key，泄露风险低）

declare const wx: any

export const CLOUD_ENV_ID: string = import.meta.env.VITE_CLOUD_ENV_ID || ''

/** 图片内容不合规（检测命中 review/block）—— 上层据此类区分 toast 文案 */
export class UnsafeImageError extends Error {
  constructor(msg = 'image unsafe') {
    super(msg)
    this.name = 'UnsafeImageError'
  }
}

/**
 * 初始化云开发（MP-WEIXIN 专属；H5 noop）。
 * 失败仅 warn，不阻塞应用启动 —— 检测逻辑会 fail-open 放行。
 */
export function ensureCloudInit(): boolean {
  // #ifdef MP-WEIXIN
  if (!CLOUD_ENV_ID) {
    console.warn('[cloud] no env id, skip init')
    return false
  }
  try {
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    return true
  } catch (e) {
    console.warn('[cloud] init failed', e)
    return false
  }
  // #endif
  // #ifndef MP-WEIXIN
  return false
  // #endif
}
