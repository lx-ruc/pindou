// 保存到相册，带权限兜底。
export async function saveImageToAlbum(filePath: string): Promise<boolean> {
  try {
    await uni.saveImageToPhotosAlbum({ filePath } as any)
    uni.showToast({ title: '已保存到相册', icon: 'success' })
    return true
  } catch (e: any) {
    const msg = e?.errMsg || ''
    if (/auth deny|authorize|auth denied|authD/i.test(msg)) {
      const c = (await uni.showModal({
        title: '需要相册权限',
        content: '请在设置中开启"保存到相册"',
        confirmText: '去设置',
      } as any)) as any
      if (c?.confirm) {
        try {
          await uni.openSetting()
        } catch {
          /* 用户直接关了设置 */
        }
      }
      return false
    }
    uni.showToast({ title: '保存失败', icon: 'none' })
    return false
  }
}
