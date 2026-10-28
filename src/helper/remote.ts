import { ArchiveEntry } from '../engine'
import { DownloadInfo, HelperClient, HelperError, HelperHealth, RemoteEntry } from './client'

/** Entries per folder page; more are loaded with "Show more". */
export const PAGE_SIZE = 500

export const toArchiveEntry = (entry: RemoteEntry): ArchiveEntry => ({
  path: entry.path,
  name: entry.name,
  isDirectory: entry.isDirectory,
  size: entry.size,
  modified: entry.modified ? new Date(entry.modified) : undefined,
  supported: entry.supported
})

/**
 * An archive opened by the helper: listed and read on the server, one folder page at a time.
 * Keeps the session alive with heartbeats until `close`.
 */
export class RemoteArchive {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  private readonly onPageHide = () => this.close(true)

  constructor(
    readonly client: HelperClient,
    readonly sessionId: string,
    readonly health: HelperHealth
  ) {}

  async children(folder: string, sort: string, descending: boolean, offset = 0) {
    const page = await this.client.children(
      this.sessionId,
      folder,
      sort,
      descending,
      offset,
      PAGE_SIZE
    )
    return { entries: page.entries.map(toArchiveEntry), total: page.total }
  }

  async search(query: string) {
    const result = await this.client.search(this.sessionId, query)
    return { entries: result.entries.map(toArchiveEntry), truncated: result.truncated }
  }

  /** Reads a small file for a preview. */
  read(entry: ArchiveEntry): Promise<Blob> {
    return this.client.entry(this.sessionId, entry.path)
  }

  /** Checks a download (size, caps); with `issue` also returns its single-use link. */
  prepareDownload(paths: string[], issue: boolean): Promise<DownloadInfo> {
    return this.client.downloads(this.sessionId, paths, issue)
  }

  /**
   * Reports every few seconds that the archive is still open. `onLost` is called once if the
   * helper no longer knows the session (it timed out, e.g. after the computer slept).
   */
  startHeartbeat(onLost: () => void) {
    this.stopHeartbeat()
    globalThis.addEventListener?.('pagehide', this.onPageHide)
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.client.heartbeat(this.sessionId)
      } catch (error) {
        if (error instanceof HelperError && error.status === 404 && !this.closed) {
          this.stopHeartbeat()
          onLost()
        }
        // other failures (network blips) are retried on the next beat
      }
    }, this.health.heartbeatSeconds * 1000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    globalThis.removeEventListener?.('pagehide', this.onPageHide)
  }

  /** Ends the session so the helper deletes its temp file right away. */
  async close(keepalive = false): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.stopHeartbeat()
    await this.client.close(this.sessionId, keepalive).catch(() => {})
  }
}
