# Local Dev Environment (OpenCloud production stack)

A local copy of OpenCloud's official **production** compose stack, matching the main server
(rolling **8.0.1**), with this app mounted as an installed extension. Set up in rework step 2.
It lives **outside this repo** (not pushed), so this doc records how to recreate it.

## Layout

```
~/Projects/OpenCloud/
  Acrchiver_Viewer/      # this repo; its dist/ is mounted into OpenCloud
  opencloud-compose/     # git clone of github.com/opencloud-eu/opencloud-compose (main)
    .env                 # our settings (gitignored upstream)
    custom/archive-viewer.yml   # our overlay (custom/ is gitignored upstream)
    custom/apps.yaml     # copy of config/opencloud/apps.yaml + archive-viewer section
  test-fixtures/         # make-fixtures.sh + sample archives, large.zip
  README.md              # short map + commands
```

No upstream file is edited, so `git pull` in `opencloud-compose/` keeps working. The repo has no
tags; since its 8.0.1 commit (`2d992b77`, 2026-09-16) only image bumps landed, so `main` with
`OC_DOCKER_TAG=8.0.1` matches an 8.0.1 server except Traefik's patch level (3.7.14).

## How the stack works

- `docker-compose.yml`: service `opencloud` (`${OC_DOCKER_IMAGE}:${OC_DOCKER_TAG}`, uid 1000,
  `opencloud init || true; opencloud server`, `PROXY_TLS=false` behind the proxy, production CSP
  from `config/opencloud/csp.yaml`, `config/opencloud/apps.yaml`, apps dir
  `config/opencloud/apps` → `/var/lib/opencloud/web/assets/apps`).
- `traefik/opencloud.yml`: Traefik on host ports 80/443, routes `Host(cloud.opencloud.test)` to
  OpenCloud, HTTP→HTTPS redirect, HSTS. `TRAEFIK_SERVICES_TLS_CONFIG="tls=true"` without a cert
  file → Traefik's built-in self-signed certificate (browser warning).
- `.env` `COMPOSE_FILE` selects the overlays.

## Our settings

`.env` (copied from `.env.example`, changed values only):

```
COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml:custom/archive-viewer.yml
INSECURE=true
TRAEFIK_SERVICES_TLS_CONFIG="tls=true"
OC_DOCKER_IMAGE=opencloudeu/opencloud-rolling
OC_DOCKER_TAG=8.0.1
DEMO_USERS=true
INITIAL_ADMIN_PASSWORD=admin
PROXY_ENABLE_BASIC_AUTH=true   # dev only: curl -u admin:admin WebDAV uploads
```

`custom/archive-viewer.yml` (paths relative to `opencloud-compose/`):

```yaml
services:
  opencloud:
    volumes:
      - ../Acrchiver_Viewer/dist:/var/lib/opencloud/web/assets/apps/archive-viewer:ro
      # replaces the upstream apps.yaml mount (same target path)
      - ./custom/apps.yaml:/etc/opencloud/apps.yaml
```

`custom/apps.yaml` = upstream `config/opencloud/apps.yaml` (the `maps` entry) plus:

```yaml
archive-viewer:
  config: {} # e.g. maxArchiveSize: 1000 to test the "too large" message (non-ZIP)
```

Changing the overlay's volumes needs `sudo docker compose up -d` (recreate); config/app changes
need `sudo docker compose restart opencloud`.

`config/opencloud/apps/archive-viewer/` is pre-created (as the user) as the mount point.
`/etc/hosts` needs `127.0.0.1 cloud.opencloud.test`.

**Dev only:** demo users, `admin`/`admin`, basic auth and self-signed TLS must never be used on a
public server.

## Commands

The user isn't in the `docker` group, and `sudo` can't prompt from Claude's `!` shell, so Docker
commands run in a **normal terminal**. To share output, tee it into a file Claude can read:

```
cd ~/Projects/OpenCloud/opencloud-compose
sudo docker compose config --quiet                     # validate
sudo docker compose up -d                              # start
sudo docker compose logs --tail 60 opencloud 2>&1 | tee ~/Projects/OpenCloud/docker-output.log
sudo docker compose restart opencloud                  # after every app rebuild
sudo docker compose down                               # stop (add -v to wipe data)
```

Dev loop: `pnpm build` in `Acrchiver_Viewer` → `sudo docker compose restart opencloud` → reload
the browser. OpenCloud only discovers apps and reads `apps.yaml` at startup. Build before the
first `up` so `dist/` exists.

## Test fixtures

