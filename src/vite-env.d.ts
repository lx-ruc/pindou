/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_ENV_ID: string
}

// uni-app 编译期注入 process.env.NODE_ENV（生产/开发判断），vue-tsc 需类型声明
declare const process: {
  env: { NODE_ENV: 'development' | 'production' | string }
}
