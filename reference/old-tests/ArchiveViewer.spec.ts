import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ArchiveViewer from '@/views/ArchiveViewer.vue'

describe('ArchiveViewer', () => {
  let wrapper: any

  beforeEach(() => {
    wrapper = mount(ArchiveViewer, {
      global: {
        stubs: {
          'oc-icon': true,
          'oc-button': true,
          'oc-spinner': true,
          'oc-checkbox': true,
          'oc-text-input': true,
          'oc-modal': true
        }
      }
    })
  })

  describe('Component Rendering', () => {
    it('renders the component', () => {
      expect(wrapper.exists()).toBe(true)
    })

    it('shows loading state initially', () => {
      expect(wrapper.find('.loading').exists()).toBe(true)
    })

    it('displays archive header', () => {
      expect(wrapper.find('.archive-header').exists()).toBe(true)
    })
  })

  describe('File Operations', () => {
    it('formats file sizes correctly', () => {
      const { formatSize } = wrapper.vm
      expect(formatSize(0)).toBe('0 B')
      expect(formatSize(1024)).toBe('1 KB')
      expect(formatSize(1048576)).toBe('1 MB')
      expect(formatSize(1073741824)).toBe('1 GB')
    })

    it('identifies text files correctly', () => {
      const { isTextFile } = wrapper.vm
      expect(isTextFile({ name: 'test.txt' })).toBe(true)
      expect(isTextFile({ name: 'test.md' })).toBe(true)
      expect(isTextFile({ name: 'test.json' })).toBe(true)
      expect(isTextFile({ name: 'test.jpg' })).toBe(false)
    })

    it('identifies image files correctly', () => {
      const { isImageFile } = wrapper.vm
      expect(isImageFile({ name: 'photo.jpg' })).toBe(true)
      expect(isImageFile({ name: 'photo.png' })).toBe(true)
      expect(isImageFile({ name: 'photo.gif' })).toBe(true)
      expect(isImageFile({ name: 'document.txt' })).toBe(false)
    })

    it('gets correct file icon', () => {
      const { getFileIcon } = wrapper.vm
      expect(getFileIcon({ isDirectory: true })).toBe('folder')
      expect(getFileIcon({ name: 'test.txt', isDirectory: false })).toBe('file-text')
      expect(getFileIcon({ name: 'image.png', isDirectory: false })).toBe('file-image')
      expect(getFileIcon({ name: 'archive.zip', isDirectory: false })).toBe('file-zip')
    })
  })

  describe('Navigation', () => {
    it('navigates to root', async () => {
      wrapper.vm.currentPath = ['folder1', 'folder2']
      wrapper.vm.navigateToRoot()
      expect(wrapper.vm.currentPath).toEqual([])
    })

    it('navigates to specific path', () => {
      wrapper.vm.currentPath = ['folder1', 'folder2', 'folder3']
      wrapper.vm.navigateToPath(1)
      expect(wrapper.vm.currentPath).toEqual(['folder1', 'folder2'])
    })

    it('navigates to directory', () => {
      const file = {
        path: 'folder1/folder2',
        isDirectory: true
      }
      wrapper.vm.navigateToDirectory(file)
      expect(wrapper.vm.currentPath).toEqual(['folder1', 'folder2'])
    })
  })

  describe('Selection', () => {
    it('toggles file selection', () => {
      const file = { path: 'test.txt', name: 'test.txt' }
      expect(wrapper.vm.isSelected(file)).toBe(false)
      
      wrapper.vm.toggleSelection(file)
      expect(wrapper.vm.selectedFiles).toContain(file)
      expect(wrapper.vm.isSelected(file)).toBe(true)
      
      wrapper.vm.toggleSelection(file)
      expect(wrapper.vm.selectedFiles).not.toContain(file)
      expect(wrapper.vm.isSelected(file)).toBe(false)
    })

    it('selects all files', async () => {
      wrapper.vm.archiveFiles = [
        { path: 'file1.txt', name: 'file1.txt', isDirectory: false },
        { path: 'file2.txt', name: 'file2.txt', isDirectory: false }
      ]
      
      await wrapper.vm.$nextTick()
      
      expect(wrapper.vm.allSelected).toBe(false)
      wrapper.vm.toggleSelectAll()
      expect(wrapper.vm.selectedFiles.length).toBeGreaterThan(0)
    })
  })

  describe('Sorting', () => {
    it('sorts by name', () => {
      wrapper.vm.sortField = 'size'
      wrapper.vm.sortBy('name')
      expect(wrapper.vm.sortField).toBe('name')
      expect(wrapper.vm.sortDirection).toBe('asc')
    })

    it('toggles sort direction', () => {
      wrapper.vm.sortField = 'name'
      wrapper.vm.sortDirection = 'asc'
      wrapper.vm.sortBy('name')
      expect(wrapper.vm.sortDirection).toBe('desc')
    })

    it('sorts by different fields', () => {
      wrapper.vm.sortBy('size')
      expect(wrapper.vm.sortField).toBe('size')
      
      wrapper.vm.sortBy('modified')
      expect(wrapper.vm.sortField).toBe('modified')
    })
  })

  describe('Search', () => {
    it('filters files by search query', async () => {
      wrapper.vm.archiveFiles = [
        { path: 'document.txt', name: 'document.txt', isDirectory: false },
        { path: 'image.png', name: 'image.png', isDirectory: false },
        { path: 'archive.zip', name: 'archive.zip', isDirectory: false }
      ]
      
      wrapper.vm.searchQuery = 'doc'
      await wrapper.vm.$nextTick()
      
      const displayed = wrapper.vm.displayedFiles
      expect(displayed.some((f: any) => f.name.includes('document'))).toBe(true)
    })
  })

  describe('Date Formatting', () => {
    it('formats dates correctly', () => {
      const { formatDate } = wrapper.vm
      const date = new Date('2025-01-01T12:00:00')
      const formatted = formatDate(date)
      expect(formatted).toContain('2025')
      expect(formatted).toContain('1')
      expect(formatted).toContain('1')
    })
  })
})
