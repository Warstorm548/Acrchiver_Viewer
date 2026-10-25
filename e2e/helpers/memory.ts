// Peak memory of the browser tab, sampled from /proc (Linux): the largest resident set of any
// Playwright Chromium renderer process while a callback runs.
import { readdirSync, readFileSync } from 'node:fs'

const rendererRss = (): number => {
  let largest = 0
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) {
      continue
    }
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (!cmdline.includes('ms-playwright') || !cmdline.includes('--type=renderer')) {
        continue
      }
      const rss = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))
      largest = Math.max(largest, rss ? Number(rss[1]) * 1024 : 0)
    } catch {
      // the process ended meanwhile
    }
  }
  return largest
}

/** Runs `action` and returns its result with the peak renderer RSS in bytes. */
export const measurePeak = async <T>(
  action: () => Promise<T>
): Promise<{ result: T; peak: number }> => {
  let peak = rendererRss()
  const timer = setInterval(() => (peak = Math.max(peak, rendererRss())), 200)
  try {
    const result = await action()
    return { result, peak: Math.max(peak, rendererRss()) }
  } finally {
    clearInterval(timer)
  }
}
