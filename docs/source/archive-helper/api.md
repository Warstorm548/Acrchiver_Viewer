# Archive Helper: HTTP API

All routes are under `/archive-api` on the OpenCloud domain (proxy routes in
`deploy/compose/proxy.yaml`). Every route except `download/` requires login: the proxy sets
`X-Remote-User`, and the helper answers `401 unauthorized` without it (a sign of a wrong route
config). Bodies are JSON; errors are `{"code", "message", "size"?, "limit"?}`. Responses carry
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Implemented in
`server/internal/api/api.go`; overview in [overview](overview.md).

## Routes

| Route                           | Purpose                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                   | `version`, `features`, `ready`, `problems` (see below), caps (`maxStorage`, `maxStoragePerUser`, `maxDownloadSize`, `maxSelectionSize`), `confirmDownloadSize`, `maxDownloadsPerUser`, `maxPreviewSize`, `heartbeatSeconds`, `sessionTimeoutSeconds` |
| `POST /sessions {webDavPath}`   | Opens a file (`/spaces/<space id>/<path>`): `202` + status; copy and scan run in the background                                                                                                                                                      |
| `GET /sessions/{id}`            | Status: `state` (`copying`, `scanning`, `ready`, `error`), `size`, `copied`, `scanned`, `entries`, `error` code                                                                                                                                      |
| `POST /sessions/{id}/heartbeat` | `204`; any call on a session also counts as a heartbeat                                                                                                                                                                                              |
| `DELETE /sessions/{id}`         | `204`; stops the job, deletes the temp file once no download holds it                                                                                                                                                                                |
| `GET /sessions/{id}/children`   | `path` (`""` = root), `sort` (`name`/`size`/`modified`), `dir` (`asc`/`desc`), `offset`, `limit` (≤ 5000, default 500) → `{entries, total, offset}`; folders first, natural name order                                                               |
| `GET /sessions/{id}/search`     | `q`, `limit` (≤ 5000, default 1000) → `{entries, truncated}`; case-insensitive name match, archive order                                                                                                                                             |
| `GET /sessions/{id}/entry`      | `path` → raw bytes for a preview (≤ 16 MiB, else `413 preview-too-large`)                                                                                                                                                                            |
| `POST /sessions/{id}/downloads` | `{paths, issue}`; folders are expanded, `""` = whole archive → `{fileName, size, contentSize, files, confirm, url?}`; `url` only with `issue: true`                                                                                                  |
| `GET /download/{ticket}`        | No login. Streams one file as is or several as a store-only ZIP, `Content-Length` exact, `Content-Disposition: attachment` (ASCII fallback + `filename*`)                                                                                            |

Entries are `{path, name, isDirectory, size, modified?, localTime?, supported}` (`modified` in
ms; `localTime` marks a ZIP's zoneless DOS date, sent as if UTC). A session is visible only to
its owner; another user gets `404 session-not-found`, so IDs reveal
nothing.

## Health, version and features

- `version` is the helper's own SemVer (`Version` in `api.go`, since 0.5.0 independent of the
  viewer's). A **minor** bump means a breaking change to this API; a **patch** bump a compatible
  one. The viewer uses a helper only in its supported range (`src/helper/gate.ts`,
  `^0.5.0`).
- `features` lists optional abilities: `format:<format>` for each format the helper opens
  (`zip`, `7z`, `tar`, `tar.gz`, `tar.bz2`, `tar.xz`, `gz`, `bz2`, `xz`, `lzma`) and
  `download:selection`. A new optional ability is added here in a patch release; the viewer uses
  it only when listed.
- `ready` is false, with codes in `problems`, when the helper runs but can't do its job:
  `temp-not-writable` (temp folder) or `opencloud-unreachable` (`GET
ARCHIVE_HELPER_OPENCLOUD_URL/status.php` did not answer 200 with OpenCloud's status JSON,
  `"installed": true`, within 3 s; so a wrong URL pointing at another server counts too). The
  checks run at most every 30 s (`readiness.go`); a check whose `/health` caller gave up is not
  cached. The viewer never uses a helper that isn't ready.

## Error codes

| Code                                          | Status      | Meaning (viewer message)                                                                |
| --------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `server-busy`                                 | 507         | Total cap or disk full right now ("Server busy: not enough space…")                     |
| `user-quota`                                  | 507         | The user's own open archives fill their cap ("You have too many large archives open…")  |
| `archive-too-large`                           | 413         | The archive alone is over a cap; `limit` set ("larger than the server allows")          |
| `download-too-large`                          | 413         | Over 13a caps; `size` and `limit` set                                                   |
| `too-many-downloads`                          | 429         | The user already has `maxDownloadsPerUser` downloads (tickets count until used/expired) |
| `nothing-to-download`                         | 400         | The selection holds no readable file                                                    |
| `session-not-found`                           | 404         | Unknown, closed, timed out, or another user's session                                   |
| `not-ready`                                   | 409         | Still copying/scanning, or failed                                                       |
| `invalid-path`, `file-not-found`, `forbidden` | 400/404/403 | From the WebDAV path or OpenCloud                                                       |
| `link-expired`                                | 410         | Ticket unknown, used or older than 60 s                                                 |
| `helper-error`                                | 502         | Anything else (logged)                                                                  |

A failed session's status `error` is one of `unsupported-format`, `corrupt`, `too-complex`
(parser limits or scan timeout), `encrypted` (a 7z with an encrypted header; "password-protected,
which is not supported"), `changed` (ETag or size differs from the PROPFIND: file replaced
while copying, or the hard stop), `storage-error`, `download-failed`.

## Viewer flow

`checkHelper` (`src/helper/gate.ts`) asks `/health` (5 s timeout) once per opened archive; only
a helper that answers, has the expected fields, a supported version and `ready: true` is used,
and only for formats in its `features`. `App.vue` then opens with `POST /sessions`, polls `GET /sessions/{id}` every second (Cancel →
`DELETE`), then hands a `RemoteArchive` to `ArchiveBrowser`. A download first calls `downloads`
without `issue`; if `confirm` is set the user sees "Download X?" first; then `issue: true` and
the browser follows the link (`triggerUrlDownload`).

## When changing the API

Update this doc, `src/helper/client.ts` (types), `src/helper/gate.ts` (shape check, supported
range), the viewer's messages for new codes (and translations), `server/internal/api/api_test.go`
and `ArchiveHelperChangelog.md`. A breaking change bumps the helper's minor version and needs a
viewer release that moves `SUPPORTED_HELPER`.