`~/Projects/OpenCloud/test-fixtures/make-fixtures.sh` (Python stdlib) writes `sample.zip`,
`sample.tar`, `sample.tar.gz`, `sample.tgz` (same content: nested `docs/deep/deeper/`, text files,
PNG + SVG, `binary.bin`, an empty folder, `folder with spaces/Ünïcödé file.txt`, a >100-character
path (pax long name), and the hostile name `x" onmouseover="alert(1)".txt`) plus `large.zip`
(~6 MB of random data, to see the download progress). Step 4 added `sample.tar.bz2`,
`sample.tbz2`, `notes.txt.gz` (original name stored in the gzip header), `data.json.bz2`,
`archive-in-disguise.gz` (a tarball gzipped without `.tar`) and `large.tar.bz2` (~6 MB, for the
worker / "Decompressing…" check). Step 4b added `sample.tar.xz` (-9e), `sample.txz`, `sample.tar.lzma`,
`notes.txt.xz`, `data.json.lzma`, `filters-x86.bin.xz` (BCJ x86 + LZMA2) and `large.tar.xz` (~6 MB);
all pass `xz -t`. Upload (needs basic auth enabled):

```
curl -sk -u admin:admin -T sample.zip https://cloud.opencloud.test/remote.php/webdav/sample.zip
```

## Automated checks (no sudo needed)

```
curl -sk https://cloud.opencloud.test/status.php              # productversion 8.0.1, edition rolling
curl -sk https://cloud.opencloud.test/config.json             # external_apps contains archive-viewer
curl -sk https://cloud.opencloud.test/assets/apps/archive-viewer/manifest.json
curl -sk -D - -o /dev/null https://cloud.opencloud.test/      # Content-Security-Policy header
```

## Browser checklist

1. `https://cloud.opencloud.test`, accept the certificate warning, log in `admin` / `admin`.
2. Personal files shows the fixtures.
3. Right-click an archive → "Open in Archive Viewer" → file table (folders first).
4. Navigate folders + breadcrumb; empty folder message; search (e.g. `config` → shows
   `docs/deep/deeper`); sort by each column.
5. Preview txt/md/json/yaml, PNG, SVG; `binary.bin` → "No preview".
6. Download one file; select folders → "Download selected (n)" → `<archive>-selection.zip`.
7. Hostile file name shows as plain text (no popup on hover).
8. `large.zip` shows "Downloading… N%" first; `large.tar.bz2` then shows "Decompressing…" while
   the page stays responsive (bzip2 worker). `notes.txt.gz` → one entry `notes.txt`;
   `archive-in-disguise.gz` → folder tree.
9. F5 on the viewer page renders it again; F12 console has no CSP / WebAssembly errors.
10. Too-large path: set `maxArchiveSize: 1000` in `custom/apps.yaml`, restart → message + working
    "Download archive" for a non-ZIP (ZIPs have no archive limit); then restore `{}` and restart.

## Large-ZIP test and cleanup (step 5)

`test-fixtures/make-fixtures.sh --large-zip` writes **only** `big-test.zip` (~3 GiB, ZIP64) and
`big-test.sha256`; a normal run never creates them. Upload with
`curl -sk -u admin:admin -T big-test.zip https://cloud.opencloud.test/remote.php/webdav/big-test.zip`.
Public test links: OCS `POST /ocs/v2.php/apps/files_sharing/api/v1/shares` with `shareType=3`,
`permissions=1` and a password (the stack enforces one).

Afterwards remove every copy so large files don't accumulate:

1. Links: OCS `DELETE …/shares/<id>`; `GET …/shares` should list none.
2. Server: WebDAV `DELETE /remote.php/webdav/big-test.zip` (→ 204; `PROPFIND` then 404).
3. Trash: personal space id from `GET /graph/v1.0/me/drives?$filter=driveType eq personal`;
   `PROPFIND /remote.php/dav/spaces/trash-bin/<space>` lists items; `DELETE` the item's href.
4. Local: delete `big-test.zip`, `big-test.sha256` and test downloads in `~/Downloads`.

Screenshots: Firefox `Ctrl+Shift+S` → Download (`~/Downloads`), or Print Screen
(`~/Pictures/Screenshots`); Claude can read both.

## Step 2 results (2026-10-25)

- Server reported OpenCloud 8.0.1 rolling; HTTP→HTTPS redirect worked.
- `/config.json` listed `archive-viewer` 0.1.0 with the current entrypoint; manifest and
  entrypoint served (`text/javascript`).
- Fixtures uploaded (201). `sample.zip` (584 B) and `sample.tar` (10 kB) opened in the viewer.
- `sample.tar.gz` initially had **no** "Open in Archive Viewer": OpenCloud reports its extension
  as `tar.gz`. Fixed by registering `tar.gz`, `tar.bz2`, `tar.xz`; after rebuild + restart it
  opens.
