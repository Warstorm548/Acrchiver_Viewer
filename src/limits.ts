const MiB = 1024 * 1024
const GiB = 1024 * MiB

export interface Limits {
  /** Largest archive downloaded in full (all formats except ZIP, which is read by range). */
  archive: number
  /** Largest amount of data a compressed archive may expand to. */
  uncompressed: number
  /** Largest single file read out of an archive (preview, download, selection total). */
  entry: number
}

/**
 * Measured in Chromium, a tab peaks at about `archive + uncompressed` for bzip2/xz/lzma (input and
 * output in memory together) and about 1.5 × `uncompressed` for gzip (stream chunks awaiting
 * garbage collection); mobile keeps that near 512 MiB. Decompressed data is also capped just
 * under 2 GiB by the browser (`MAX_BUFFER_SIZE`).
 */
export const DEFAULT_LIMITS: Record<'desktop' | 'mobile', Limits> = {
  desktop: { archive: 1 * GiB, uncompressed: 2 * GiB, entry: 1 * GiB },
  mobile: { archive: 128 * MiB, uncompressed: 384 * MiB, entry: 256 * MiB }
}

interface NavigatorLike {
  userAgent: string
  maxTouchPoints?: number
  userAgentData?: { mobile?: boolean }
}

/** Phones and tablets get lower limits because they have far less memory. */
export const isMobileDevice = (nav: NavigatorLike | undefined = globalThis.navigator): boolean => {
  if (!nav) {
    return false
  }
  if (typeof nav.userAgentData?.mobile === 'boolean' && nav.userAgentData.mobile) {
    return true
  }
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)) {
    return true
  }
  // iPadOS reports a desktop Mac user agent but has a touch screen.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1
}

const positive = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

/**
 * Limits for this device. `apps.yaml` may override each one: `maxArchiveSize`,
 * `maxUncompressedSize`, `maxEntrySize` on desktop and the `…Mobile` variants on mobile.
 */
export const resolveLimits = (
  config: Record<string, unknown> | undefined,
  mobile = isMobileDevice()
): Limits => {
  const defaults = DEFAULT_LIMITS[mobile ? 'mobile' : 'desktop']
  const suffix = mobile ? 'Mobile' : ''
  return {
    archive: positive(config?.[`maxArchiveSize${suffix}`], defaults.archive),
    uncompressed: positive(config?.[`maxUncompressedSize${suffix}`], defaults.uncompressed),
    entry: positive(config?.[`maxEntrySize${suffix}`], defaults.entry)
  }
}
