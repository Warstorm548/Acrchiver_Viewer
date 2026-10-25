# Tests

Only the Vue app has tests. They have **never been run in this checkout** — the required
packages are not declared and there is no `test` script (see
[build-tooling](../tech-stack/build-tooling.md)).

## Config — `vitest.config.ts`

`@vitejs/plugin-vue`, `globals: true`, `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`,
coverage `v8` (text/json/html, excludes `node_modules`, `tests`, `*.d.ts`, `*.config.*`, `dist`),
alias `@` → `src`.

## Setup — `tests/setup.ts`

- `vi.mock('libarchive.js/main.js')`: `Archive.init/open/extract/write` as `vi.fn()`, plus
  `ArchiveFormat` and `ArchiveCompression` stubs.
- `vi.mock('@opencloud-eu/web-pkg')`: `defineWebApplication` (identity), `useClientService`
  (webdav `getFileContents`/`getFileInfo`), `useResourcesStore` (`getResource` returns
  `undefined`), `useLoadingService`, `$gettext`.
- `vi.mock('vue-router')`: `useRoute` → `query.fileId = 'test-file-id'`; `useRouter`.
- `global.ResizeObserver` / `IntersectionObserver` stubs.

Note: `$gettext` is used in templates as a global property, but nothing installs it on the app
(`mount` has no `global.mocks.$gettext`), so rendering will likely warn or throw
(**unverified**).

## Spec — `tests/unit/ArchiveViewer.spec.ts`

Mounts `@/views/ArchiveViewer.vue` with `oc-*` components stubbed, before each test.

| Group | Tests |
|-------|-------|
| Component Rendering | exists; `.loading` shown initially; `.archive-header` present |
| File Operations | `formatSize`; `isTextFile`; `isImageFile`; `getFileIcon` |
| Navigation | `navigateToRoot`; `navigateToPath(1)`; `navigateToDirectory` |
| Selection | `toggleSelection` add/remove; `toggleSelectAll` |
| Sorting | switch field; toggle direction; switch among fields |
| Search | `searchQuery` filters `displayedFiles` |
| Date Formatting | `formatDate` contains year |

### Expected problems (not yet confirmed by a run)

- "selects all files" and "filters files by search query" assign `wrapper.vm.archiveFiles`, but
  `archiveFiles` is **not returned from `setup()`**, so the assignment doesn't reach the component
  state; `toggleSelectAll` would select nothing and the search assertion would fail.
- Because `getResource` returns `undefined`, `loadArchive` ends in the error state right after
  mount; tests that render the table rely on timing.
- The "formats dates correctly" assertions (`toContain('1')`) are effectively always true.
- No tests cover loading, preview, download, or `src/index.ts`.
- No tests for `ArchiveViewerLarge.vue`, `utils/memory.ts`, or the legacy app.

## Running (once dependencies exist)

```
npx vitest            # watch
npx vitest run        # once
npx vitest run --coverage
```

## When changing tests

Update the table above and the "Expected problems" list after each real run.
