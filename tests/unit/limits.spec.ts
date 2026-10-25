import { DEFAULT_LIMITS, isMobileDevice, resolveLimits } from '../../src/limits'

const MiB = 1024 * 1024
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'

describe('isMobileDevice', () => {
  it('detects phones and tablets', () => {
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(true)
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })).toBe(true)
    expect(isMobileDevice({ userAgent: DESKTOP_UA, userAgentData: { mobile: true } })).toBe(true)
  })

  it('detects iPads that report a Mac user agent', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'
    expect(isMobileDevice({ userAgent, maxTouchPoints: 5 })).toBe(true)
    expect(isMobileDevice({ userAgent, maxTouchPoints: 0 })).toBe(false)
  })

  it('treats desktops as desktops', () => {
    expect(isMobileDevice({ userAgent: DESKTOP_UA, userAgentData: { mobile: false } })).toBe(false)
    expect(isMobileDevice(undefined)).toBe(false)
  })
})

describe('resolveLimits', () => {
  it('uses the defaults for each device class', () => {
    expect(resolveLimits({}, false)).toEqual(DEFAULT_LIMITS.desktop)
    expect(resolveLimits(undefined, true)).toEqual(DEFAULT_LIMITS.mobile)
    expect(DEFAULT_LIMITS.mobile.entry).toBe(256 * MiB)
  })

  it('reads overrides from the app config, with separate mobile keys', () => {
    const config = { maxArchiveSize: 10, maxEntrySize: 20, maxArchiveSizeMobile: 5 }
    expect(resolveLimits(config, false)).toEqual({
      archive: 10,
      uncompressed: DEFAULT_LIMITS.desktop.uncompressed,
      entry: 20
    })
    expect(resolveLimits(config, true)).toEqual({ ...DEFAULT_LIMITS.mobile, archive: 5 })
  })

  it('ignores invalid values', () => {
    const config = { maxArchiveSize: 'lots', maxUncompressedSize: -1, maxEntrySize: 0 }
    expect(resolveLimits(config, false)).toEqual(DEFAULT_LIMITS.desktop)
  })
})
