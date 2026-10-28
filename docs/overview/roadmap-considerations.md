# Roadmap Considerations

Options discussed but **not scheduled**, plus decisions for later features. Steps 3–6 built
the viewer in pure JavaScript in the browser with no server or CSP changes ("approach A");
0.3.0 added the optional server helper (option B below); see [project-status](project-status.md).
Revisit the others when a need appears (7z/RAR, writing into OpenCloud).

## Why these are separate

OpenCloud web extensions can only be **static JavaScript** ("does not support injection of dynamic
web applications", OpenCloud web service README). The production CSP on the main server (rolling
8.0.1) allows web workers (`worker-src 'self' blob:`) but **blocks WebAssembly** (`script-src`
has no `'wasm-unsafe-eval'`). Approach A works within both rules; the options below each bend one.

## B — Server helper service (done in 0.3.0)

Built as `server/` (Go) with a compose overlay and two proxy routes: large TAR-family and single
compressed archives are copied as the user into a capped temp folder, listed and streamed from
there. See [archive-helper overview](../source/archive-helper/overview.md) and
[deployment](../deployment/archive-helper.md). Possible later improvements: checkpoints in the
decompressed stream (zlib `zran`-style) for fast random access into big `.tar.gz`; 7z/RAR on the
server; sharing one temp copy between users of the same file (each read re-checked with the user).

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

## Compress on the server (decided, not built)

A "Compress…" entry in the file context menu (`global.files.context-actions`) that builds an
archive on the server, using the archive helper's container, temp folder and caps.

- **Formats:** ZIP, TAR, TAR.GZ first (Go standard library); TAR.XZ / TAR.BZ2 need extra
  libraries; RAR can't be created (proprietary); 7z would need a third-party library.
- **Space:** the reservation is the total size of the source files (an upper bound for the
  output); the same "check before starting / hard stop / Server busy" rules apply. The user's
  OpenCloud quota must hold originals + archive for a moment (checked first).
- **Delete originals:** asked in the dialog **before compression starts** — "Delete the original
  files after compressing?" **Yes / No**, with file count and size, a note that deleted files go
  to the trash bin, and a warning for shared folders. **No** never touches them.
- **On Yes:** the originals are **locked from that moment** with a server-side WebDAV lock (with
  a timeout, so a crash can't leave them locked); the UI shows them as locked. Order: read →
  build the archive in the temp folder → upload to the target → **verify** (size, checksum,
  re-read the file list) → **then** delete the originals (to the trash bin), skipping any whose
  ETag changed → release locks → delete the temp file. Any failure before the delete leaves the
  originals untouched and releases the locks.
- **Background job:** keeps running when the tab is closed; the user can check its status. Name
  clashes at the target get a `" (1)"` suffix, never an overwrite.
- **Prototype first:** locking a whole folder vs. each file, and how the desktop client behaves
  with locked files.

## Extract to folder (decided, not built)

The reverse of compression, an "Extract here" action that writes archive contents into
OpenCloud (like the official `web-app-unzip`, which only does ZIP up to 64 MB by default), using
the same container, temp folder and upload code.

- **Risks:** path traversal (`../`, absolute paths, backslashes) must be rejected before upload;
  name collisions; quota; many small uploads; partial failure handling.
- **Overlap:** duplicates `web-app-unzip` for ZIP; the value would be the other formats and size.

## Plain TAR header hopping (deferred)

Deferred in step 5; to revisit later. Today a `.tar` is downloaded whole (up to the archive
limit); above it, the server helper (0.3.0) opens it where installed. Header hopping would only
add value for installs without the helper.

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
