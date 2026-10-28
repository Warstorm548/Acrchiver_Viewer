# End-to-End Tests (Playwright, Chromium)

`e2e/` drives the real viewer in Chromium against the local OpenCloud stack
([local-dev-environment](../deployment/local-dev-environment.md)). It replaces the manual browser
checklist: 71 tests, about 3.5 minutes including the 3 GiB ZIP. `helper.spec.ts` needs the archive
helper in the stack ([archive-helper](../deployment/archive-helper.md)). Unit tests are separate
([tests](tests.md)); Vitest skips `e2e/`.

## Setup (once)

```
pnpm install
pnpm test:e2e:install        # Playwright's Chromium into ~/.cache/ms-playwright (no sudo)
```

On a desktop Ubuntu 24.04 Chromium starts without extra packages. On a minimal system add its
libraries with `sudo pnpm exec playwright install-deps chromium` (normal terminal).

## Running

The stack must be up and serving the build in `dist/` (the global setup checks the version in
`/config.json` against `dist/manifest.json`). After `pnpm build`, restart OpenCloud first.

```
pnpm test:e2e                          # everything, incl. the 3 GiB ZIP
E2E_SKIP_LARGE=1 pnpm test:e2e         # quick run (about 1.5 minutes)
pnpm test:e2e e2e/specs/limits.spec.ts # one spec
pnpm exec playwright show-report       # HTML report of the last run (playwright-report/)
```

| Variable              | Default                             | Meaning                                          |
| --------------------- | ----------------------------------- | ------------------------------------------------ |
| `E2E_BASE_URL`        | `https://cloud.opencloud.test`      | OpenCloud URL (self-signed TLS is ok)            |
| `E2E_USER`            | `admin`                             | Account (needs basic auth enabled)               |
| `E2E_PASSWORD`        | `admin`                             |                                                  |
| `E2E_FIXTURES`        | `../test-fixtures`                  | `make-fixtures.sh` output                        |
| `E2E_SKIP_LARGE`      | unset                               | `1` skips `large-zip.spec.ts`                    |
| `E2E_HELPER_TEMP_DIR` | `../opencloud-compose/archive-temp` | The helper's temp folder (checked for leftovers) |

Dev stack only: the suite uploads files, changes the user's language and deletes what it created.

## How it works

- `playwright.config.ts` — Chromium (Desktop Chrome), one worker (the specs share server state),
  a `login` project that signs in once through the identity provider (`e2e/login.setup.ts`, session
  saved to `e2e/.auth/`, gitignored), traces kept on failure.
