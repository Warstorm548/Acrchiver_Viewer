# Two-App Split

The repo holds two independent implementations. They share no code, no build, and no state.

## Side by side

| Aspect | LEGACY app | VUE app |
|--------|-----------|---------|
| Entry | `src/index.js` (`ArchiveViewerApp` class) | `src/index.ts` (`defineWebApplication`) |
| Host registration | `OC.Plugins.register('files', { attach })` | Returns `appInfo`, `extensions`, `routes`, `translations` |
| Host API style | Nextcloud/ownCloud-classic global `OC` | OpenCloud Web (`@opencloud-eu/web-pkg`) |
| UI | Hand-built DOM strings via `innerHTML` (`UIManager.js`) | Vue 3 SFC with OpenCloud design-system components (`oc-*`) |
| Archive engine | Own ZIP/TAR parsing + `fflate`, HTTP Range requests | `libarchive.js` (WASM in a Web Worker) |
| File access | `fetch(fileUrl)` with `Authorization: context.getAuthToken()` | `clientService.webdav.getFileContents(resource)` |
| Build | webpack + Babel → `dist/app.js` (UMD) | Vite + `@vitejs/plugin-vue` (no script) |
| Styles | `src/styles/main.css` | `<style scoped>` in each `.vue` |
| i18n | none (hard-coded English) | `src/translations.json` + `$gettext` |
| Tests | none | `tests/` (vitest) |
| Formats attempted | zip, tar(.gz), gz; others throw | whatever libarchive.js supports |

## Which one OpenCloud can load

OpenCloud Web loads extensions written against `@opencloud-eu/web-pkg` using
`defineWebApplication` — that is the **Vue app**. The legacy app's `OC.Plugins.register`
targets the classic Nextcloud/ownCloud 10 server-rendered Files app; OpenCloud Web does not
provide a global `OC`, so `src/index.js` would load and do nothing (it only registers if
`typeof OC !== 'undefined'`, `src/index.js:352`).

Also note `fileList.registerTabView(new ArchiveViewerApp())` passes an object that does not
implement the tab-view interface the classic Files app expects, so even there it would not work
as written.

## Legacy app flow (for reference)

```
OC.Plugins 'files' attach
  -> new ArchiveViewerApp()   (index.js)
  -> init(context)            UIManager.init() renders shell into #app-content
  -> loadArchiveMetadata()    detectArchiveType(filename) -> StreamProcessor.extractMetadata
  -> UIManager.displayArchiveContents -> buildFileTree -> displayDirectory (innerHTML table)
  row actions -> app.viewFile / downloadFile / UIManager.showFileEditor -> StreamProcessor.extractSingleFile
```
Directory clicks set `currentPath` then call `loadArchiveMetadata()` again, i.e. they refetch
and reparse the whole archive metadata on every navigation.

## Vue app flow

```
user opens archive in OpenCloud Files
  -> extension handler (index.ts) -> route 'archive-viewer' with query.fileId
  -> ArchiveViewer.vue onMounted -> loadArchive()
       resourcesStore.getResource(fileId)
       size > 1GB ? loadArchiveStreaming : loadArchiveStandard
       -> Archive.open(File) -> getFilesArray() -> processArchiveEntries
  -> displayedFiles computed (dir filter + search + sort) renders table
  row actions -> previewFile / downloadFile -> Archive.extract(entry.file)
```
Details: [vue-app](../source/vue-app.md), [opencloud-integration](opencloud-integration.md).

## Recommendation (pending user decision)

Keep the Vue app; delete `src/index.js`, `src/lib/`, `src/styles/main.css`, root `index.html`,
`webpack.config.js` and the webpack/Babel devDependencies. Port anything worth keeping from the
legacy app first — the only parts with real value are the Range-request ZIP central-directory
reader (`StreamProcessor.extractZipMetadata`) as a starting point for large-file support, and
`ArchiveWriter.createTar/createZip` for archive creation.
