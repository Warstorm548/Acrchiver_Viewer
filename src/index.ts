import { AppWrapperRoute, defineWebApplication } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'
import App from './App.vue'
import translations from '../l10n/translations.json'

const applicationId = 'archive-viewer'

// File extensions opened by this app. Compound extensions (e.g. tar.gz) are not listed yet;
// whether OpenCloud matches them is an open question (see docs/architecture/opencloud-v8-compatibility.md).
const supportedExtensions = ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar']

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
