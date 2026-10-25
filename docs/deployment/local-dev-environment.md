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
  test-fixtures/         # make-fixtures.sh + sample.zip / sample.tar / sample.tar.gz
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
```

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
`sample.tar`, `sample.tar.gz`, each with `README.txt`, `docs/notes.md`, `docs/deep/data.json`,
`images/pixel.png`. Upload (needs basic auth enabled):

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
3. Right-click an archive → "Open in Archive Viewer" → placeholder page with icon, name, size.
4. F5 on the viewer page renders it again.

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

## Troubleshooting

- `sudo: a terminal is required` → run the command in a normal terminal, not via `!`.
- App missing from `external_apps` → `dist/manifest.json` missing (build first), wrong mount path,
  or OpenCloud not restarted.
- Old app version in the browser → restart OpenCloud, then hard-reload (Ctrl+Shift+R).
- Container keeps restarting → `INITIAL_ADMIN_PASSWORD` must be set before the first start;
  `sudo docker compose down -v` resets the data.
