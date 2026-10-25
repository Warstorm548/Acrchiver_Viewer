import { readFileSync } from 'node:fs'
import { defineConfig } from '@opencloud-eu/extension-sdk'

// package.json is the single source of the version (SemVer, see CHANGELOG.md). The SDK already
// copies it into dist/manifest.json; the banner also stamps it on every compiled JS file.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  name: 'archive-viewer',
  build: {
    rollupOptions: {
      output: {
        postBanner: `/*! archive-viewer v${version} */`
      }
    }
  }
})
