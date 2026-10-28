# Deploying the Archive Helper

How to add the optional archive helper ([overview](../source/archive-helper/overview.md)) to an
opencloud-compose stack: the main server and the local stack
([local-dev-environment](local-dev-environment.md)). Everything lives in git-ignored files
(`custom/`, `.env`, `./archive-temp`), so `git pull` of opencloud-compose and OpenCloud image
updates don't touch it. Docker commands need sudo; run them in your own terminal.

## Files

| Repo file                           | Goes to (opencloud-compose)                   | Purpose                                                                |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `deploy/compose/archive-helper.yml` | `custom/archive-helper.yml`                   | The `archive-helper` service + proxy mount                             |
| `deploy/compose/proxy.yaml`         | `custom/proxy.yaml`                           | Upstream `config/opencloud/proxy.yaml` + the two `/archive-api` routes |
| `deploy/env.example`                | lines in `.env` (only what you change)        | Settings with defaults                                                 |
| `server/`                           | built by compose (`ARCHIVE_HELPER_BUILD_DIR`) | The helper's source                                                    |

## Install

1. Have the Archive Viewer repo next to opencloud-compose (default build path
   `../Acrchiver_Viewer/server`), or set `ARCHIVE_HELPER_BUILD_DIR` in `.env`.
2. **Check for an existing proxy config first.** `deploy/compose/proxy.yaml` is upstream's
   `config/opencloud/proxy.yaml` plus our two routes, and it is mounted over
   `/etc/opencloud/proxy.yaml`. If the server already customizes the proxy (its own
   `proxy.yaml`, e.g. OIDC role mappings or extra routes; check `COMPOSE_FILE` overlays and
   `custom/` for another mount of that path), do **not** copy ours: add the marked
   "Archive Viewer helper" route block to the existing file instead, and make sure only one file
   is mounted at that path.
3. In the opencloud-compose folder (leave out `proxy.yaml` if you merged it in step 2):
   ```
   cp ../Acrchiver_Viewer/deploy/compose/archive-helper.yml ../Acrchiver_Viewer/deploy/compose/proxy.yaml custom/
   mkdir ./archive-temp
   sudo chown 1500:1500 ./archive-temp
   printf '\n/archive-temp/\n' >> .git/info/exclude    # keep it out of git, locally
   ```
4. In `.env`, append `:custom/archive-helper.yml` to `COMPOSE_FILE`, e.g.
   `COMPOSE_FILE=docker-compose.yml:traefik/opencloud.yml:custom/archive-viewer.yml:custom/archive-helper.yml`
   (on the main server: whatever it has now, plus `:custom/archive-helper.yml`). Copy any setting
   you want to change from `deploy/env.example`.
5. Build and start (OpenCloud restarts once to load the new `proxy.yaml`):
   ```
   sudo docker compose build archive-helper
   sudo docker compose up -d
   sudo docker compose logs archive-helper
   ```
   The log ends with `archive-helper started version=… maxStorage=…`.
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

`git pull` the Archive Viewer repo, then `sudo docker compose build archive-helper && sudo docker compose up -d archive-helper`.
0.4.0 (7z and large ZIPs) needs no new settings; rebuild the helper together with the new viewer
build, since the viewer only sends ZIPs and 7z to a helper that reads them.

## Troubleshooting

| Symptom                                                  | Cause / fix                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large archives still show "larger than … in the browser" | Helper not reachable: `sudo docker compose ps`, logs; `/archive-api/health` must return JSON, not the web page (proxy.yaml not mounted → restart opencloud) |
| Helper keeps restarting                                  | Log line names the problem: settings (`invalid settings: …`) or temp folder owner                                                                           |
| "Server busy…" although nobody uses it                   | Disk full (the real free space is checked too) or caps set too low                                                                                          |
| `502` from `/archive-api/…`                              | Helper container stopped                                                                                                                                    |

## Removing it

Remove `:custom/archive-helper.yml` from `COMPOSE_FILE`, `sudo docker compose up -d --remove-orphans`;
optionally delete `custom/archive-helper.yml`, `custom/proxy.yaml` and `./archive-temp`. The
viewer falls back to browser mode by itself. To turn it off without removing it, set
`archiveHelperUrl: ""` for `archive-viewer` in `apps.yaml`.
