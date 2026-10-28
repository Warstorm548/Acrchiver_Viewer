// Checks that the stack serves the build in dist/, then uploads the fixtures (overwriting, so the
// server's copies always equal the local ones) and the generated limit-test archives.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DIST_MANIFEST,
  FIXTURES,
  GENERATED,
  MOBILE_OVER_ARCHIVE,
  MOBILE_OVER_UNCOMPRESSED
} from './env'
import { writeZeroTar } from './helpers/generate'
import { getJson, upload } from './helpers/server'

const MiB = 1024 * 1024
const FIXTURE = /\.(zip|7z|tar|gz|tgz|bz2|tbz2|xz|txz|lzma)$/

export default async () => {
  const status = await getJson<{ productversion: string }>('/status.php')
  if (status.productversion !== '8.0.1') {
    throw new Error(`The stack runs OpenCloud ${status.productversion}; the suite expects 8.0.1`)
  }

  const built = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8')).version
  const config = await getJson<{ external_apps?: { id: string; version: string }[] }>(
    '/config.json'
  )
  const served = config.external_apps?.find((app) => app.id === 'archive-viewer')?.version
  if (served !== built) {
    throw new Error(
      `OpenCloud serves archive-viewer ${served ?? '(none)'} but dist/ holds ${built}: ` +
        'run `pnpm build`, then `sudo docker compose restart opencloud`'
    )
  }

  if (!existsSync(FIXTURES)) {
    throw new Error(`Fixtures not found in ${FIXTURES} (run make-fixtures.sh or set E2E_FIXTURES)`)
  }
  for (const name of readdirSync(FIXTURES)) {
    if (FIXTURE.test(name) && !name.startsWith('big-test')) {
      await upload(join(FIXTURES, name))
    }
  }

  mkdirSync(GENERATED, { recursive: true })
  const overArchive = join(GENERATED, MOBILE_OVER_ARCHIVE)
  const overUncompressed = join(GENERATED, MOBILE_OVER_UNCOMPRESSED)
  // over the 128 MiB mobile archive limit; over the 384 MiB mobile decompressed limit (tiny file)
  await writeZeroTar(overArchive, 130 * MiB)
  await writeZeroTar(overUncompressed, 400 * MiB, true)
  await upload(overArchive)
  await upload(overUncompressed)
}
