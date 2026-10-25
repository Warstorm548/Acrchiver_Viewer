import { defineConfig } from '@opencloud-eu/extension-sdk'

export default defineConfig({
  name: 'archive-viewer',
  test: {
    // old code parked for porting; not part of the app (see reference/README.md)
    exclude: ['reference/**']
  }
})
