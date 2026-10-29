# Ports

Which ports an opencloud-compose stack with the Archive Viewer uses, which of them can clash with
other services on the server, and how to change them. Only **published** ports (bound on the
host) can clash; ports inside the Docker network belong to one container each.

| Port                                        | Who                      | Where it is set                                     | Published on the host |
| ------------------------------------------- | ------------------------ | --------------------------------------------------- | --------------------- |
| 80 (HTTP), 443 (HTTPS)                      | Traefik (the front door) | `TRAEFIK_PORT_HTTP`, `TRAEFIK_PORT_HTTPS` in `.env` | **yes**               |
| 9200 and other internal ports               | OpenCloud                | opencloud-compose (fixed)                           | no                    |
| `ARCHIVE_HELPER_PORT` (required, e.g. 8080) | Archive helper           | `.env` (only there)                                 | no                    |

The viewer itself has no port: it runs in the browser and calls the helper at `/archive-api` on
the same domain as OpenCloud, which OpenCloud's proxy forwards to `archive-helper:<port>`.

## The helper's port

`ARCHIVE_HELPER_PORT` is required since 0.5.0 and has no default. It is the only place the port
is set: `custom/archive-helper.yml` turns it into the helper's `ARCHIVE_HELPER_ADDR` (`:<port>`)
and passes it to the `opencloud` container, whose `custom/proxy.yaml` uses
`http://archive-helper:${ARCHIVE_HELPER_PORT}` (OpenCloud expands `${…}` when it loads the file).
After a change: `sudo docker compose up -d` (helper and OpenCloud restart).

Because the port is never published and the helper has its own network namespace, it can't
clash with port 80, 8080 or anything else running on the server; any number from 1 to 65535
works. Without it only the helper refuses to start (`ARCHIVE_HELPER_PORT is not set in .env`);
OpenCloud runs normally, `/archive-api` answers 502 and the viewer stays in browser mode.

## Port 80 / 443 already in use

These belong to Traefik from opencloud-compose, not to the Archive Viewer. If another program on
the server already uses them, either:

- **Move Traefik:** set e.g. `TRAEFIK_PORT_HTTP=4080` and `TRAEFIK_PORT_HTTPS=4443` in `.env`,
  then `sudo docker compose up -d`. Things to know:
  - **Certificates:** Traefik gets Let's Encrypt certificates with the HTTP challenge
    (`httpChallenge.entryPoint=http`), and Let's Encrypt always connects on port **80**. If
    Traefik no longer owns port 80, renewals fail unless whatever owns port 80 forwards
    `/.well-known/acme-challenge/` to Traefik's HTTP port (or you use your own certificates).
  - **URL:** an HTTPS port other than 443 becomes part of the address: `OC_URL` turns into
    `https://<domain>:4443`, and users must use that.
  - **Avoid** ports 8000–9999 and 5232 (opencloud-compose's `.env` warns they are used
    internally).
- **Use the existing web server as the front door:** opencloud-compose's `external-proxy/`
  overlays replace Traefik (e.g. `external-proxy/opencloud.yml` in `COMPOSE_FILE` instead of
  `traefik/opencloud.yml`), and your nginx/Apache forwards the domain to OpenCloud. It must also
  forward `/archive-api/` like every other path (see
  [archive-helper](archive-helper.md#existing-setups-and-your-own-domain)).

## When changing ports

Update [archive-helper](archive-helper.md) (settings, troubleshooting), `deploy/env.example`,
`deploy/compose/archive-helper.yml` / `proxy.yaml` and the helper's changelog.
