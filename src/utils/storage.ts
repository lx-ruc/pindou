/**
 * 跨端 KV 存储：H5 用 localStorage，小程序用 uni.*StorageSync。
 * 条件编译注释必须独占行（uni-app 预处理要求），仿 pages/pattern/index.vue。
 * 同步 API —— 快照 <50KB，无需异步队列。
 */

export function getKV(key: string): string | null {
  // #ifdef H5
  return localStorage.getItem(key)
  // #endif
  // #ifndef H5
  // uni.getStorageSync 无值返回 ''，归一为 null
  const v = uni.getStorageSync(key)
  return v === '' || v === undefined ? null : (v as string)
  // #endif
}

export function setKV(key: string, value: string): void {
  // #ifdef H5
  localStorage.setItem(key, value)
  // #endif
  // #ifndef H5
  uni.setStorageSync(key, value)
  // #endif
}

export function removeKV(key: string): void {
  // #ifdef H5
  localStorage.removeItem(key)
  // #endif
  // #ifndef H5
  uni.removeStorageSync(key)
  // #endif
}
