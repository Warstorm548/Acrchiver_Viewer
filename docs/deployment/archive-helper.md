# Deploying the Archive Helper

How to add the optional archive helper ([overview](../source/archive-helper/overview.md)) to an
opencloud-compose stack: the main server and the local stack
([local-dev-environment](local-dev-environment.md)). Everything lives in git-ignored files
(`custom/`, `.env`, `./archive-temp`), so `git pull` of opencloud-compose and OpenCloud image
updates don't touch it. Docker commands need sudo; run them in your own terminal.

## Files

| Release file / repo file                                        | Goes to (opencloud-compose)          | Purpose                                                                |
| --------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `archive-helper.yml` (`deploy/compose/`)                        | `custom/archive-helper.yml`          | The `archive-helper` service (published image) + proxy mount           |
| `proxy.yaml` (`deploy/compose/`)                                | `custom/proxy.yaml`                  | Upstream `config/opencloud/proxy.yaml` + the two `/archive-api` routes |
| `archive-helper.env.example` (`deploy/env.example`)             | lines in `.env` (the port + changes) | Settings: the required port, the rest with defaults                    |
| image `ghcr.io/warstorm548/archive-helper:<version>`            | pulled by compose                    | The helper, linux/amd64 and linux/arm64, built by the release workflow |
| `deploy/compose/archive-helper-build.yml` (repo only, optional) | `custom/archive-helper-build.yml`    | Builds from a clone instead (development)                              |

## Install

1. Download the compose files of the **helper release** you install (`helper-v…` releases; no
   clone of this repository needed; pick a version the installed viewer supports, see the
   compatibility table in `ArchiveViewerChangelog.md`), in the opencloud-compose folder:
   ```
   v=0.5.0; base=https://github.com/Warstorm548/Acrchiver_Viewer/releases/download/helper-v$v
   curl -fsSLO $base/archive-helper.yml -O $base/proxy.yaml -O $base/archive-helper.env.example
   ```
2. **Check for an existing proxy config first.** `deploy/compose/proxy.yaml` is upstream's
   `config/opencloud/proxy.yaml` plus our two routes, and it is mounted over
   `/etc/opencloud/proxy.yaml`. If the server already customizes the proxy (its own
   `proxy.yaml`, e.g. OIDC role mappings or extra routes; check `COMPOSE_FILE` overlays and
   `custom/` for another mount of that path), do **not** copy ours: add the marked
   "Archive Viewer helper" route block to the existing file instead, and make sure only one file
   is mounted at that path.
3. In the opencloud-compose folder (leave out `proxy.yaml` if you merged it in step 2):
   ```
   mv archive-helper.yml proxy.yaml custom/
   mkdir ./archive-temp
   sudo chown 1500:1500 ./archive-temp
   printf '\n/archive-temp/\n' >> .git/info/exclude    # keep it out of git, locally
   ```
4. In `.env`, append `:custom/archive-helper.yml` to `COMPOSE_FILE`, e.g.
   `COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml:custom/archive-viewer.yml:custom/archive-helper.yml`
   (on the main server: whatever it has now, plus `:custom/archive-helper.yml`). Add the
   **required** port, e.g. `ARCHIVE_HELPER_PORT=8080` (any number 1–65535; it exists only inside
   the Docker network, see [ports](ports.md)). Copy any other setting you want to change from
   `archive-helper.env.example`.
5. Pull and start (OpenCloud restarts once to load the new `proxy.yaml`):
   ```
   sudo docker compose pull archive-helper
   sudo docker compose up -d
   sudo docker compose logs archive-helper
   ```
   The log ends with `archive-helper started version=… addr=:<port> maxStorage=…`. Without the
   port it says `ARCHIVE_HELPER_PORT is not set in .env` and the helper keeps restarting until it
   is set; OpenCloud is not affected and the viewer stays in browser mode.
6. Check: open an archive over the browser limit in the viewer; it shows "Preparing the archive
   on the server…", and a file `ah-….archive` appears in `./archive-temp` while it is open.

The temp folder **must start with `./`** (inside the opencloud-compose folder, never the root of
the system); to use another disk, point `ARCHIVE_HELPER_TEMP_DIR` at a folder there.

## Changing settings or the user ID

- Limits: edit `.env`, then `sudo docker compose up -d archive-helper` (only the helper restarts;
  open archives are closed and their temp files removed).
- User ID (`ARCHIVE_HELPER_UID_GID`, default `1500:1500`, shared with no other container):
  edit `.env`, `sudo chown -R <uid>:<gid> ./archive-temp`, `sudo docker compose up -d archive-helper`.
  If the folder isn't writable the helper **refuses to start** and logs
  `temp folder … is not writable by uid … run: sudo chown -R …`; the viewer then stays in browser
  mode.
- Port (`ARCHIVE_HELPER_PORT`, **required** since 0.5.0, no default): the port the helper
  listens on **inside the Docker network**. It is never published on the server, so it can't
  clash with ports in use there ([ports](ports.md)). `.env` is the only place it is set: the
  helper listens on it and OpenCloud's proxy reads it (`custom/proxy.yaml` uses
  `${ARCHIVE_HELPER_PORT}`, which `archive-helper.yml` passes into the `opencloud` container). To
  change it, edit `.env` and run `sudo docker compose up -d` (helper and OpenCloud restart). A
  missing value stops the helper with `ARCHIVE_HELPER_PORT is not set in .env`, an invalid one
  with `invalid settings: ARCHIVE_HELPER_ADDR: …`. Setting `ARCHIVE_HELPER_ADDR` to a loopback
  host (`127.0.0.1:…`) logs a warning: the proxy can't reach it.

