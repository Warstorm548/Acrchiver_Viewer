# Security Notes

Archive contents (file names, data) are **untrusted input**: anyone who can put an archive in
a user's storage, or share one by public link, controls them. Review every place entry names or
contents reach the DOM, memory or storage.

## Current code (after rework step 1)

`src/App.vue` renders only `resource.name` and a formatted size through `v-text`, which Vue
escapes. No `v-html`. Nothing from inside an archive is read yet.

## Rules for the step 3 port

- **Render names with `{{ }}` / `v-text` / bound attributes only** — never `v-html` or
  `innerHTML`. (The removed legacy app had a real XSS here: it built rows with template strings and
  an `escapeHtml` that didn't escape quotes, so an entry named `x" onmouseover="…"` ran script.)
- **SVG previews**: show only via `<img src="blob:…">` (scripts don't run there). Never open the
  blob as a document or embed it with `<object>`/`<iframe>`. Give blobs an explicit MIME type.
- **Resource exhaustion ("zip bomb")**: declared sizes in archive headers can lie. Enforce limits on
  the archive size (from `applicationConfig`, like `web-app-unzip`'s `maxArchiveSize`) and on bytes
  actually extracted for a preview, not just on the declared entry size.
- **Download filenames**: names come from the archive; strip path separators and control
  characters before using them for `a.download`.
- **Path traversal** (`../`, absolute paths): irrelevant while nothing is written, but mandatory to
  handle if an "extract to folder" feature is added.
- **Auth**: fetch file content only through `AppWrapperRoute` props / OpenCloud's
  `clientService`, never with hand-built `fetch` + tokens.

## Hosting headers

The old nginx container (and its header problems) was removed. In v8 the app is served by
OpenCloud itself, which sets its own CSP (`PROXY_CSP_CONFIG_FILE_LOCATION`). If the archive
engine needs a WASM worker, check that OpenCloud's CSP allows it (`worker-src`, `wasm-unsafe-eval`)
— to verify in step 2/3.

## README claims not backed by code

"CSRF tokens for API requests", "Secure share link generation" and "All file operations respect
OpenCloud permissions" in `README.md` are not implemented by this repo's code (the last is
provided by OpenCloud's server, not the app).
