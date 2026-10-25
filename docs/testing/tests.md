# Tests

## Running

```
pnpm test:unit          # watch mode
pnpm test:unit --run    # once (used in verification)
pnpm test:unit --run --coverage
```

Config comes from `@opencloud-eu/extension-sdk` (`defineConfig` in `vite.config.ts`): `happy-dom`,
globals, `clearMocks`, includes `**/*.spec.ts`, excludes `node_modules`, `dist`, `e2e` and (our
override) `reference/**`. The SDK's setup file adds a `<base href="/">` to the document.

## Current specs

`tests/unit/App.spec.ts` — 2 tests, both passing (rework step 1):

| Test                     | Checks                                             |
| ------------------------ | -------------------------------------------------- |
| renders the archive name | `.archive-viewer-name` text equals `resource.name` |
| renders the archive size | `.archive-viewer-size` is non-empty                |

Pattern (same as `web-app-json-viewer`): `mount` and `defaultPlugins()` from
`@opencloud-eu/web-test-helpers`, `mock<Resource>()` / `mock<AppConfigObject>()` from
`vitest-mock-extended`, props passed directly (no router needed).

`OcIcon` is stubbed (`global.stubs: { OcIcon: true }`): the real component fetches its SVG over
HTTP, which in happy-dom fails with `ECONNREFUSED 127.0.0.1:3000` noise.

## Old tests (parked)

`reference/old-tests/setup.ts` and `ArchiveViewer.spec.ts` tested the old viewer with hand-written
mocks of libarchive.js, web-pkg and vue-router. They are excluded from the run. Two of them could
never have passed (they assigned `archiveFiles`, which wasn't exposed). Rewrite tests for the
ported viewer in step 3 using the pattern above.

## Not covered yet

`src/index.ts` (app registration), archive listing/preview (step 3), e2e tests (OpenCloud uses
Playwright in `web-extensions`; consider after step 2).

## When changing tests

Update the table above with each new spec.
