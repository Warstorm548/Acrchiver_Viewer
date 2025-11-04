import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { defaultConfig } from '@opencloud-eu/extension-sdk'

export default defineConfig({
  ...defaultConfig,
  plugins: [vue()],
  build: {
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  },
  optimizeDeps: {
    include: ['libarchive.js']
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
})
