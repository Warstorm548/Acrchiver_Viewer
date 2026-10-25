// Removes what the suite generated, on the server (incl. trash) and locally.
import { rmSync } from 'node:fs'
import { GENERATED, MOBILE_OVER_ARCHIVE, MOBILE_OVER_UNCOMPRESSED } from './env'
import { removeCompletely, setLanguage } from './helpers/server'

export default async () => {
  await removeCompletely(MOBILE_OVER_ARCHIVE)
  await removeCompletely(MOBILE_OVER_UNCOMPRESSED)
  rmSync(GENERATED, { recursive: true, force: true })
  // in case the translation spec was interrupted
  await setLanguage('en')
}