- Reloading the viewer page (F5) renders it again (direct-URL load works).
- Production CSP observed: `worker-src 'self' blob:`; `script-src 'self' 'unsafe-inline'
https://keycloak.opencloud.test/` — no `'wasm-unsafe-eval'`, so WebAssembly is blocked.

## Step 3 results (2026-10-25)

- Archives opened in the real viewer on 8.0.1; downloads verified **byte-for-byte** against the
  fixtures: `readme.txt` = `big/readme.txt` from `large.zip`; `sample-selection.zip` passed its CRC
  check and all 10 files matched the originals (paths, Unicode name, 115-character path and
  `binary.bin` intact). The selection zip contains files only (empty folders are skipped).
- Browser console while using the viewer: only OpenCloud's own messages (auth context, version
  banner "OpenCloud Web UI 8.0.0 / OpenCloud 8.0.1 rolling", an informational note that
  `frame-ancestors` overrides `x-frame-options`). **No errors, no CSP or WebAssembly blocks**, no
  output from the app.
- Size limit: with `maxArchiveSize: 1000` in `custom/apps.yaml`, `/config.json` served
  `{maxArchiveSize: 1000, maxUncompressedSize: 1073741824}` (apps.yaml merged over the manifest
  defaults) and the viewer showed the "larger than" message instead of downloading. Restored to
  `config: {}` afterwards.

## Step 4 results (2026-10-25)

- After a restart, `/config.json` served the step 4 build and the default limits again (an earlier
  restart had not happened, so OpenCloud was still on the step 3 build with `maxArchiveSize: 1000`
  — always confirm with the `config.json` check after restarting).
- In-viewer downloads verified byte-for-byte: `large.tar.bz2` → selection zip (CRC OK, 4 × 1.5 MB
  random files + readme identical) via the **bzip2 worker**; `notes.txt` from `notes.txt.gz`
  (name taken from the gzip header); `data.json` from `data.json.bz2`; `notes.md` and the hostile
  file (saved by the browser as `x_ onmouseover=_alert(1)_.txt`, content identical).
- `archive-in-disguise.gz` opened as a folder tree.
- Console during all of the above: only OpenCloud's own auth/version messages — no errors, no CSP,
  worker or WebAssembly problems (the bzip2 `blob:` worker is accepted by the production CSP).
- Found and fixed: selection zip was named `large.tar.bz2-selection.zip`; now `large-selection.zip`.

## Step 4b results (2026-10-25)

- Confirmed via `/config.json` that the step 4b build was live before testing.
- Opened in the viewer (screenshots): `sample.tar.xz` (full tree; the hostile file name shows as
  plain text), `sample.tar.lzma`, `notes.txt.xz`, `data.json.lzma` (preview window shows the JSON),
  `filters-x86.bin.xz`.
- In-viewer downloads verified byte-for-byte: `notes.txt` (xz), `data.json` (legacy lzma),
  `filters-x86.bin` (BCJ x86 + LZMA2, 26,384 B), and three selection zips from `large.tar.xz` (CRC
  OK; full `big/` twice and a 3-file selection, all identical).
- Console: only OpenCloud's own messages — an SSE reconnect right after the restart, a 404 for the
  admin's (missing) avatar, token refresh and the known `frame-ancestors` note. Nothing from the app.

## Troubleshooting

- `sudo: a terminal is required` → run the command in a normal terminal, not via `!`.
- App missing from `external_apps` → `dist/manifest.json` missing (build first), wrong mount path,
  or OpenCloud not restarted.
- Old app version in the browser → restart OpenCloud, then hard-reload (Ctrl+Shift+R).
- Container keeps restarting → `INITIAL_ADMIN_PASSWORD` must be set before the first start;
  `sudo docker compose down -v` resets the data.

## Step 5 results (2026-10-25)

- `/config.json` served the step 5 build with all six limit keys. `big-test.zip` (3.04 GiB)
  opened by range; the 200 MiB download matched its SHA-256, the `small` selection zip held all
  3,000 files intact, over-cap file and selection were refused, mobile emulation applied the
  256 MiB limits, and password-protected public links worked. Full list:
  [zip-range-reading](../source/zip-range-reading.md).
- Cleanup confirmed: test links gone, server file 404, trash empty, local and downloaded copies
  deleted.

## Step 6 results (2026-10-25)

- `/config.json` served the translated build. With OpenCloud set to Deutsch, Español and
  Français in turn: app name in "Open in…", table headers, search, "Download selected", result
  count (singular/plural), preview buttons and the unsupported-format message all appeared
  translated (checked by the user); switched back to English afterwards.
- `pnpm l10n:extract` with GNU gettext installed: `template.pot` unchanged, `.po` files only
  re-wrapped by `msgmerge`, compiled translations identical.
