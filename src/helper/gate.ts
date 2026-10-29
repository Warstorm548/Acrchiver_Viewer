// Decides whether the optional archive helper may be used. The viewer is the part that always
// runs, so it holds the rules: a helper is used only when it answers in time, looks like the
// helper, has a version in SUPPORTED_HELPER and reports itself ready. Anything else leaves the
// viewer in browser mode; it checks again for the next opened archive, so a fixed helper is
// picked up without a reload.
import { normalizeVersion } from '../compatibility'
import { HelperClient, HelperError, HelperHealth } from './client'

/**
 * Helper versions this viewer works with: `min` up to (not including) `below`, i.e. `^0.5.0`.
 * The helper bumps its minor version for breaking API changes, so a new minor needs a viewer
 * release that has tested it (and moves this range).
 */
export const SUPPORTED_HELPER = { min: '0.5.0', below: '0.6.0' }
export const SUPPORTED_HELPER_RANGE = `^${SUPPORTED_HELPER.min}`

/** `apps.yaml` key that lets an admin use a helper outside SUPPORTED_HELPER anyway. */
export const HELPER_OVERRIDE_KEY = 'allowUnsupportedHelper'

/** How long the viewer waits for /health before going on without the helper. */
export const HEALTH_TIMEOUT_MS = 5_000

export type HelperCheck =
  | { usable: true; health: HelperHealth; detail?: string }
  | {
      usable: false
      /** `missing`: nothing answers as the helper; `misconfigured`: it answers but can't be used. */
      reason: 'missing' | 'misconfigured'
      detail: string
    }

/** Error codes meaning no helper answered: not installed, stopped, wrong port, no proxy route. */
const MISSING_CODES = new Set(['unreachable', 'not-a-helper', 'http-404', 'http-502', 'http-503'])

const compareVersions = (a: string, b: string): number => {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i]
    }
  }
  return 0
}

export const isSupportedHelperVersion = (version: string): boolean =>
  compareVersions(version, SUPPORTED_HELPER.min) >= 0 &&
  compareVersions(version, SUPPORTED_HELPER.below) < 0

export const isHelperOverrideEnabled = (config: Record<string, unknown> | undefined): boolean => {
  const value = config?.[HELPER_OVERRIDE_KEY]
  return value === true || value === 'true'
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Every field the viewer reads, so an answer from anything else isn't mistaken for the helper. */
const hasHealthShape = (value: unknown): value is HelperHealth => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const health = value as Record<string, unknown>
  const numbers = [
    'maxStorage',
    'maxStoragePerUser',
    'maxDownloadSize',
    'maxSelectionSize',
    'confirmDownloadSize',
    'maxDownloadsPerUser',
    'maxPreviewSize',
    'heartbeatSeconds',
    'sessionTimeoutSeconds'
  ]
  return (
    typeof health.version === 'string' &&
    typeof health.ready === 'boolean' &&
    isStringArray(health.features) &&
    isStringArray(health.problems) &&
    numbers.every((key) => typeof health[key] === 'number')
  )
}

export const checkHelper = async (
  client: HelperClient,
  config: Record<string, unknown> | undefined,
  timeout = HEALTH_TIMEOUT_MS
): Promise<HelperCheck> => {
  let answer: unknown
  try {
    answer = await client.health(AbortSignal.timeout(timeout))
  } catch (error) {
    if (error instanceof HelperError && MISSING_CODES.has(error.code)) {
      return {
        usable: false,
        reason: 'missing',
        detail: `no archive helper answered (${error.code})`
      }
    }
    const code = error instanceof HelperError ? error.code : String(error)
    return { usable: false, reason: 'misconfigured', detail: `the archive helper failed (${code})` }
  }
  if (!hasHealthShape(answer)) {
    // an old helper (before 0.5.0) has no ready/features fields
    const raw = (answer as { version?: unknown } | null)?.version
    const version = normalizeVersion(raw)
    return {
      usable: false,
      reason: 'misconfigured',
      detail:
        version && !isSupportedHelperVersion(version)
          ? `archive helper ${version} is not supported, this viewer needs ${SUPPORTED_HELPER_RANGE}`
          : 'unexpected answer from the archive helper'
    }
  }
  const version = normalizeVersion(answer.version)
  let detail: string | undefined
  if (!version || !isSupportedHelperVersion(version)) {
    const unsupported = `archive helper ${answer.version} is not supported, this viewer needs ${SUPPORTED_HELPER_RANGE}`
    if (!isHelperOverrideEnabled(config)) {
      return {
        usable: false,
        reason: 'misconfigured',
        detail: `${unsupported}; set ${HELPER_OVERRIDE_KEY}: true in apps.yaml to use it anyway`
      }
    }
    detail = `${unsupported}; using it anyway because ${HELPER_OVERRIDE_KEY} is set in apps.yaml`
  }
  if (!answer.ready) {
    return {
      usable: false,
      reason: 'misconfigured',
      detail: `the archive helper is not set up correctly (${answer.problems.join(', ') || 'not ready'})`
    }
  }
  return { usable: true, health: answer, detail }
}

/** The helper lists this feature (`format:<ArchiveFormat or 7z>`, `download:selection`). */
export const helperHasFeature = (health: HelperHealth, feature: string): boolean =>
  health.features.includes(feature)
