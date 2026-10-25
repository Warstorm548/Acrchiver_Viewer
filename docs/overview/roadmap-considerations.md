# Roadmap Considerations

Options discussed but **not scheduled**. The current plan (steps 3–6) is pure JavaScript in the
browser with no server or CSP changes ("approach A"); see
[project-status](project-status.md). Revisit these when a need appears (7z/RAR, archives too big
for the browser, writing into OpenCloud).

## Why these are separate

OpenCloud web extensions can only be **static JavaScript** ("does not support injection of dynamic
web applications", OpenCloud web service README). The production CSP on the main server (rolling
8.0.1) allows web workers (`worker-src 'self' blob:`) but **blocks WebAssembly** (`script-src`
has no `'wasm-unsafe-eval'`). Approach A works within both rules; the options below each bend one.

## B — Server helper service (any language)

A small service (Go fits best: OpenCloud is Go and has mature archive libraries; Python or Rust
also work) runs as an extra container in the opencloud-compose stack. OpenCloud's proxy routes a
path to it via `proxy.yaml` `additional_policies` (OpenCloud's own dev setup does this for `/yjs`).

- **Auth**: protected routes (the default) require login, and the proxy adds the user's access
  token to forwarded requests (`services/proxy/pkg/middleware/account_resolver.go` sets the reva
  token header). The service fetches the archive from OpenCloud as that user.
- **Pros**: every format (7z, RAR, XZ, BZ2 via native libraries); huge archives processed with
  streaming/random access on the server; browser downloads only chosen files; no CSP change.
- **Cons / risks**: another service to build, deploy and patch; untrusted archives are unpacked
  **on the server** (zip bombs, path traversal, parser bugs → needs limits, timeouts, sandboxing,
  temp-space quotas); more moving parts; token forwarding needs a prototype first.
- **Shape**: `/archive-api/list?file=<id>`, `/archive-api/entry?file=<id>&path=…`; the Vue viewer
  would use it when present and fall back to approach A otherwise.

## C — libarchive compiled to plain JavaScript

Compile libarchive (C) with Emscripten in non-WebAssembly mode (`-s WASM=0`, asm.js-style JS).
Plain JavaScript is allowed by the CSP.

- **Pros**: nearly all formats (7z, RAR, XZ, BZ2…) entirely in the browser; no server changes.
- **Cons**: we build and maintain the toolchain ourselves; several times slower and larger than
  the WebAssembly build; still limited by browser memory; libarchive parser bugs become ours to
  track (they stay inside the page's JavaScript sandbox).

## WebAssembly + CSP change (rejected for now)

Adding `'wasm-unsafe-eval'` to the server's `script-src` would allow libarchive.js / zip.js WASM
builds. Risk is low (`'unsafe-inline'` is already present) but it is server-wide, must be repeated
on every server that installs the app, and must be kept out of upstream-tracked files (use the
`custom/` overlay). Decided against so the app works on a default OpenCloud.

## Extract to folder

An "Extract here" action that writes archive contents into OpenCloud (like the official
`web-app-unzip`, which only does ZIP up to 64 MB by default).

- **Pieces**: an `action` extension on `global.files.context-actions`; create a target folder
  (`clientService.webdav.createFolder`); upload entries through OpenCloud's upload service
  (`$uppyService`, preserving relative paths) — the pattern in `web-app-unzip`.
- **Risks**: path traversal (`../`, absolute paths, backslashes) must be rejected before upload;
  name collisions; quota; many small uploads; partial failure handling.
- **Overlap**: duplicates `web-app-unzip` for ZIP; the value would be the other formats.

## Plain TAR header hopping (deferred)

Deferred in step 5; to revisit later. Today a `.tar` is downloaded whole (up to the archive limit).

- **What it is**: a plain (uncompressed) TAR is a chain of 512-byte headers, each followed by its
  file data padded to 512 bytes. With Range requests the viewer could read one header, compute
  where the next one starts from the size field, skip the data, and repeat — listing a huge TAR
  without downloading it, then fetching a single file's bytes on demand (like ZIP today).
- **Cost**: one HTTP request per entry just to list the archive (thousands of files → thousands
  of requests, unlike ZIP's single index), unless headers are read in larger batches; pax/GNU
  long-name records add extra headers per entry. Needs its own reader built on
  `HttpRangeReader`.
- **Limits**: only for uncompressed `.tar`. Compressed TARs (gz/bz2/xz) can't be skipped through,
  since their data must be decompressed from the start.
- **Why deferred**: plain TARs are rarer than ZIPs and compressed TARs, and the request count
  makes it slow on big archives; the user wants to understand the trade-off better first.

## Also noted

- Large ZIPs without full download: **done in step 5** ([zip-range-reading](../source/zip-range-reading.md)).
- Password-protected ZIPs: zip.js supports decryption; would need a password prompt.
