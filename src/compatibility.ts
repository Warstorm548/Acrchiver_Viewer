import { watch } from 'vue'
import { version as appVersion } from '../package.json'

/**
 * OpenCloud versions this release is tested on. Exact versions on purpose: the viewer refuses to
 * run on anything else, so an untested OpenCloud upgrade can't break it half-way. Supporting a new
 * version means adding it here in a new release (and noting it in ArchiveViewerChangelog.md).
 */
export const SUPPORTED_OPENCLOUD_VERSIONS = ['8.0.1']

/** `apps.yaml` key that lets an admin run the viewer on an unsupported version anyway. */
export const OVERRIDE_KEY = 'allowUnsupportedOpenCloud'

/** How long to wait for OpenCloud's capabilities before treating the version as unknown. */
export const CAPABILITIES_TIMEOUT_MS = 10_000

interface CapabilityStoreLike {
  isInitialized: boolean
  status?: { productversion?: string }
}

/**
 * The server version, waiting for the capabilities if needed: OpenCloud loads them in parallel
 * with the apps. Resolves `undefined` after the timeout. Only `productversion` is used; `version`
 * and `versionstring` hold a legacy ownCloud number (10.x).
 */
export const waitForProductVersion = (
  store: CapabilityStoreLike,
  timeout = CAPABILITIES_TIMEOUT_MS
): Promise<string | undefined> => {
  if (store.isInitialized) {
    return Promise.resolve(store.status?.productversion)
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop()
      resolve(undefined)
    }, timeout)
    const stop = watch(
      () => store.isInitialized,
      (initialized) => {
        if (initialized) {
          clearTimeout(timer)
          stop()
          resolve(store.status?.productversion)
        }
      }
    )
  })
}

/** `8.0.1+abc123` → `8.0.1`, as OpenCloud itself does; anything without X.Y.Z → `null`. */
export const normalizeVersion = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.split('+')[0].trim())
  return match ? match.slice(1).join('.') : null
}

export const isOverrideEnabled = (config: Record<string, unknown> | undefined): boolean => {
  const value = config?.[OVERRIDE_KEY]
  return value === true || value === 'true'
}

export interface Compatibility {
  supported: boolean
  overridden: boolean
  serverVersion: string | null
  message: string
}

export const checkCompatibility = ({
  productVersion,
  config
}: {
  productVersion: unknown
  config: Record<string, unknown> | undefined
}): Compatibility => {
  const serverVersion = normalizeVersion(productVersion)
  const supported = serverVersion !== null && SUPPORTED_OPENCLOUD_VERSIONS.includes(serverVersion)
  const overridden = !supported && isOverrideEnabled(config)
  const message = supported
    ? ''
    : `Archive Viewer ${appVersion} supports OpenCloud ${SUPPORTED_OPENCLOUD_VERSIONS.join(', ')}; ` +
      `this server runs ${serverVersion ?? 'an unknown version'}. ` +
      (overridden
        ? `Running anyway because ${OVERRIDE_KEY} is set in apps.yaml.`
        : `Set ${OVERRIDE_KEY}: true in apps.yaml to run it anyway.`)
  return { supported, overridden, serverVersion, message }
}
