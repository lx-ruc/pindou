import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { resolve } from 'path'

export default defineConfig({
  // GitHub Pages 项目站点需 /仓库名/ 前缀；绑定自定义域名后改回 '/'
  // 由 CI 注入 PAGES_BASE，本地开发默认 '/'
  base: process.env.PAGES_BASE || '/',
  plugins: [uni()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
