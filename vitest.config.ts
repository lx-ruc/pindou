import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// 独立配置：vitest 优先用本文件，不加载 vite.config.ts（避免 uni 插件干扰测试）。
// 只测 src/utils 的纯函数（palette/color/pixelize/route），不涉及 uni 平台 API。
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
