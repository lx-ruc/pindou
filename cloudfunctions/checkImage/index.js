// 图片内容安全检测云函数：包装微信 security.imgSecCheck
// 流程：前端 wx.cloud.uploadFile(tempFilePath→fileID) → callFunction('checkImage', {fileID})
//       → 这里 cloud.downloadFile + cloud.openapi.security.imgSecCheck
// 返回 { ok, suggest }：suggest = pass 放行；review/block 拦截；接口异常 fail-open 放行
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { fileID } = event
  console.log('[checkImage] marker begin', { hasFileID: !!fileID })
  if (!fileID) {
    return { ok: false, suggest: 'pass', reason: 'no-fileID fail-open' }
  }
  try {
    const dl = await cloud.downloadFile({ fileID })
    const res = await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/jpeg', value: dl.fileContent }
    })
    // res.suggest: pass / review / block；res.label: 命中标签（20002 色情 / 20006 涉暴 等）
    console.log('[checkImage] marker result', res && res.suggest, res && res.label)
    return { ok: true, suggest: (res && res.suggest) || 'pass', label: res && res.label }
  } catch (e) {
    // errCode 87014 = 内容违规（旧版以抛错形式返回）；其余 = 接口异常 → fail-open
    const isUnsafe = e && e.errCode === 87014
    console.log('[checkImage] marker error', e && e.errCode, e && e.errMsg)
    return {
      ok: !isUnsafe,
      suggest: isUnsafe ? 'block' : 'pass',
      errCode: e && e.errCode,
      errMsg: e && e.errMsg
    }
  }
}
