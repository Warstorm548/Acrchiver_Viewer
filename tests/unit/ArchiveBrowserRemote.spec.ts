import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import { useMessages } from '@opencloud-eu/web-pkg'
import ArchiveBrowser from '../../src/components/ArchiveBrowser.vue'
import * as download from '../../src/download'
import { ArchiveEntry } from '../../src/engine'
import { HelperError, HelperHealth } from '../../src/helper/client'
import { RemoteArchive } from '../../src/helper/remote'

const entry = (path: string, isDirectory = false, size = 10): ArchiveEntry => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  isDirectory,
  size,
  supported: true
})

const fakeRemote = () => {
  const folders: Record<string, ArchiveEntry[]> = {
    '': [entry('docs', true), entry('a.txt'), entry('b.txt')],
    docs: [entry('docs/guide.md')]
  }
  return {
    health: { maxDownloadsPerUser: 3 } as HelperHealth,
    children: vi.fn((folder: string, _sort: string, _desc: boolean, offset = 0) =>
      Promise.resolve({
        // pages of two, to exercise "Show more"
        entries: folders[folder].slice(offset, offset + 2),
        total: folders[folder].length
      })
    ),
    search: vi.fn(() => Promise.resolve({ entries: [entry('docs/guide.md')], truncated: true })),
    read: vi.fn(() => Promise.resolve(new Blob(['content']))),
    prepareDownload: vi.fn((paths: string[], issue: boolean) =>
      Promise.resolve({
        fileName: paths.length > 1 ? 'x-selection.zip' : 'a.txt',
        size: 2_000_000_000,
        contentSize: 2_000_000_000,
        files: paths.length,
        confirm: false,
        url: issue ? '/archive-api/download/ticket' : undefined
      })
    )
  }
}

const createWrapper = (remote = fakeRemote()) => {
  const wrapper = mount(ArchiveBrowser, {
    props: { remote: remote as unknown as RemoteArchive, archiveName: 'x.tar.gz' },
    global: {
      plugins: [...defaultPlugins()],
      // the real modal's focus trap needs focusable elements the test DOM doesn't lay out
      stubs: {
        OcIcon: true,
        PreviewModal: true,
        OcModal: { template: '<div class="oc-modal-stub"><slot name="content" /></div>' }
      }
    }
  })
  return { wrapper, remote }
}

const names = (wrapper: ReturnType<typeof createWrapper>['wrapper']) =>
  wrapper.findAll('.archive-name').map((node) => node.text())

describe('ArchiveBrowser with the server helper', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('lists folders page by page from the server', async () => {
    const { wrapper, remote } = createWrapper()
    await flushPromises()
    expect(remote.children).toHaveBeenCalledWith('', 'name', false, 0)
    expect(names(wrapper)).toEqual(['docs', 'a.txt'])
    expect(wrapper.find('.archive-load-more').text()).toContain('2 of 3')
    await wrapper.find('.archive-load-more').trigger('click')
    await flushPromises()
    expect(remote.children).toHaveBeenLastCalledWith('', 'name', false, 2)
    expect(names(wrapper)).toEqual(['docs', 'a.txt', 'b.txt'])
    expect(wrapper.find('.archive-load-more').exists()).toBe(false)

    await wrapper.find('.archive-row[data-path="docs"]').trigger('click')
    await flushPromises()
    expect(remote.children).toHaveBeenLastCalledWith('docs', 'name', false, 0)
    expect(names(wrapper)).toEqual(['guide.md'])
  })

  it('lets the server sort', async () => {
    const { wrapper, remote } = createWrapper()
    await flushPromises()
    await wrapper.find('.archive-sort[data-field="size"]').trigger('click')
    await flushPromises()
    expect(remote.children).toHaveBeenLastCalledWith('', 'size', false, 0)
    await wrapper.find('.archive-sort[data-field="size"]').trigger('click')
    await flushPromises()
    expect(remote.children).toHaveBeenLastCalledWith('', 'size', true, 0)
  })

  it('searches on the server once typing pauses', async () => {
    vi.useFakeTimers()
    const { wrapper, remote } = createWrapper()
    await flushPromises()
    wrapper.vm.searchQuery = 'g'
    await wrapper.vm.$nextTick()
    wrapper.vm.searchQuery = 'gu'
    await wrapper.vm.$nextTick()
    expect(remote.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(remote.search).toHaveBeenCalledTimes(1)
    expect(remote.search).toHaveBeenCalledWith('gu')
    expect(names(wrapper)).toEqual(['guide.md'])
    expect(wrapper.find('.archive-search-summary').text()).toBe('Showing the first 1 results')
  })

  it('downloads through a single-use link, without reading the file in the browser', async () => {
    const trigger = vi.spyOn(download, 'triggerUrlDownload').mockImplementation(() => {})
    const { wrapper, remote } = createWrapper()
    await flushPromises()
    await wrapper.find('.archive-row[data-path="a.txt"] .archive-download').trigger('click')
    await flushPromises()
    expect(remote.prepareDownload.mock.calls).toEqual([
      [['a.txt'], false],
      [['a.txt'], true]
    ])
    expect(trigger).toHaveBeenCalledWith('/archive-api/download/ticket', 'a.txt')
    expect(remote.read).not.toHaveBeenCalled()
  })

  it('asks before a download over the admin’s threshold', async () => {
    const trigger = vi.spyOn(download, 'triggerUrlDownload').mockImplementation(() => {})
    const remote = fakeRemote()
    remote.prepareDownload.mockImplementation((_paths: string[], issue: boolean) =>
      Promise.resolve({
        fileName: 'x-selection.zip',
        size: 2_000_000_000,
        contentSize: 2_000_000_000,
        files: 7,
        confirm: true,
        url: issue ? '/archive-api/download/t2' : undefined
      })
    )
    const { wrapper } = createWrapper(remote)
    await flushPromises()
    wrapper.vm.toggleSelection(wrapper.vm.rows[0])
    wrapper.vm.toggleSelection(wrapper.vm.rows[1])

    // "No": nothing is issued
    const declined = wrapper.vm.downloadSelection()
    await flushPromises()
    expect(wrapper.find('.archive-confirm-text').text()).toContain('7 files')
    await wrapper.find('.archive-confirm-cancel').trigger('click')
    await declined
    expect(remote.prepareDownload).toHaveBeenCalledTimes(1)
    expect(trigger).not.toHaveBeenCalled()

    // "Download": the link is issued and opened
    const accepted = wrapper.vm.downloadSelection()
    await flushPromises()
    await wrapper.find('.archive-confirm-accept').trigger('click')
    await accepted
    expect(remote.prepareDownload).toHaveBeenLastCalledWith(['docs', 'a.txt'], true)
    expect(trigger).toHaveBeenCalledWith('/archive-api/download/t2', 'x-selection.zip')
    expect(wrapper.find('.archive-confirm-download').exists()).toBe(false)
  })

  it('explains a refused download with its size and the limit', async () => {
    const remote = fakeRemote()
    remote.prepareDownload.mockRejectedValue(
      new HelperError('download-too-large', 413, 'too big', 12e9, 10e9)
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { wrapper } = createWrapper(remote)
    await flushPromises()
    const messages = useMessages(wrapper.vm.$pinia)
    await wrapper.find('.archive-row[data-path="a.txt"] .archive-download').trigger('click')
    await flushPromises()
    const shown = vi.mocked(messages.showErrorMessage).mock.calls[0][0].errors[0].message
    expect(shown).toBe('This download is too large (12 GB, limit 10 GB).')
  })
})
