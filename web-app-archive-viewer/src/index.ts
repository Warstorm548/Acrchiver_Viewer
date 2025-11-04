import {
  defineWebApplication,
  ApplicationFileExtension,
  useClientService,
  useResourcesStore,
  useLoadingService
} from '@opencloud-eu/web-pkg'
import { Archive } from 'libarchive.js/main.js'
import ArchiveViewer from './views/ArchiveViewer.vue'
import translations from './translations.json'

// Initialize libarchive.js
Archive.init({
  workerUrl: '/archive-viewer/libarchive.worker-bundle.js'
})

export default defineWebApplication({
  setup({ applicationConfig }) {
    const appId = 'archive-viewer'

    // File extension handler for archive files
    const archiveExtension: ApplicationFileExtension = {
      extension: 'zip',
      canBeDefault: true,
      name: 'Archive Viewer',
      mimeType: [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-tar',
        'application/x-gtar',
        'application/x-gzip',
        'application/gzip',
        'application/x-bzip2',
        'application/x-7z-compressed',
        'application/x-rar-compressed',
        'application/vnd.rar',
        'application/x-xz'
      ],
      handler: async ({ space, resource }) => {
        return {
          app: appId,
          route: {
            name: 'archive-viewer',
            params: {
              driveAliasAndItem: space.driveAlias,
              fileId: resource.fileId
            },
            query: {
              fileId: resource.fileId
            }
          }
        }
      }
    }

    // Register extensions for all supported formats
    const extensions = [
      {
        ...archiveExtension,
        extension: 'zip',
        name: 'ZIP Archive'
      },
      {
        ...archiveExtension,
        extension: 'tar',
        name: 'TAR Archive'
      },
      {
        ...archiveExtension,
        extension: 'gz',
        name: 'GZIP Archive'
      },
      {
        ...archiveExtension,
        extension: 'tgz',
        name: 'TGZ Archive'
      },
      {
        ...archiveExtension,
        extension: 'bz2',
        name: 'BZIP2 Archive'
      },
      {
        ...archiveExtension,
        extension: '7z',
        name: '7-Zip Archive'
      },
      {
        ...archiveExtension,
        extension: 'rar',
        name: 'RAR Archive'
      },
      {
        ...archiveExtension,
        extension: 'xz',
        name: 'XZ Archive'
      }
    ]

    const routes = [
      {
        name: 'archive-viewer',
        path: '/:driveAliasAndItem*',
        component: ArchiveViewer,
        meta: {
          title: 'Archive Viewer'
        }
      }
    ]

    return {
      appInfo: {
        name: 'Archive Viewer',
        id: appId,
        icon: 'file-zip',
        color: '#FFA500',
        defaultExtension: 'zip',
        extensions: ['zip', 'tar', 'gz', 'tgz', 'bz2', '7z', 'rar', 'xz']
      },
      extensions,
      routes,
      translations
    }
  }
})
