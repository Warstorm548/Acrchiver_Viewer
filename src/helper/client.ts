// HTTP client for the optional archive helper (server/), reached through the OpenCloud proxy at
// a same-origin path (default /archive-api). Every call sends the user's login token.

export const DEFAULT_HELPER_URL = '/archive-api'

/**
 * The helper's base path from apps.yaml (`archiveHelperUrl`), or null when it is turned off.
 * Only same-origin paths are accepted, so the user's token is never sent to another site.
 */
export const resolveHelperUrl = (config: Record<string, unknown> | undefined): string | null => {
  const value = config?.archiveHelperUrl
  if (typeof value !== 'string') {
    return DEFAULT_HELPER_URL
  }
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : null
}

export interface HelperHealth {
  version: string
  maxStorage: number
  maxStoragePerUser: number
  maxDownloadSize: number
  maxSelectionSize: number
  confirmDownloadSize: number
  maxDownloadsPerUser: number
  maxPreviewSize: number
  heartbeatSeconds: number
  sessionTimeoutSeconds: number
}

export type SessionState = 'copying' | 'scanning' | 'ready' | 'error'

export interface SessionStatus {
  id: string
  state: SessionState
  name: string
  size: number
  copied: number
  scanned: number
  entries: number
  /** Set when state is 'error': unsupported-format, corrupt, too-complex, changed, … */
  error?: string
}

/** An entry as the helper sends it (`modified` in milliseconds). */
export interface RemoteEntry {
  path: string
  name: string
  isDirectory: boolean
  size: number
  modified?: number
  supported: boolean
}

export interface DownloadInfo {
  fileName: string
  /** Bytes the download will have (a ZIP adds its headers). */
  size: number
  contentSize: number
  files: number
  /** Larger than the admin's confirmation threshold. */
  confirm: boolean
  /** Single-use link, when requested with `issue`. */
  url?: string
}

/** A failed helper call, with the helper's stable error code. */
export class HelperError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly size?: number,
    readonly limit?: number
  ) {
    super(message)
    this.name = 'HelperError'
  }
}

export class HelperClient {
  constructor(
    readonly baseUrl: string,
    private readonly getToken: () => string
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.getToken()}`)
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error
      }
      throw new HelperError('unreachable', 0, (error as Error).message)
    }
    if (!response.ok) {
      let body: { code?: string; message?: string; size?: number; limit?: number } = {}
      try {
        body = await response.json()
      } catch {
        // not one of the helper's JSON errors (e.g. the proxy answered)
      }
      throw new HelperError(
        body.code ?? `http-${response.status}`,
        response.status,
        body.message ?? `HTTP ${response.status}`,
        body.size,
        body.limit
      )
    }
    return response
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(path, init)
    try {
      return (await response.json()) as T
    } catch {
      // e.g. OpenCloud's web UI answering for a path the proxy doesn't route to the helper
      throw new HelperError('not-a-helper', response.status, 'Unexpected answer from the helper')
    }
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  }

  health(): Promise<HelperHealth> {
    return this.json<HelperHealth>('/health')
  }

  open(webDavPath: string): Promise<SessionStatus> {
    return this.post<SessionStatus>('/sessions', { webDavPath })
  }

  status(id: string, signal?: AbortSignal): Promise<SessionStatus> {
    return this.json<SessionStatus>(`/sessions/${encodeURIComponent(id)}`, { signal })
  }

  async heartbeat(id: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(id)}/heartbeat`, { method: 'POST' })
  }

  /** Closes a session; `keepalive` lets the request finish while the page is being closed. */
  async close(id: string, keepalive = false): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive })
  }

  children(
    id: string,
    folder: string,
    sort: string,
    descending: boolean,
    offset: number,
    limit: number
  ): Promise<{ entries: RemoteEntry[]; total: number; offset: number }> {
    const query = new URLSearchParams({
      path: folder,
      sort,
      dir: descending ? 'desc' : 'asc',
      offset: String(offset),
      limit: String(limit)
    })
    return this.json(`/sessions/${encodeURIComponent(id)}/children?${query}`)
  }

  search(id: string, q: string): Promise<{ entries: RemoteEntry[]; truncated: boolean }> {
    return this.json(`/sessions/${encodeURIComponent(id)}/search?${new URLSearchParams({ q })}`)
  }

  async entry(id: string, path: string): Promise<Blob> {
    const query = new URLSearchParams({ path })
    const response = await this.request(`/sessions/${encodeURIComponent(id)}/entry?${query}`)
    return response.blob()
  }

  downloads(id: string, paths: string[], issue: boolean): Promise<DownloadInfo> {
    return this.post<DownloadInfo>(`/sessions/${encodeURIComponent(id)}/downloads`, {
      paths,
      issue
    })
  }
}
