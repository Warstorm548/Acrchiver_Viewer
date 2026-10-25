import '@opencloud-eu/extension-sdk/tailwind.css'
import { AppWrapperRoute, defineWebApplication } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import App from './App.vue'
import translations from '../l10n/translations.json'

const applicationId = 'archive-viewer'

// File extensions opened by this app. OpenCloud treats 'tar.gz', 'tar.bz2' and 'tar.xz' as single
// extensions (web-client extractExtensionFromFile), so they must be listed separately from 'gz' etc.
const supportedExtensions = [
  'zip',
  'tar',
  'tar.gz',
  'tar.bz2',
  'tar.xz',
  'tgz',
  'tbz2',
  'tbz',
  'gz',
  'bz2',
  'xz',
  '7z',
  'rar'
]

export default defineWebApplication({
  setup() {
    const { $gettext } = useGettext()

    const routes = [
      {
        name: applicationId,
        path: '/:driveAliasAndItem(.*)?',
        component: AppWrapperRoute(App, {
          applicationId
        }),
        meta: {
          authContext: 'hybrid',
          title: $gettext('Archive Viewer'),
          patchCleanPath: true
        }
      }
    ]

    const appInfo = {
      name: $gettext('Archive Viewer'),
      id: applicationId,
      icon: 'file-zip',
      defaultExtension: 'zip',
      extensions: supportedExtensions.map((extension) => ({
        extension,
        routeName: applicationId
      }))
    }

    return {
      appInfo,
      routes,
      translations
    }
  }
})
