import { Resource, SpaceResource } from '@opencloud-eu/web-client'
import { AppConfigObject } from '@opencloud-eu/web-pkg'
import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import { mock } from 'vitest-mock-extended'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import App from '../../src/App.vue'
import { configureZip } from '../../src/engine/zip'
import { serveFile } from './rangeServer'

const makeZip = async (): Promise<Blob> => {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  await writer.add('docs/readme.txt', new TextReader('hello'))
  await writer.add('root.txt', new TextReader('root'))
  return writer.close()
}

const createWrapper = ({
  name = 'archive.zip',
  size = 1024,
  url = 'https://cloud.test/signed',
  config = {},
  getUrlForResource = null
}: {
  name?: string
  size?: number
  url?: string
  config?: Record<string, unknown>
  getUrlForResource?: () => Promise<string>
} = {}) =>
  mount(App, {
    props: {
      resource: mock<Resource>({ id: name, name, size }),
      applicationConfig: mock<AppConfigObject>(config),
      url,
      space: getUrlForResource ? mock<SpaceResource>() : null,
      getUrlForResource
    },
    global: { plugins: [...defaultPlugins()], stubs: { OcIcon: true } }
  })

const waitForRows = (wrapper: ReturnType<typeof createWrapper>, count: number) =>
  vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper.findAll('.archive-row')).toHaveLength(count)
  })

const waitForMessage = (wrapper: ReturnType<typeof createWrapper>, text: string) =>
  vi.waitFor(async () => {
    await flushPromises()
    expect(wrapper.find('.archive-viewer-message').text()).toContain(text)
  })

describe('App', () => {
  beforeAll(() => configureZip({ useWebWorkers: false }))
  afterEach(() => vi.restoreAllMocks())

  it('refuses non-zip archives above the size limit without downloading them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const wrapper = createWrapper({
      name: 'big.tar.gz',
      size: 5000,
      config: { maxArchiveSize: 1000 }
    })
    await flushPromises()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.archive-viewer-message').text()).toContain('larger than')
    expect(wrapper.find('.archive-viewer-download').exists()).toBe(true)
  })

  it('reads a zip by range requests, without downloading it', async () => {
    const zip = await makeZip()
    const { requests } = serveFile(zip)
    // The archive size limit doesn't apply to zips read by range.
    const wrapper = createWrapper({ size: zip.size, config: { maxArchiveSize: 10 } })
    await waitForRows(wrapper, 2)
    expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'root.txt'])
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((r) => r.range?.startsWith('bytes='))).toBe(true)
  })

  it('renews an expired signed URL and retries', async () => {
    const zip = await makeZip()
    const { requests } = serveFile(zip, { expired: ['https://cloud.test/old'] })
    const getUrlForResource = vi.fn().mockResolvedValue('https://cloud.test/new')
    const wrapper = createWrapper({
      size: zip.size,
      url: 'https://cloud.test/old',
      getUrlForResource
    })
    await waitForRows(wrapper, 2)
    expect(getUrlForResource).toHaveBeenCalledTimes(1)
    expect(requests.at(-1).url).toBe('https://cloud.test/new')
  })

  it('falls back to a full download when the server ignores ranges', async () => {
    const zip = await makeZip()
    const { requests } = serveFile(zip, { ranges: false })
    const wrapper = createWrapper({ size: zip.size + 1 })
    await waitForRows(wrapper, 2)
    expect(requests.at(-1).range).toBeNull()
  })

  it('downloads zips that are in-memory blob: URLs', async () => {
    const zip = await makeZip()
    const { requests } = serveFile(zip)
    const wrapper = createWrapper({ size: zip.size, url: 'blob:https://cloud.test/1' })
    await waitForRows(wrapper, 2)
    expect(requests).toEqual([{ url: 'blob:https://cloud.test/1', range: null }])
  })

  it('opens a single .gz file as a one-file archive', async () => {
    const gz = await new Response(
      new Blob(['hello']).stream().pipeThrough(new CompressionStream('gzip'))
    ).blob()
    serveFile(gz)
    const wrapper = createWrapper({ name: 'notes.txt.gz', size: gz.size })
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['notes.txt'])
    })
  })

  it('opens a .zip holding gzip data by its content, after a full download', async () => {
    const gz = await new Response(
      new Blob(['hello']).stream().pipeThrough(new CompressionStream('gzip'))
    ).blob()
    const { requests } = serveFile(gz)
    const wrapper = createWrapper({ name: 'misnamed.zip', size: gz.size })
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['misnamed.zip.out'])
    })
    // first bytes by range (not a zip), then the normal download path
    expect(requests.map((r) => r.range)).toEqual([`bytes=0-${gz.size - 1}`, null])
  })

  it('uses the lower limits on mobile devices', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const wrapper = createWrapper({ name: 'big.tar', size: 300 * 1024 * 1024 })
    await flushPromises()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.archive-viewer-message').text()).toContain('134.2 MB')
  })

  it('stops a download that is larger than the limit even if the metadata says otherwise', async () => {
    serveFile(new Blob([new Uint8Array(5000)]))
    const wrapper = createWrapper({ name: 'big.tar', size: 10, config: { maxArchiveSize: 1000 } })
    await waitForMessage(wrapper, 'larger than')
  })

  it('shows an error for damaged archives', async () => {
    const data = new Blob(['PK\u0003\u0004 not really a zip'])
    serveFile(data)
    const wrapper = createWrapper({ size: data.size })
    await waitForMessage(wrapper, 'damaged')
  })

  it('explains unsupported formats', async () => {
    serveFile(new Blob(['Rar!\u001a\u0007\u0001\u0000 content']))
    const wrapper = createWrapper({ name: 'archive.rar' })
    await waitForMessage(wrapper, 'not supported yet')
  })

  it('explains that 7z needs the server helper, without downloading the archive', async () => {
    const { requests } = serveFile(new Blob(['7z content']))
    const wrapper = createWrapper({ name: 'archive.7z' })
    await waitForMessage(wrapper, 'only be opened when the server helper is installed')
    expect(requests.map((r) => r.url)).toEqual([])
  })

  it('reports failed downloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    )
    const wrapper = createWrapper()
    await waitForMessage(wrapper, 'could not be loaded')
  })
})
