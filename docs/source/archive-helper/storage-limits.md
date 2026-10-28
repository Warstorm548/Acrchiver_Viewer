# Archive Helper: Storage and Safety Limits

The configurable limits are environment variables in opencloud-compose's `.env` (all listed with
defaults in `deploy/env.example`); a few parser limits are code constants (marked below). All
apply to every user alike, **admins included**: changing `.env` and restarting the helper is the
only way to change the configurable ones. Sizes accept `GB`/`TB` (decimal) or
`GiB`/`TiB`. Code: `server/internal/storage`, `session`, `archive`. Overview in
[overview](overview.md).

## Temp storage caps

| Variable                              | Default | Meaning                                                      |
| ------------------------------------- | ------- | ------------------------------------------------------------ |
| `ARCHIVE_HELPER_MAX_STORAGE`          | `50GB`  | All open archives together; any value allowed (also >100 GB) |
| `ARCHIVE_HELPER_MAX_STORAGE_PER_USER` | `25GB`  | One user's open archives together                            |

How it works (`storage.Ledger`):

1. **Check before starting.** The archive's size comes from OpenCloud (PROPFIND) before
   anything is downloaded and is **reserved**. The job never starts if the archive alone is over
   a cap (`archive-too-large`), the user's reservations plus it exceed their cap
   (`user-quota`), all reservations plus it exceed the total (`server-busy`), or the disk's real
   free space minus space promised but not yet written is too small (`server-busy`).
2. **Hard stop.** Every write to the temp file is counted against the reservation; one byte
   more than reserved (the file grew after the PROPFIND) stops the copy, deletes the partial
   file and reports `changed`. Fewer bytes, or a different ETag on the GET, also fail.
3. **Running jobs are never interrupted** to make room; a refused user retries later.
4. **Freed** when the viewer closes the archive (Cancel, leaving the page, `pagehide`), when no
   heartbeat came for `ARCHIVE_HELPER_SESSION_TIMEOUT` (default `10m`, swept every 30 s), when a
   job fails, and on helper start (only files named `ah-*.part` / `ah-*.archive` are deleted, so a
   wrongly set temp folder is never emptied). A download or issued ticket keeps the file until
   it ends, so closing the tab after clicking "Download" doesn't break the download.

### Known limitation: Docker can't cap a folder's size

Docker volumes and bind mounts have no size limit. The caps above are enforced by the helper's
own code, not by Docker or the operating system: a helper bug, or something else writing to the
folder, could exceed them. For an OS-level guarantee put the temp folder on its **own
fixed-size partition or disk** (optional; see [deployment](../../deployment/archive-helper.md)).

## Download caps (helper mode)

| Variable                                | Default | Meaning                                                        |
| --------------------------------------- | ------- | -------------------------------------------------------------- |
| `ARCHIVE_HELPER_MAX_DOWNLOAD_SIZE`      | `10GB`  | Largest single file downloaded out of an archive               |
| `ARCHIVE_HELPER_MAX_SELECTION_SIZE`     | `10GB`  | Largest multi-file selection (files' total)                    |
| `ARCHIVE_HELPER_CONFIRM_DOWNLOAD_SIZE`  | `1GB`   | Above this the viewer asks "Download X?" first                 |
| `ARCHIVE_HELPER_MAX_DOWNLOADS_PER_USER` | `3`     | Downloads (incl. issued, unused tickets) one user runs at once |

Sizes come from the tar headers, so they are checked **before** a download starts; the stream
then delivers exactly that many bytes. Downloads stream to the browser's download manager and use
no server temp space and no browser memory. They protect the user's disk and the helper's
CPU/bandwidth. Previews are capped at 16 MiB on the server (the viewer previews up to 10 MiB).

How these relate to the browser's limits (`apps.yaml`, `src/limits.ts`): in helper mode
`maxArchiveSize` / `maxUncompressedSize` don't apply (the archive never enters the browser) and
`maxEntrySize` only caps previews; the download caps take over its download role.

## Parser limits (archives built to exhaust the server)

| Variable / constant              | Default          | Guards against                                                                                                              |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ARCHIVE_HELPER_MAX_ENTRIES`     | `500000`         | Listings that take too much memory; also caps a ZIP's declared count and every 7z header count before anything is allocated |
| `ARCHIVE_HELPER_MAX_SCAN_SIZE`   | `500GB`          | Decompression bombs (data decompressed while listing)                                                                       |
| `ARCHIVE_HELPER_SCAN_TIMEOUT`    | `60m`            | Endless CPU use                                                                                                             |
| `MaxDictionarySize` (code)       | 256 MiB          | Huge xz/LZMA/LZMA2 dictionaries, PPMd memory and zstd windows (xz, lzma, ZIP, 7z; checked before allocating)                |
| `maxSevenZipHeaderSize` (code)   | 512 MiB          | 7z headers (stored, or declared size when compressed)                                                                       |
| `maxPathLength` / `maxNameBytes` | 64 KiB / 256 MiB | Huge names, names filling memory                                                                                            |

Any of these reports `too-complex` ("too large or complex to list on the server").

## Container limits

`deploy/compose/archive-helper.yml` runs the helper as its own user (`ARCHIVE_HELPER_UID_GID`,
default `1500:1500`), read-only file system except the temp folder, all capabilities dropped,
`no-new-privileges`, `mem_limit` 2 GB with `GOMEMLIMIT` 1800 MiB, 2 CPUs, no published port.

## When changing limits

Update `server/internal/config`, `deploy/env.example`, `deploy/compose/archive-helper.yml`, this
doc and the tests (`config_test.go`, `ledger_test.go`, `api_test.go`).
