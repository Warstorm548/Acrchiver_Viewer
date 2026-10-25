import { reactive } from 'vue'
import {
  checkCompatibility,
  isOverrideEnabled,
  normalizeVersion,
  SUPPORTED_OPENCLOUD_VERSIONS,
  waitForProductVersion
} from '../../src/compatibility'
import { version } from '../../package.json'

describe('normalizeVersion', () => {
  it('keeps X.Y.Z and strips build info', () => {
    expect(normalizeVersion('8.0.1')).toBe('8.0.1')
    expect(normalizeVersion('8.0.1+abc123')).toBe('8.0.1')
  })

  it('rejects anything else', () => {
    expect(normalizeVersion(undefined)).toBeNull()
    expect(normalizeVersion('')).toBeNull()
    expect(normalizeVersion('8.0')).toBeNull()
    expect(normalizeVersion('8.0.1-rc.1')).toBeNull()
    expect(normalizeVersion('latest')).toBeNull()
    expect(normalizeVersion(801)).toBeNull()
  })
})

describe('isOverrideEnabled', () => {
  it('only accepts true', () => {
    expect(isOverrideEnabled({ allowUnsupportedOpenCloud: true })).toBe(true)
    expect(isOverrideEnabled({ allowUnsupportedOpenCloud: 'true' })).toBe(true)
    expect(isOverrideEnabled({ allowUnsupportedOpenCloud: false })).toBe(false)
    expect(isOverrideEnabled({ allowUnsupportedOpenCloud: 'yes' })).toBe(false)
    expect(isOverrideEnabled({})).toBe(false)
    expect(isOverrideEnabled(undefined)).toBe(false)
  })
})

describe('checkCompatibility', () => {
  it('supports exactly the listed versions', () => {
    expect(SUPPORTED_OPENCLOUD_VERSIONS).toEqual(['8.0.1'])
    expect(checkCompatibility({ productVersion: '8.0.1', config: {} })).toEqual({
      supported: true,
      overridden: false,
      serverVersion: '8.0.1',
      message: ''
    })
    expect(checkCompatibility({ productVersion: '8.0.1+abc', config: {} }).supported).toBe(true)
  })

  it('refuses other versions with a message naming both', () => {
    for (const productVersion of ['8.0.0', '8.0.2', '8.1.0', '9.0.0']) {
      const result = checkCompatibility({ productVersion, config: {} })
      expect(result.supported).toBe(false)
      expect(result.overridden).toBe(false)
      expect(result.message).toBe(
        `Archive Viewer ${version} supports OpenCloud 8.0.1; this server runs ${productVersion}. ` +
          'Set allowUnsupportedOpenCloud: true in apps.yaml to run it anyway.'
      )
    }
  })

  it('fails closed on an unknown version', () => {
    const result = checkCompatibility({ productVersion: undefined, config: {} })
    expect(result.supported).toBe(false)
    expect(result.serverVersion).toBeNull()
    expect(result.message).toContain('this server runs an unknown version')
  })

  it('lets the admin override an unsupported version', () => {
    const result = checkCompatibility({
      productVersion: '8.1.0',
      config: { allowUnsupportedOpenCloud: true }
    })
    expect(result.supported).toBe(false)
    expect(result.overridden).toBe(true)
    expect(result.message).toContain('Running anyway because allowUnsupportedOpenCloud is set')
  })
})

describe('waitForProductVersion', () => {
  it('resolves at once when the capabilities are loaded', async () => {
    const store = { isInitialized: true, status: { productversion: '8.0.1' } }
    await expect(waitForProductVersion(store)).resolves.toBe('8.0.1')
  })

  it('waits for the capabilities to load', async () => {
    const store = reactive({ isInitialized: false, status: {} as { productversion?: string } })
    const promise = waitForProductVersion(store)
    store.status = { productversion: '8.1.0' }
    store.isInitialized = true
    await expect(promise).resolves.toBe('8.1.0')
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    const promise = waitForProductVersion(reactive({ isInitialized: false }), 100)
    vi.advanceTimersByTime(100)
    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
