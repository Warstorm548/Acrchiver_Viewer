# Security Notes

Archive contents (file names, data) are **untrusted input**: anyone who can put an archive in
a user's storage, or share one by public link, controls them. Review every place entry names or
contents reach the DOM, memory or storage.

## How the viewer handles untrusted archives (step 3)

| Rule              | Implementation                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No HTML injection | Names, paths and text previews render only via `v-text`, `{{ }}` and bound attributes; no `v-html`/`innerHTML` anywhere. Test fixture `x" onmouseover="alert(1)".txt` checks this in the browser. (The removed legacy app had a real XSS here.)                                                                                                            |
| SVG / images      | Shown only as `<img :src="blob:…">` (scripts in SVG don't run in `<img>`); blobs get an explicit MIME type from the extension; object URLs revoked on close.                                                                                                                                                                                               |
| Archive size      | `maxArchiveSize` (1 GiB desktop / 256 MiB mobile) checked against `resource.size` **before** a full download. ZIPs are read by range and never held whole in memory.                                                                                                                                                                                       |
| Zip bombs         | gzip, bzip2, xz and lzma decompression aborts above `maxUncompressedSize` (2 GiB / 512 MiB). Every extracted file, and the total of a selection, is capped at `maxEntrySize` (1 GiB / 256 MiB); for ZIP the cap counts the **real** output bytes, and zip.js stops at the declared size anyway. Previews only for entries ≤ 10 MiB, at most 1 MiB of text. |
| Download names    | `sanitizeFileName` replaces `/`, `\` and control characters before `a.download`.                                                                                                                                                                                                                                                                           |
| Path traversal    | Nothing is written to disk or to OpenCloud; `..` stays display text. Mandatory to handle if "extract to folder" is ever added ([roadmap-considerations](../overview/roadmap-considerations.md)).                                                                                                                                                           |
| Auth              | The archive is fetched only from the pre-signed `url` OpenCloud's `AppWrapperRoute` provides (renewed via the wrapper's `getUrlForResource` when it expires); no tokens handled by the app.                                                                                                                                                                |
| CSP               | Works under the default production CSP: no WebAssembly (zip.js native build, own bzip2/xz/lzma decoders), workers only from `blob:` (zip.js and the decompression worker; allowed by `worker-src`).                                                                                                                                                        |

## Hosting headers

The app is served by OpenCloud itself, which sets its CSP (`PROXY_CSP_CONFIG_FILE_LOCATION`;
opencloud-compose `config/opencloud/csp.yaml`). No CSP change is needed or recommended; the risks of
allowing WebAssembly are recorded in [roadmap-considerations](../overview/roadmap-considerations.md).
