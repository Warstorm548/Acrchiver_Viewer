# reference/

Code kept only as source material for porting the archive UI to OpenCloud v8 (rework step 3).
It is **not** built, type-checked, linted or tested (excluded in `tsconfig.json`,
`eslint.config.js`, `.prettierignore`; vitest only picks up `tests/**`).

- `old-views/ArchiveViewer.vue` — the previous viewer component (pre-v8 API, known bugs).
- `old-views/ArchiveViewerLarge.vue` — unused "large archive" variant.
- `old-tests/` — the old vitest setup and spec for `ArchiveViewer.vue`.

Port notes: `docs/source/reference-old-viewer.md` and `docs/source/reference-old-viewer-large.md`.
Delete this folder at the end of step 3.
