import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject } from '@opencloud-eu/web-pkg'
import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import { mock } from 'vitest-mock-extended'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import App from '../../src/App.vue'
import { configureZip } from '../../src/engine/zip'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const health = {
  version: '0.4.0',
  heartbeatSeconds: 30,
  confirmDownloadSize: 1e9,
  maxDownloadsPerUser: 3
}

interface FakeHelper {
  installed?: boolean
  openError?: { code: string; status: number; limit?: number }
  /** Status answers in order; the last one repeats. */
  statuses?: Record<string, unknown>[]
  /** Holds the answer to POST /sessions until this resolves. */
  holdOpen?: Promise<void>
  /** Status calls fail with HTTP 500. */
  statusFails?: boolean
  /** The archive, served with Range support (default: 5000 zero bytes, no ranges). */
  archive?: Blob
}

/** Routes the viewer's fetch calls: the helper API, else the signed file URL. */
const fakeServer = ({
  installed = true,
  openError,
  statuses,
  holdOpen,
  statusFails,
  archive
}: FakeHelper = {}) => {
  const calls: { method: string; url: string; auth: string | null }[] = []
  const answers = [...(statuses ?? [{ state: 'ready', size: 5000, copied: 5000, scanned: 5000 }])]
  const route = (input: RequestInfo | URL, init: RequestInit = {}): Response => {
    const url = String(input)
    const method = init.method ?? 'GET'
    calls.push({ method, url, auth: new Headers(init.headers).get('Authorization') })
    if (!url.startsWith('/archive-api')) {
      // the archive itself
      const range = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('Range') ?? '')
      if (!archive || !range) {
        return new Response(archive ?? new Uint8Array(5000))
      }
      const end = Math.min(Number(range[2]), archive.size - 1)
      return new Response(archive.slice(Number(range[1]), end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${range[1]}-${end}/${archive.size}` }
      })
    }
    if (!installed) {
      return new Response('<html>OpenCloud</html>') // the web UI answers the unrouted path
    }
    if (url === '/archive-api/health') {
      return json(health)
    }
    if (url === '/archive-api/sessions' && method === 'POST') {
      if (openError) {
        return json({ ...openError, message: 'refused' }, openError.status)
      }
      return json({ id: 's1', state: 'copying', size: 5000, copied: 0, scanned: 0 }, 202)
    }
    if (url === '/archive-api/sessions/s1' && method === 'GET') {
      if (statusFails) {
        return new Response('Internal Server Error', { status: 500 })
      }
      return json({
        id: 's1',
        name: 'big.tar.gz',
        ...(answers.length > 1 ? answers.shift() : answers[0])
      })
    }
    if (url === '/archive-api/sessions/s1' && method === 'DELETE') {
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('/archive-api/sessions/s1/children')) {
      return json({
        entries: [
          { path: 'docs', name: 'docs', isDirectory: true, size: 0, supported: true },
          { path: 'a.txt', name: 'a.txt', isDirectory: false, size: 1, supported: true }
        ],
        total: 2,
        offset: 0
      })
    }
    return new Response(null, { status: 404 })
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (holdOpen && String(input) === '/archive-api/sessions' && init?.method === 'POST') {
      await holdOpen
    }
    return route(input, init)
  })
  return calls
}

const createWrapper = ({
  name = 'big.tar.gz',
  size = 5000,
  token = 'user-token',
  config = { maxArchiveSize: 1000 } as Record<string, unknown>
} = {}) =>
  mount(App, {
    props: {
      resource: mock<Resource>({ id: name, name, size, webDavPath: `/spaces/s$1/${name}` }),
      applicationConfig: mock<AppConfigObject>(config),
      url: 'https://cloud.test/signed'
    },
    global: {
      plugins: [...defaultPlugins({ piniaOptions: { authState: { accessToken: token } } })],
      stubs: { OcIcon: true }
    }
  })

// With fake timers, vi.waitFor advances the clock by `interval` per try; the viewer polls the
// helper's status every second, so allow several seconds of (fake) time.
const waitFor = (check: () => void) =>
  vi.waitFor(
    async () => {
      await flushPromises()
      check()
    },
    { timeout: 10_000, interval: 100 }
  )

describe('App with the server helper', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens an archive too large for the browser on the server, with progress', async () => {
    const calls = fakeServer({
      statuses: [
        { state: 'copying', size: 5000, copied: 1000, scanned: 0 },
        { state: 'scanning', size: 5000, copied: 5000, scanned: 2500 },
        { state: 'ready', size: 5000, copied: 5000, scanned: 5000, entries: 2 }
      ]
    })
    const wrapper = createWrapper()
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-progress').text()).toBe(
        'Preparing the archive on the server… 20%'
      )
    )
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-progress').text()).toBe(
        'Reading the archive on the server… 50%'
      )
    )
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'a.txt'])
    )
    // the archive itself never reached the browser, and every helper call carried the token
    expect(calls.some((c) => c.url === 'https://cloud.test/signed')).toBe(false)
    expect(calls.every((c) => c.auth === 'Bearer user-token')).toBe(true)
    const open = calls.find((c) => c.url === '/archive-api/sessions')
    expect(open.method).toBe('POST')

    wrapper.unmount()
    await flushPromises()
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/archive-api/sessions/s1' })
  })

  it('keeps the browser’s “too large” message when the helper isn’t installed', async () => {
    const calls = fakeServer({ installed: false })
    const wrapper = createWrapper()
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain('larger than')
    )
    expect(calls.map((c) => c.url)).toEqual(['/archive-api/health'])
    expect(wrapper.find('.archive-viewer-download').exists()).toBe(true)
  })

  it('does not use the helper without a login (public links)', async () => {
    const calls = fakeServer()
    const wrapper = createWrapper({ token: '' })
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain('larger than')
    )
    expect(calls).toEqual([])
  })

  it('does not use the helper when the admin turned it off', async () => {
    const calls = fakeServer()
    const wrapper = createWrapper({ config: { maxArchiveSize: 1000, archiveHelperUrl: '' } })
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain('larger than')
    )
    expect(calls).toEqual([])
  })

  it('leaves small archives to the browser', async () => {
    const calls = fakeServer()
    createWrapper({ config: { maxArchiveSize: 1e9 } })
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls.map((c) => c.url)).toEqual(['https://cloud.test/signed'])
  })

  it('switches to the helper when the download turns out larger than its metadata said', async () => {
    const calls = fakeServer()
    // metadata says 10 bytes, the download delivers 5000 (over the 1000-byte limit)
    const wrapper = createWrapper({ size: 10 })
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'a.txt'])
    )
    expect(calls[0].url).toBe('https://cloud.test/signed')
  })

  it.each([
    [{ code: 'server-busy', status: 507 }, 'Server busy: not enough space'],
    [{ code: 'user-quota', status: 507 }, 'too many large archives open'],
    [
      { code: 'archive-too-large', status: 413, limit: 25e9 },
      'larger than the server allows (25 GB)'
    ]
  ])('explains a refused open (%o)', async (openError, text) => {
    fakeServer({ openError })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = createWrapper()
    await waitFor(() => expect(wrapper.find('.archive-viewer-message').text()).toContain(text))
  })

  it('explains a failed listing and frees the session', async () => {
    const calls = fakeServer({ statuses: [{ state: 'error', error: 'corrupt' }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = createWrapper()
    await waitFor(() => expect(wrapper.find('.archive-viewer-message').text()).toContain('damaged'))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('cancels while the server prepares the archive', async () => {
    const calls = fakeServer({
      statuses: [{ state: 'copying', size: 5000, copied: 10, scanned: 0 }]
    })
    const wrapper = createWrapper()
    await waitFor(() => expect(wrapper.find('.archive-viewer-cancel').exists()).toBe(true))
    await wrapper.find('.archive-viewer-cancel').trigger('click')
    await flushPromises()
    expect(wrapper.find('.archive-viewer-message').text()).toBe(
      'Opening the archive was cancelled.'
    )
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/archive-api/sessions/s1' })
    const statusCalls = calls.filter(
      (c) => c.url === '/archive-api/sessions/s1' && c.method === 'GET'
    ).length
    await vi.advanceTimersByTimeAsync(5000)
    expect(
      calls.filter((c) => c.url === '/archive-api/sessions/s1' && c.method === 'GET')
    ).toHaveLength(statusCalls)
    expect(wrapper.find('.archive-viewer-retry').exists()).toBe(true)
  })

  it('closes the session when Cancel is clicked while it is still being created', async () => {
    let answerOpen: () => void
    const calls = fakeServer({ holdOpen: new Promise((resolve) => (answerOpen = resolve)) })
    const wrapper = createWrapper()
    await waitFor(() => expect(wrapper.find('.archive-viewer-cancel').exists()).toBe(true))
    await wrapper.find('.archive-viewer-cancel').trigger('click')
    answerOpen() // the helper answers after the user cancelled
    await waitFor(() =>
      expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/archive-api/sessions/s1' })
    )
    expect(calls.filter((c) => c.url === '/archive-api/sessions/s1' && c.method === 'GET')).toEqual(
      []
    )
    expect(wrapper.find('.archive-viewer-message').text()).toBe(
      'Opening the archive was cancelled.'
    )
  })

  it('closes the session when checking its status fails', async () => {
    const calls = fakeServer({ statusFails: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = createWrapper()
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain(
        'The server could not open this archive.'
      )
    )
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/archive-api/sessions/s1' })
  })

  it('opens a 7z on the server whatever its size, never in the browser', async () => {
    const calls = fakeServer()
    const wrapper = createWrapper({ name: 'small.7z', size: 100, config: { maxArchiveSize: 1e9 } })
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'a.txt'])
    )
    expect(calls.some((c) => c.url === 'https://cloud.test/signed')).toBe(false)
  })

  it('explains that a 7z needs the helper when it isn’t installed', async () => {
    const calls = fakeServer({ installed: false })
    const wrapper = createWrapper({ name: 'small.7z', size: 100 })
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain(
        'only be opened when the server helper is installed'
      )
    )
    expect(calls.map((c) => c.url)).toEqual(['/archive-api/health'])
  })

  it('explains a password-protected archive', async () => {
    fakeServer({ statuses: [{ state: 'error', error: 'encrypted' }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = createWrapper({ name: 'locked.7z' })
    await waitFor(() =>
      expect(wrapper.find('.archive-viewer-message').text()).toContain('password-protected')
    )
  })
})

describe('App with the server helper and ZIPs', () => {
  beforeAll(() => configureZip({ useWebWorkers: false }))
  afterEach(() => vi.restoreAllMocks())

  /** A small ZIP; `method` rewrites every entry's compression method (headers only). */
  const makeZip = async (method?: number): Promise<Blob> => {
    const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0 })
    await writer.add('docs/readme.txt', new TextReader('hello'))
    await writer.add('root.txt', new TextReader('root'))
    const bytes = new Uint8Array(await (await writer.close()).arrayBuffer())
    if (method !== undefined) {
      const view = new DataView(bytes.buffer)
      for (let i = 0; i + 4 <= bytes.length; i++) {
        const signature = view.getUint32(i, true)
        if (signature === 0x04034b50) {
          view.setUint16(i + 8, method, true) // local header
        } else if (signature === 0x02014b50) {
          view.setUint16(i + 10, method, true) // central directory
        }
      }
    }
    return new Blob([bytes])
  }

  const zipWrapper = (zip: Blob, maxArchiveSize: number) =>
    createWrapper({ name: 'big.zip', size: zip.size, config: { maxArchiveSize } })

  it('opens a ZIP over the browser limit on the server instead of by range', async () => {
    const zip = await makeZip()
    const calls = fakeServer({ archive: zip })
    const wrapper = zipWrapper(zip, 10)
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'a.txt'])
    )
    expect(calls.some((c) => c.url === 'https://cloud.test/signed')).toBe(false)
  })

  it('reads a big ZIP by range with a notice when the helper fails', async () => {
    const zip = await makeZip()
    const calls = fakeServer({ archive: zip, openError: { code: 'server-busy', status: 507 } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = zipWrapper(zip, 10)
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'root.txt'])
    )
    expect(wrapper.find('.archive-viewer-notice').text()).toContain(
      'read in the browser, where some files may not open'
    )
    // one attempt on the server only
    expect(calls.filter((c) => c.url === '/archive-api/sessions')).toHaveLength(1)
  })

  it('leaves a small ZIP the browser can read to range mode', async () => {
    const zip = await makeZip()
    const calls = fakeServer({ archive: zip })
    const wrapper = zipWrapper(zip, 1e9)
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'root.txt'])
    )
    expect(calls.some((c) => c.url.startsWith('/archive-api'))).toBe(false)
  })

  it('moves a small ZIP to the server when it holds entries only the helper decodes', async () => {
    const zip = await makeZip(12) // bzip2
    const calls = fakeServer({ archive: zip })
    const wrapper = zipWrapper(zip, 1e9)
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'a.txt'])
    )
    expect(calls.some((c) => c.url === '/archive-api/sessions' && c.method === 'POST')).toBe(true)
    expect(wrapper.find('.archive-viewer-notice').exists()).toBe(false)
  })

  it('keeps the range listing when the helper isn’t installed', async () => {
    const zip = await makeZip(12)
    fakeServer({ archive: zip, installed: false })
    const wrapper = zipWrapper(zip, 1e9)
    await waitFor(() =>
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'root.txt'])
    )
    expect(wrapper.find('.archive-viewer-notice').exists()).toBe(false)
  })
})
