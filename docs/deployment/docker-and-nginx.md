# Docker and nginx

## `Dockerfile` (multi-stage)

1. **builder** `node:20-alpine`: `npm install -g pnpm@9.0.0`; copy `package.json` and
   `pnpm-lock.yaml*`; `pnpm install --frozen-lockfile`; copy source; `pnpm build`.
2. **runtime** `nginx:alpine`: copy `/app/dist` → `/usr/share/nginx/html/archive-viewer`; copy
   `nginx.conf` → `/etc/nginx/conf.d/default.conf`; `EXPOSE 80`; `HEALTHCHECK` with
   `wget --spider http://localhost/`; `nginx -g 'daemon off;'`.

Problems:
- No lockfile in the repo → `pnpm install --frozen-lockfile` fails, so the image never builds.
- `pnpm build` runs **webpack** (legacy app), whose config currently fails to load; even if fixed,
  the image would ship the legacy app, not the OpenCloud Vue extension.
- No `.dockerignore`, so `COPY . .` includes `.git`, `node_modules`, etc.

## `docker-compose.yml`

- Service `archive-viewer`, `build: .`, image `opencloud/web-app-archive-viewer:1.0.0`,
  `container_name: archive-viewer`, `restart: unless-stopped`, port `8080:80`.
- Named volume `archive-viewer-data` mounted at `/usr/share/nginx/html/archive-viewer`.
  Docker fills a new named volume from the image once; afterwards the volume **hides newer
  image contents**, so rebuilt versions are never served until the volume is removed.
- Network `opencloud-net` declared `external: true` — must already exist or `up` fails.
- `version: '3.8'` key is obsolete in Compose v2 (warning only).
- Image name uses the `opencloud/` namespace.

## `nginx.conf`

- `listen 80`, `root /usr/share/nginx/html`, gzip for text/JS/JSON/CSS.
- Headers: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`,
  `X-XSS-Protection 1; mode=block` (deprecated header).
- `location /archive-viewer/`: `alias` + `try_files $uri $uri/ /archive-viewer/index.html`.
  - `dist/` from webpack contains no `index.html`, so the SPA fallback 404s.
  - Nested `location ~* \.(js|css|...)$` sets `expires 1y` + `Cache-Control: public, immutable`.
    Output filenames aren't content-hashed (`app.js`), so clients keep old code after upgrades.
  - Because the nested block has its own `add_header`, nginx **drops the server-level security
    headers** for those assets.
  - Regex location nested under an `alias` location is a known nginx pitfall for path resolution
    (**verify** assets resolve correctly).
- `location /`: `try_files $uri $uri/ /index.html` — serves nginx's default welcome page.
- `error_page 404 /404.html` and `50x.html` — neither file is shipped (nginx:alpine does include a
  default `50x.html`).

## Relation to OpenCloud

OpenCloud Web loads extensions from its own web assets/apps directory (configured on the
OpenCloud side). Running this as a separate nginx container on port 8080 does not by itself
register the app with OpenCloud; how the two are meant to be connected is not documented
in the repo (**open question**).

## When changing deployment

Update this file and [install-script](install-script.md).