## Optional: a hard size limit from the operating system

Docker can't limit a folder's size ([storage-limits](../source/archive-helper/storage-limits.md));
the helper's caps are enforced in its code. For a guarantee, mount a dedicated fixed-size
partition or disk at the temp folder (or point `ARCHIVE_HELPER_TEMP_DIR` at one) a bit larger
than `ARCHIVE_HELPER_MAX_STORAGE`.

## After updating opencloud-compose or OpenCloud

1. `diff config/opencloud/proxy.yaml custom/proxy.yaml` — only the marked Archive Viewer block
   and its header comment should differ; copy any other upstream change into `custom/proxy.yaml`
   (and into `deploy/compose/proxy.yaml` in the repo). Same for
   `diff config/opencloud/apps.yaml custom/apps.yaml` if you use it.
2. If you enable **yjs** later: `yjs/yjs.yml` mounts upstream `proxy.yaml` at the same path;
   list `custom/archive-helper.yml` **after** it in `COMPOSE_FILE` so our copy (which keeps the
   `/yjs` route) wins.
3. On a new OpenCloud version, re-test login forwarding: open a large archive in the viewer (or
   `curl -u user:pass https://<domain>/archive-api/health` where basic auth is enabled → JSON;
   without login → 401).

## Updating the helper

The helper has its own version since 0.5.0. Install a version the viewer supports (the
compatibility table in `ArchiveViewerChangelog.md`; a viewer 0.5.x uses helpers `^0.5.0`). A
helper outside that range is ignored and the viewer stays in browser mode, which the browser
console explains (`allowUnsupportedHelper: true` in `apps.yaml` overrides it, for testing).

```
sed -i 's/^ARCHIVE_HELPER_TAG=.*/ARCHIVE_HELPER_TAG=0.5.0/' .env   # or edit .env by hand
sudo docker compose pull archive-helper && sudo docker compose up -d archive-helper
```

Compare the release's `archive-helper.yml`, `proxy.yaml` and `archive-helper.env.example` with
your copies for new settings. **From 0.4.x to 0.5.0:** add `ARCHIVE_HELPER_PORT` to `.env` (use
8080 to keep the old port), replace `custom/archive-helper.yml` and `custom/proxy.yaml` with the
0.5.0 files (or, with a merged `proxy.yaml`, change both archive-helper backends to
`http://archive-helper:${ARCHIVE_HELPER_PORT}`), then `sudo docker compose up -d`. **From 0.3.x**
(built from a clone): the same, the new `archive-helper.yml` pulls the image instead; the clone is
then no longer needed. To keep building from source (development), clone the repository as
`Archive_Viewer` next to opencloud-compose
(`git clone https://github.com/Warstorm548/Acrchiver_Viewer.git Archive_Viewer`, or set
`ARCHIVE_HELPER_BUILD_DIR`), copy `deploy/compose/archive-helper-build.yml` to `custom/`, add
`:custom/archive-helper-build.yml` after `:custom/archive-helper.yml` in `COMPOSE_FILE`, and use
`sudo docker compose build archive-helper && sudo docker compose up -d archive-helper`.

## Existing setups and your own domain

The domain doesn't matter: the viewer calls the helper at `/archive-api` on the **same domain**
OpenCloud is served from (a relative path), and OpenCloud's own proxy forwards it to the helper
inside the compose network. Nothing needs a DNS name, certificate or published port of its own.
Check these on an existing server:

- **Own `proxy.yaml`** (OIDC role mappings, extra routes): merge our route block into it instead
  of copying ours (install step 2).
- **External reverse proxy** (`external-proxy/…` instead of Traefik, e.g. your own nginx): it
  must forward `/archive-api/` to OpenCloud like every other path. Large downloads are streamed,
  so a proxy that limits response size or buffers to a small disk needs room for
  `/archive-api/download/`.
- **Network name:** the compose file joins `opencloud-net`, the network opencloud-compose
  creates; a renamed network must be changed in `custom/archive-helper.yml`.
- **Not opencloud-compose** (plain binary, Kubernetes): run the same image, set
  `ARCHIVE_HELPER_OPENCLOUD_URL` to OpenCloud's internal address, and add the two `/archive-api`
  routes from `proxy.yaml` to OpenCloud's proxy config; these docs only cover opencloud-compose.

## Troubleshooting

| Symptom                                                  | Cause / fix                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large archives still show "larger than … in the browser" | Helper not reachable: `sudo docker compose ps`, logs; `/archive-api/health` must return JSON, not the web page (proxy.yaml not mounted → restart opencloud)    |
| "…installed but not set up correctly"                    | The browser console (F12) names the reason: unsupported helper version, `temp-not-writable`, `opencloud-unreachable` (`ARCHIVE_HELPER_OPENCLOUD_URL`), timeout |
| Helper keeps restarting                                  | Log line names the problem: `ARCHIVE_HELPER_PORT is not set in .env`, other settings (`invalid settings: …`) or temp folder owner                              |
| "Server busy…" although nobody uses it                   | Disk full (the real free space is checked too) or caps set too low                                                                                             |
| `502` from `/archive-api/…`                              | Helper container stopped or without a port, or an old `custom/proxy.yaml` with a fixed port in its backends (use `${ARCHIVE_HELPER_PORT}`)                     |

## Removing it

Remove `:custom/archive-helper.yml` from `COMPOSE_FILE`, `sudo docker compose up -d --remove-orphans`;
optionally delete `custom/archive-helper.yml`, `custom/proxy.yaml` and `./archive-temp`. The
viewer falls back to browser mode by itself. To turn it off without removing it, set
`archiveHelperUrl: ""` for `archive-viewer` in `apps.yaml`.
