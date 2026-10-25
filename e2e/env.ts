// Settings for the end-to-end run against a local OpenCloud stack (see docs/testing/e2e.md).
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const repoRoot = resolve(import.meta.dirname, '..')

export const BASE_URL = (process.env.E2E_BASE_URL ?? 'https://cloud.opencloud.test').replace(
  /\/$/,
  ''
)
export const USER = process.env.E2E_USER ?? 'admin'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'admin'
/** Fixtures from `make-fixtures.sh`, outside the repo. */
export const FIXTURES = resolve(repoRoot, process.env.E2E_FIXTURES ?? '../test-fixtures')
/** Files the suite generates itself (deleted by the global teardown). */
export const GENERATED = resolve(tmpdir(), 'archive-viewer-e2e')
export const SKIP_LARGE = process.env.E2E_SKIP_LARGE === '1'
export const AUTH_STATE = resolve(repoRoot, 'e2e/.auth/admin.json')
export const DIST_MANIFEST = resolve(repoRoot, 'dist/manifest.json')

/** Server-side file names the suite generates for the mobile limit tests. */
export const MOBILE_OVER_ARCHIVE = 'e2e-mobile-130MiB.tar'
export const MOBILE_OVER_UNCOMPRESSED = 'e2e-mobile-400MiB.tar.gz'
