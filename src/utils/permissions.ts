// 保存到相册 —— 标准微信权限流程：getSetting → authorize/openSetting → saveImageToPhotosAlbum。
// 真机首次必须手动 authorize 才弹权限框；直接调 saveImageToPhotosAlbum 往往不弹框、静默失败。

// 诊断日志：推全局数组 + console（仿 useImageDecode.ts），方便真机定位
function _log(tag: string, ...args: any[]): void {
  const line = `[album][${tag}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`
  ;(globalThis as any).__pindouLogs = (globalThis as any).__pindouLogs || []
  ;(globalThis as any).__pindouLogs.push(line)
  console.log(line)
}

// scope.writePhotosAlbum 授权状态：true=已授权 / false=曾拒绝 / undefined=未授权过
async function getAlbumAuth(): Promise<boolean | undefined> {
  try {
    const res = (await uni.getSetting()) as any
    const auth = res?.authSetting?.['scope.writePhotosAlbum']
    _log('getSetting', 'scope.writePhotosAlbum =', auth)
    return auth
  } catch (e) {
    _log('getSetting error', (e as any)?.errMsg || e)
    return undefined
  }
}

// 请求相册授权：未授权过→authorize 弹框；曾拒绝→showModal 引导 openSetting。
// 返回是否最终拿到授权。
async function ensureAlbumAuth(): Promise<boolean> {
  const auth = await getAlbumAuth()
  if (auth === true) return true

  if (auth === undefined) {
    // 未授权过：authorize 触发系统授权框
    try {
      await uni.authorize({ scope: 'scope.writePhotosAlbum' } as any)
      _log('authorize', 'granted')
      return true
    } catch (e) {
      _log('authorize', 'denied/failed', (e as any)?.errMsg || e)
      return false
    }
  }

  // auth === false：曾明确拒绝 → 引导去设置
  _log('authorize', 'previously denied, guide to openSetting')
  const c = (await uni.showModal({
    title: '需要相册权限',
    content: '请在设置中开启“保存到相册”权限',
    confirmText: '去设置',
  } as any)) as any
  if (c?.confirm) {
    try {
      const s = (await uni.openSetting()) as any
      const ok = s?.authSetting?.['scope.writePhotosAlbum'] === true
      _log('openSetting', 'granted =', ok)
      return ok
    } catch {
      _log('openSetting', 'closed without granting')
      return false
    }
  }
  return false
}

// 保存图片到系统相册。成功返回 true（由调用方显示成功 toast）；失败返回 false（内部已 toast/modal）。
export async function saveImageToAlbum(filePath: string): Promise<boolean> {
  _log('save', 'start, filePath =', filePath)
  const granted = await ensureAlbumAuth()
  if (!granted) {
    _log('save', 'aborted: no album permission')
    return false
  }
  try {
    await uni.saveImageToPhotosAlbum({ filePath } as any)
    _log('save', 'OK')
    return true
  } catch (e: any) {
    const msg = e?.errMsg || ''
    _log('save', 'FAIL', msg, e)
    // 兜底：errMsg 暗示权限问题（真机常见 permission/scope 字样），引导去设置
    if (/auth|denied|permission|scope/i.test(msg)) {
      const c = (await uni.showModal({
        title: '需要相册权限',
        content: '请在设置中开启“保存到相册”权限',
        confirmText: '去设置',
      } as any)) as any
      if (c?.confirm) {
        try {
          await uni.openSetting()
        } catch {
          /* 用户直接关了设置 */
        }
      }
    } else {
      uni.showToast({ title: '保存失败', icon: 'none' })
    }
    return false
  }
}