- `e2e/global-setup.ts` — checks OpenCloud 8.0.1 and the served build, uploads every fixture
  (overwriting, so the server's copy equals the local one) and generates two mobile-limit archives
  (`e2e-mobile-130MiB.tar`, `e2e-mobile-400MiB.tar.gz`). `global-teardown.ts` deletes them (server,
  trash, local) and resets the language to English.
- `e2e/test.ts` — the `test` used by all specs:
  - a console guard: a test fails on any console error, uncaught exception, CSP or WebAssembly
    message, except OpenCloud's own 404 (missing avatar) and what a spec allows via
    `test.use({ allowedConsole })` (e.g. the `ArchiveError` the viewer logs when it refuses a file);
  - `Viewer` helpers on the existing `archive-*` classes (open by URL, rows, folders, selection,
    downloads, error notification);
  - request rewrites that simulate server settings **without restarts**: `patchAppConfig`
    (archive-viewer entry of `/config.json`, i.e. `apps.yaml`), `patchProductVersion`
    (capabilities), `useBuiltInCsp` (drops `worker-src` from the page's CSP, leaving only
    `child-src 'self'` as in OpenCloud's built-in policy), and `phone` (Pixel 7 emulation).
- `e2e/helpers/` — `server.ts` (WebDAV upload/delete, trash purge, language via Graph; plain
  `node:https`, so 3 GiB uploads stream), `files.ts` (SHA-256; archive contents hashed with Python's
  `zipfile`/`tarfile`, zip CRCs checked), `generate.ts` (streamed tar of zeros), `memory.ts` (peak
  RSS of the Chromium renderer from `/proc`, Linux only).

## Specs

| Spec                    | Covers                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compatibility.spec.ts` | `/config.json` serves this build with the manifest defaults; right-click → "Open with..." → "Archive Viewer" opens it                                                                                                                                                                                                                                                       |
| `browse.spec.ts`        | folders first, folder + breadcrumb navigation, empty folder, whole-archive search with folder path, no matches, sort by name/size, F5 reload, hostile file name as text (no handler, no dialog)                                                                                                                                                                             |
| `formats.spec.ts`       | the sample tree in zip, tar, tar.gz, tgz, tar.bz2, tbz2, tar.xz, txz, tar.lzma, `archive-in-disguise.gz`; single `.gz/.xz/.bz2/.lzma` and BCJ x86 xz; progress for large bzip2/xz; `large.zip` only by 206 range reads; worker used (no fallback)                                                                                                                           |
| `preview.spec.ts`       | text and JSON, PNG and SVG (decoded), `binary.bin` → "No preview available…" with download                                                                                                                                                                                                                                                                                  |
| `download.spec.ts`      | single file from tar.xz and from `.gz`; `sample-selection.zip` (zip folders, "select all" in tar.bz2 incl. Unicode/long paths); `large-selection.zip` from tar.xz, tar.bz2 and zip; all byte-compared                                                                                                                                                                       |
| `limits.spec.ts`        | `maxArchiveSize` message + whole-archive download, ZIPs exempt, `maxEntrySize` refusal; phone: over 128 MiB archive, over 384 MiB decompressed, small archives still open                                                                                                                                                                                                   |
| `csp-fallback.spec.ts`  | built-in CSP: tar.bz2, tar.xz, tar.lzma, `.bz2` open on the main thread ("worker unavailable"); a `large.tar.xz` selection stays byte-identical                                                                                                                                                                                                                             |
| `version-gate.spec.ts`  | 8.1.0 → no "Archive Viewer" entry + refusal message; `allowUnsupportedOpenCloud` → viewer back with warning; 8.0.1 → no message                                                                                                                                                                                                                                             |
| `i18n.spec.ts`          | de/es/fr strings from `l10n/translations.json` (button, column, preview message), back to English                                                                                                                                                                                                                                                                           |
| `helper.spec.ts`        | server helper (needs it in the stack; `maxArchiveSize: 1000` sends fixtures through it): same listing/navigation/search as browser mode incl. the hostile name, preview, single file + selection zip byte-identical, confirmation yes/no, temp file deleted when the viewer is left, Cancel while preparing, fallback to the browser message when the helper doesn't answer |
| `large-zip.spec.ts`     | 3 GiB ZIP64: under 20 range reads, no `.wasm`, late file preview; 200 MiB and 900 MiB downloads by SHA-256; peak renderer memory under 1.5 GiB; 1,200 MiB file and `bulk` refused; 3,000-file selection; phone refuses 900 MiB; removed afterwards                                                                                                                          |

`large-zip.spec.ts` runs `make-fixtures.sh --large-zip` when `big-test.zip` is missing (about a
minute, 3.04 GiB) and deletes it from the server, the trash and `test-fixtures/` afterwards.

## Results

- 2026-10-25, 0.2.1 build, Chromium 156 (Playwright 1.64.1), compose CSP: all 64 tests and the
  login step passed in 3.0 minutes. Peak renderer memory for the 900 MiB download: 584–591 MiB
  (PR #3 measured 717 MiB; Firefox about 1 GB). Server, trash and local files clean afterwards;
  language back to English.
- 2026-10-28, 0.3.0 build with the archive helper in the stack: all 71 tests and the login step
  passed in 3.3 minutes; `./archive-temp` empty afterwards. The first run found a real bug (server
  mode showed the previous folder's rows while the next page loaded) and showed that
  `limits.spec.ts` must turn the helper off, since its archives now open on the server.
- Sanity: with the CSP rewrite removed, the four fallback tests fail (no "worker unavailable"), so
  the simulation is what makes them pass.

## When changing

UI classes (`archive-*`) and message texts are the selectors: update `e2e/test.ts` and the specs
with them. New fixtures in `make-fixtures.sh` are uploaded automatically (by extension). Update
this doc, [tests](tests.md) and the [repository layout](../overview/repository-layout.md).
