# Install Script — `install.sh`

Interactive bash script (`set -e`), 146 lines.

## Flow

1. Banner; warn if run as root.
2. Require `pnpm` and `node` on `PATH`, else exit 1.
3. `pnpm install --frozen-lockfile` — **fails**: no `pnpm-lock.yaml` in the repo.
4. `pnpm build` — runs webpack (legacy app); config currently fails to load.
5. Prompt for apps dir (default `/var/lib/opencloud/apps`); `mkdir -p` it.
6. Target `$APPS_DIR/archive-viewer`; if it exists, ask to overwrite, then `rm -rf` it.
7. `cp -r dist "$APP_DEST"`; `chmod -R 755` (makes every file executable).
8. Print a "manual step" JSON snippet (`{"apps":[{"id":"archive-viewer","path":...}]}`) to add to
   an OpenCloud `config.json` — this format is not verified against OpenCloud's actual config.
9. Optionally `docker build -t warstorm548/web-app-archive-viewer:1.0.0 .` and
   `docker-compose up -d` (v1 CLI name; Compose v2 is `docker compose`).
10. Print next steps and the project repo URL.

## Issues

- The `if [ $? -ne 0 ]` checks after each command are unreachable because `set -e` already exits.
- Writing to `/var/lib/opencloud/apps` usually needs root, but the script discourages root and
  doesn't use `sudo`.
- `rm -rf "$APP_DEST"` after a single-key confirmation; `APP_DEST` is always
  `<dir>/archive-viewer`, so it can't wipe the parent, but an empty input path still resolves to
  the default.
- Installs the legacy webpack output, not the Vue extension.

## When changing installation

Update this file, [docker-and-nginx](docker-and-nginx.md) and the original install docs in
`docs/original-docs/` if they are kept.
