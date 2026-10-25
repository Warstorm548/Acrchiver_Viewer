# Security Notes

Archive contents (file names, data) are **untrusted input**: anyone who can put an archive in
a user's storage controls them. Review every place entry names or contents reach the DOM.

## Legacy app — HTML/attribute injection (XSS) — CONFIRMED

`src/lib/UIManager.js` builds HTML with template strings and assigns it to `innerHTML`.

- `escapeHtml` (line 730) uses `div.textContent = text; return div.innerHTML`. This escapes
  `<`, `>`, `&` but **not `"` or `'`**, so it is unsafe inside attribute values.
- Unescaped interpolations into attributes:
  - `data-path="${parentPath}"` (line 212), `data-path="${dir.path}"` (228),
    `data-path="${file.path}"` (246) — entry paths from the archive.
  - `data-path="${currentPath}"` in breadcrumb (359).
  - `value="${shareLink}"` in the share dialog (562) — from the host.
- `archive.type.toUpperCase()` in the info panel (384) is internal, low risk.

Example: an archive entry named `x" onmouseover="alert(document.cookie)" y="` produces a row
attribute that runs script on hover, inside the OpenCloud origin.

Fix (if the legacy app is kept): build rows with `document.createElement` / `textContent` /
`dataset`, or escape `"` and `'` as well. Preferred: delete the legacy app.

## Vue app — CONFIRMED safe-by-default areas

- All names are rendered with `{{ }}` interpolation or bound attributes (`:alt`, `:title`), which
  Vue escapes. No `v-html` is used in either view.
- Text previews are shown in `<pre>{{ previewData }}</pre>`, escaped.

## Vue app — things to check

- **SVG previews**: `isImageFile` includes `svg`; the blob is created without a MIME type and shown
  via `<img src>`. Scripts in SVG don't run inside `<img>`, so this is OK as long as the blob URL
  is never opened as a document or embedded via `<object>`/`<iframe>`. Keep it that way.
- **Download filenames**: `a.download = file.name` — browsers sanitize path separators, but names
  come from the archive; consider stripping control characters.
- **Resource exhaustion ("zip bomb")**: the viewer trusts `entry.file.size` and extracts fully
  into memory (`Archive.extract`). A small archive can expand hugely and crash the tab. Preview has
  a 10MB size guard based on the *declared* size, which a crafted archive can lie about.
- **Path traversal** (`../`): irrelevant today because nothing is written to disk or to OpenCloud
  storage, but becomes relevant if an "extract to folder" feature is added.

## Auth / tokens

- Legacy `fetchRange` sends `Authorization: context.getAuthToken()` on every request — fine only
  if the URL is the same OpenCloud origin.
- Vue app uses OpenCloud's `clientService`, which handles auth.

## Headers (deployment)

See [docker-and-nginx](../deployment/docker-and-nginx.md): security headers are dropped on static
assets by the nested `add_header`; no `Content-Security-Policy` is set.

## README claims not backed by code

"CSRF tokens for API requests", "Secure share link generation" and "All file operations respect
OpenCloud permissions" in `README.md` are not implemented by this repo's code (the last is
provided by OpenCloud's server, not the app).
