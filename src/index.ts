import '@opencloud-eu/extension-sdk/tailwind.css'
import { AppWrapperRoute, defineWebApplication, useCapabilityStore } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import App from './App.vue'
import { checkCompatibility, waitForProductVersion } from './compatibility'
import translations from '../l10n/translations.json'

const applicationId = 'archive-viewer'

// OpenCloud awaits this module before calling setup(), so the version is known there.
const productVersion = await waitForProductVersion(useCapabilityStore())

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
  'txz',
  'tlz',
  'gz',
  'bz2',
  'xz',
  'lzma',
  '7z',
  'rar'
]

export default defineWebApplication({
  setup({ applicationConfig }) {
    // Throwing here makes OpenCloud skip the app (registerAppLoadingFailure): no menu entry, no
    // file types, no route.
    const compatibility = checkCompatibility({ productVersion, config: applicationConfig })
    if (!compatibility.supported) {
      if (!compatibility.overridden) {
        throw new Error(compatibility.message)
      }
      console.warn(compatibility.message)
    }

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
