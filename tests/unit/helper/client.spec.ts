import { HelperClient, HelperError, resolveHelperUrl } from '../../../src/helper/client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('resolveHelperUrl', () => {
  it.each([
    [undefined, '/archive-api'],
    [{}, '/archive-api'],
    // vitest-mock-extended and broken configs: anything but a string means "default"
    [{ archiveHelperUrl: () => 'x' }, '/archive-api'],
    [{ archiveHelperUrl: '/custom/helper/' }, '/custom/helper'],
    [{ archiveHelperUrl: '' }, null],
    [{ archiveHelperUrl: '   ' }, null],
    // the token must never go to another site
    [{ archiveHelperUrl: 'https://evil.example/api' }, null],
    [{ archiveHelperUrl: '//evil.example/api' }, null],
    // browsers read "\\" as "/" and drop tabs/newlines inside URLs
    [{ archiveHelperUrl: '/\\evil.example/api' }, null],
    [{ archiveHelperUrl: '/\t/evil.example/api' }, null],
    [{ archiveHelperUrl: '/\n/evil.example/api' }, null],
    [{ archiveHelperUrl: 'archive-api' }, null]
  ])('%o → %s', (config, expected) => {
    expect(resolveHelperUrl(config as Record<string, unknown>)).toBe(expected)
  })
})

describe('HelperClient', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the current token with every request', async () => {
    let token = 'first'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(json({ version: '0.4.0' })))
    const client = new HelperClient('/archive-api', () => token)
    await client.health()
    token = 'renewed'
    await client.health()
    const headers = fetchSpy.mock.calls.map(([, init]) =>
      new Headers(init.headers).get('Authorization')
    )
    expect(headers).toEqual(['Bearer first', 'Bearer renewed'])
    expect(fetchSpy.mock.calls[0][0]).toBe('/archive-api/health')
  })

  it('passes the helper’s error code, size and limit on', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ code: 'download-too-large', message: 'too big', size: 20, limit: 10 }, 413)
    )
    const error = await new HelperClient('/a', () => 't')
      .downloads('id', ['x'], false)
      .catch((e) => e)
    expect(error).toBeInstanceOf(HelperError)
    expect(error).toMatchObject({ code: 'download-too-large', status: 413, size: 20, limit: 10 })
  })

  it('reports answers that are not from the helper', async () => {
    // without the proxy route, OpenCloud's web UI answers with its HTML page
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>OpenCloud</html>', { status: 200 })
    )
    await expect(new HelperClient('/a', () => 't').health()).rejects.toMatchObject({
      code: 'not-a-helper'
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    await expect(new HelperClient('/a', () => 't').health()).rejects.toMatchObject({
      code: 'http-502',
      status: 502
    })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(new HelperClient('/a', () => 't').health()).rejects.toMatchObject({
      code: 'unreachable'
    })
  })

  it('builds the session URLs and request bodies', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(json({ entries: [], total: 0 })))
    const client = new HelperClient('/archive-api', () => 't')
    await client.children('abc', 'docs/sub folder', 'size', true, 500, 250)
    await client.search('abc', 'a&b')
    await client.open('/spaces/s$1/x.tar.gz')
    await client.downloads('abc', ['a', 'b'], true)
    const urls = fetchSpy.mock.calls.map(([url]) => url)
    expect(urls).toEqual([
      '/archive-api/sessions/abc/children?path=docs%2Fsub+folder&sort=size&dir=desc&offset=500&limit=250',
      '/archive-api/sessions/abc/search?q=a%26b',
      '/archive-api/sessions',
      '/archive-api/sessions/abc/downloads'
    ])
    expect(JSON.parse(fetchSpy.mock.calls[2][1].body as string)).toEqual({
      webDavPath: '/spaces/s$1/x.tar.gz'
    })
    expect(JSON.parse(fetchSpy.mock.calls[3][1].body as string)).toEqual({
      paths: ['a', 'b'],
      issue: true
    })
  })

  it('closes with keepalive so it still arrives while the page unloads', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    await new HelperClient('/a', () => 't').close('abc', true)
    expect(fetchSpy.mock.calls[0][0]).toBe('/a/sessions/abc')
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'DELETE', keepalive: true })
  })
})
