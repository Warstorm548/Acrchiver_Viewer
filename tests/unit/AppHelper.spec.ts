import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject } from '@opencloud-eu/web-pkg'
import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import { mock } from 'vitest-mock-extended'
import App from '../../src/App.vue'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const health = {
  version: '0.3.0',
  heartbeatSeconds: 30,
  confirmDownloadSize: 1e9,
  maxDownloadsPerUser: 3
}

interface FakeHelper {
  installed?: boolean
  openError?: { code: string; status: number; limit?: number }
  /** Status answers in order; the last one repeats. */
  statuses?: Record<string, unknown>[]
}

/** Routes the viewer's fetch calls: the helper API, else the signed file URL. */
const fakeServer = ({ installed = true, openError, statuses }: FakeHelper = {}) => {
  const calls: { method: string; url: string; auth: string | null }[] = []
  const answers = [...(statuses ?? [{ state: 'ready', size: 5000, copied: 5000, scanned: 5000 }])]
  const route = (input: RequestInfo | URL, init: RequestInit = {}): Response => {
    const url = String(input)
    const method = init.method ?? 'GET'
    calls.push({ method, url, auth: new Headers(init.headers).get('Authorization') })
    if (!url.startsWith('/archive-api')) {
      return new Response(new Uint8Array(5000)) // the archive itself
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
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    Promise.resolve(route(input, init))
  )
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
})
