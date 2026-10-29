import { HelperClient } from '../../../src/helper/client'
import { checkHelper, isSupportedHelperVersion, SUPPORTED_HELPER } from '../../../src/helper/gate'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const health = {
  version: '0.5.0',
  features: ['format:zip', 'download:selection'],
  ready: true,
  problems: [] as string[],
  maxStorage: 1,
  maxStoragePerUser: 1,
  maxDownloadSize: 1,
  maxSelectionSize: 1,
  confirmDownloadSize: 1,
  maxDownloadsPerUser: 3,
  maxPreviewSize: 1,
  heartbeatSeconds: 30,
  sessionTimeoutSeconds: 600
}

const client = () => new HelperClient('/archive-api', () => 'token')

describe('isSupportedHelperVersion', () => {
  it.each([
    ['0.5.0', true],
    ['0.5.9', true],
    ['0.4.1', false],
    ['0.6.0', false],
    ['1.5.0', false]
  ])('%s → %s', (version, expected) => {
    expect(isSupportedHelperVersion(version)).toBe(expected)
  })

  it('the range is a single minor (breaking changes bump the helper’s minor)', () => {
    expect(SUPPORTED_HELPER).toEqual({ min: '0.5.0', below: '0.6.0' })
  })
})

describe('checkHelper', () => {
  afterEach(() => vi.restoreAllMocks())

  it('accepts a ready helper in the supported range', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(health))
    await expect(checkHelper(client(), {})).resolves.toMatchObject({ usable: true, health })
  })

  it.each([
    ['unreachable', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'a 502 from the proxy (stopped helper, wrong port)',
      () => Promise.resolve(new Response('', { status: 502 }))
    ],
    ['OpenCloud’s web page (no proxy route)', () => Promise.resolve(new Response('<html>'))]
  ])('reports a missing helper when %s', async (_, answer) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(answer)
    await expect(checkHelper(client(), {})).resolves.toMatchObject({
      usable: false,
      reason: 'missing'
    })
  })

  it('gives up after the timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_, init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        )
    )
    await expect(checkHelper(client(), {}, 20)).resolves.toMatchObject({
      usable: false,
      reason: 'misconfigured',
      detail: 'the archive helper failed (timeout)'
    })
  })

  it.each([
    [
      { ...health, version: '0.6.0' },
      'archive helper 0.6.0 is not supported, this viewer needs ^0.5.0; set allowUnsupportedHelper'
    ],
    [{ version: '0.4.1', heartbeatSeconds: 30 }, 'archive helper 0.4.1 is not supported'],
    [
      { ...health, ready: false, problems: ['opencloud-unreachable'] },
      'not set up correctly (opencloud-unreachable)'
    ],
    [{ hello: 'world' }, 'unexpected answer from the archive helper'],
    [{ ...health, features: 'zip' }, 'unexpected answer']
  ])('refuses %o', async (answer, detail) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(answer))
    const check = await checkHelper(client(), {})
    expect(check).toMatchObject({ usable: false, reason: 'misconfigured' })
    expect(check.detail).toContain(detail)
  })

  it('uses an unsupported version when the admin allows it, but never one that is not ready', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...health, version: '0.6.0' }))
    await expect(checkHelper(client(), { allowUnsupportedHelper: true })).resolves.toMatchObject({
      usable: true,
      detail: expect.stringContaining('using it anyway')
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ ...health, version: '0.6.0', ready: false })
    )
    await expect(checkHelper(client(), { allowUnsupportedHelper: 'true' })).resolves.toMatchObject({
      usable: false,
      reason: 'misconfigured'
    })
  })

  it('treats other helper errors as a setup problem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: 'helper-error' }, 500))
    await expect(checkHelper(client(), {})).resolves.toMatchObject({
      usable: false,
      reason: 'misconfigured',
      detail: 'the archive helper failed (helper-error)'
    })
  })
})
