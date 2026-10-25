import { vi } from 'vitest'

// Mock libarchive.js
vi.mock('libarchive.js/main.js', () => ({
  Archive: {
    init: vi.fn(),
    open: vi.fn(),
    extract: vi.fn(),
    write: vi.fn()
  },
  ArchiveFormat: {
    ZIP: 'zip',
    TAR: 'tar'
  },
  ArchiveCompression: {
    NONE: 'none',
    GZIP: 'gzip'
  }
}))

// Mock OpenCloud Web SDK
vi.mock('@opencloud-eu/web-pkg', () => ({
  defineWebApplication: vi.fn((config) => config),
  useClientService: vi.fn(() => ({
    webdav: {
      getFileContents: vi.fn(),
      getFileInfo: vi.fn()
    }
  })),
  useResourcesStore: vi.fn(() => ({
    getResource: vi.fn(),
    resources: []
  })),
  useLoadingService: vi.fn(() => ({
    addTask: vi.fn(),
    removeTask: vi.fn(),
    isLoading: false
  })),
  $gettext: vi.fn((text) => text)
}))

// Mock router
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    query: { fileId: 'test-file-id' },
    params: {}
  })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn()
  }))
}))

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))
