# Project Status

Where the Archive Viewer stands. Branch `feat/opencloud-v8-compat`, rework **steps 1–4 of 6 done**
(rebuilt setup; verified in a local copy of the production stack; real viewer in pure JavaScript;
bzip2 and single compressed files). Next: step 4b (XZ).

## Summary

A standalone **OpenCloud v8 web extension** built with OpenCloud's own toolchain
(`@opencloud-eu/extension-sdk`, Vite 8, Vue 3, TypeScript 6, pnpm 11, Node 24), pinned to the
OpenCloud **8.0** line because the main server runs rolling **8.0.1**. It opens **ZIP, TAR,
TAR.GZ/TGZ, TAR.BZ2/TBZ2** archives and single **.gz / .bz2** files in the browser: browse folders, search, sort, preview text and images,
download single files or a selection as one zip. Everything runs in **plain JavaScript (no
WebAssembly)**, so it works under OpenCloud's default production CSP with no server changes.
History: the original upload held a legacy vanilla-JS app, a broken webpack build and an nginx
deployment (removed in step 1); the old pre-v8 viewer was ported and deleted in step 3.

## Build / run status

| Item                          | Status                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm install`                | OK (lockfile committed; 2 harmless upstream peer warnings)                                    |
| `pnpm build`                  | OK → `dist/manifest.json`, `dist/js/*.mjs`, `dist/assets/*.css`; no `.wasm`, no `WebAssembly` |
| `pnpm check:types`            | OK                                                                                            |
| `pnpm lint` / `format:check`  | OK                                                                                            |
| `pnpm test:unit --run`        | OK, 66/66                                                                                     |
| Loaded in a running OpenCloud | OK — local opencloud-compose, rolling 8.0.1 (steps 2–3)                                       |

## Feature status

| Feature                                                                | State                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Registered for zip, tar, tar.gz/bz2/xz, tgz, gz, bz2, xz, 7z, rar      | Done                                                               |
| Read ZIP, TAR, TAR.GZ, TGZ                                             | Done (step 3)                                                      |
| Folders, breadcrumb, whole-archive search, sort                        | Done (step 3)                                                      |
| Preview text (first 1 MiB) and images (≤ 10 MiB)                       | Done (step 3)                                                      |
| Download a file / a selection as one zip                               | Done (step 3)                                                      |
| Size limits from `apps.yaml` (`maxArchiveSize`, `maxUncompressedSize`) | Done (step 3; defaults 256 MiB / 1 GiB)                            |
| TAR.BZ2/TBZ2, single .gz/.bz2 (bzip2 in a Web Worker)                  | Done (step 4)                                                      |
| XZ / TAR.XZ (port of xz-compat's pure-JS decoder)                      | Step 4b                                                            |
| Large ZIPs via Range requests                                          | Step 5                                                             |
| 7z / RAR, extract to folder, server helper                             | Roadmap only ([roadmap-considerations](roadmap-considerations.md)) |

`README.md` still describes the original, aspirational feature set and the old webpack setup; it
gets rewritten in step 6.

## Rework plan

1. ~~Clean up and rebuild the setup~~ (done).
2. ~~Run OpenCloud locally (opencloud-compose, 8.0.1), install the app, confirm "Open with"~~ (done).
3. ~~Real viewer: pure-JS engine (ZIP/TAR/TAR.GZ), browser, preview, downloads, limits~~ (done).
4. ~~bzip2 (TAR.BZ2/TBZ2/BZ2) and single compressed files, pure JS in a worker~~ (done).
   4b. XZ / TAR.XZ by porting `xz-compat`'s pure-JS LZMA2 decoder.
5. Large ZIPs via the `url` prop + Range reads (if the signed URL honours `Range`).
6. Translations tooling, README rewrite, release packaging, final docs pass.

Decisions so far: approach A (pure JS, no CSP change), view + download (no writing to OpenCloud),
256 MiB default size limit. Details:
[opencloud-v8-compatibility](../architecture/opencloud-v8-compatibility.md).

## Metadata

- License **AGPL-3.0** (`LICENSE` = canonical gnu.org text; `package.json`; README; generated
  `dist/manifest.json`).
- Author **Warstorm548**; repo/bugs → `Warstorm548/Acrchiver_Viewer`. README states the project is
  independent and not affiliated with OpenCloud GmbH.
- Version `0.1.0` (never released; the old "1.0.0 Production Ready" changelog in
  `docs/original-docs/` is historical and inaccurate).
