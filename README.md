# Archive Viewer for OpenCloud

A web extension for **OpenCloud 8** that opens archives right in the browser: browse folders,
search, preview text and images, and download single files or a selection — without extracting
anything into your storage.

Everything runs in plain JavaScript in the browser. It needs **no server component and no change
to OpenCloud's security policy (CSP)**.

## Features

- "Open in Archive Viewer" for archive files in OpenCloud (Files app, shares and public links)
- Folder tree with breadcrumb, search across the whole archive, sorting by name, size or date
- Preview of text files (first 1 MiB) and images (up to 10 MiB)
- Download one file, or select files and folders and download them as one ZIP
- **Large ZIPs** (tested with 3 GiB): read with HTTP range requests, so only the archive's index
  and the files you open are fetched
- Size limits that adapt to the device (lower on phones and tablets), configurable per server
- English, German, Spanish and French (draft translations, see below)

## Supported formats

| Format                            | Extensions                    |
| --------------------------------- | ----------------------------- |
| ZIP (incl. ZIP64; stored/deflate) | `.zip`                        |
| TAR                               | `.tar`                        |
| TAR + gzip                        | `.tar.gz`, `.tgz`             |
| TAR + bzip2                       | `.tar.bz2`, `.tbz2`, `.tbz`   |
| TAR + xz                          | `.tar.xz`, `.txz`             |
| TAR + legacy LZMA                 | `.tar.lzma`, `.tlz`           |
| Single compressed files           | `.gz`, `.bz2`, `.xz`, `.lzma` |

Not supported (a download button is offered instead): 7z and RAR; password-protected ZIP entries;
Deflate64, bzip2 or LZMA compression inside a ZIP; xz files using the ARM64 or RISC-V filter.

## Limits

ZIPs are read piece by piece and have no archive size limit. Other formats are downloaded into the
browser first.

| Limit                           | Desktop | Phone/tablet | `apps.yaml` keys                                   |
| ------------------------------- | ------- | ------------ | -------------------------------------------------- |
| Archive downloaded in full      | 1 GiB   | 256 MiB      | `maxArchiveSize`, `maxArchiveSizeMobile`           |
| Decompressed data               | 2 GiB   | 512 MiB      | `maxUncompressedSize`, `maxUncompressedSizeMobile` |
| One extracted file or selection | 1 GiB   | 256 MiB      | `maxEntrySize`, `maxEntrySizeMobile`               |

Values are in bytes, for example in OpenCloud's `apps.yaml`:

```yaml
archive-viewer:
  config:
    maxArchiveSize: 2147483648 # 2 GiB
```

## Compatibility

Each release runs only on the exact OpenCloud versions it was tested on. This release supports
**OpenCloud 8.0.1** (rolling); [CHANGELOG.md](CHANGELOG.md) lists the supported versions for each
release. On any other version, or if the server version can't be read, the viewer hides itself
and logs the reason in the browser console. This is on purpose, so an OpenCloud upgrade can't
leave a half-working viewer.

Admins can run it on an untested version at their own risk:

```yaml
archive-viewer:
  config:
    allowUnsupportedOpenCloud: true # default false; logs a console warning
```

The `@opencloud-eu/*` packages are pinned to the server's 8.0 line.

## Installation

1. Get `archive-viewer-<version>.zip` (from a release, or build it yourself as below).
2. Unzip it into OpenCloud's web apps folder so you get
   `<apps folder>/archive-viewer/manifest.json`. With
   [opencloud-compose](https://github.com/opencloud-eu/opencloud-compose) that is
   `config/opencloud/apps/`, mounted to `/var/lib/opencloud/web/assets/apps`.
3. Restart OpenCloud. Check that `https://<your server>/config.json` lists `archive-viewer` under
   `external_apps`.

A reverse proxy in front of OpenCloud must pass HTTP `Range` requests through (Traefik in
opencloud-compose does).

## Building from source

Requires Node 24 (`.nvmrc`) and pnpm (via Corepack).

```bash
pnpm install
pnpm build           # → dist/
pnpm package         # → release/archive-viewer-<version>.zip + .sha256
```

Development:

```bash
pnpm check:types
pnpm lint
pnpm format:check
pnpm test:unit --run
pnpm l10n:extract    # update l10n/template.pot and the .po files (needs GNU gettext)
pnpm l10n:compile    # .po files → l10n/translations.json
```

Developer documentation lives in [`docs/`](docs/), indexed by [`CLAUDE.md`](CLAUDE.md).

## Translations

German, Spanish and French translations were **drafted with AI (Claude)** and have not yet been
reviewed by native speakers. Corrections are welcome: edit `l10n/locale/<lang>/app.po`, run
`pnpm l10n:compile`, and open a pull request.

## Security

Archive contents are treated as untrusted: names and text are never rendered as HTML, SVGs are
shown only as images, decompression and extraction are size-capped (against "zip bombs"), and
nothing is ever written back to your storage. The app only fetches the file through the signed
download URL OpenCloud provides. Details:
[docs/known-issues/security.md](docs/known-issues/security.md).

## License

Copyright (C) 2025-2026 Warstorm548

Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) — see [LICENSE](LICENSE).
Bundled and ported third-party code (zip.js, seek-bzip, xz-compat) is listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This is an independent project and is not affiliated with or endorsed by OpenCloud GmbH.

## Support

Issues: https://github.com/Warstorm548/Acrchiver_Viewer/issues
