<template>
  <div class="archive-viewer">
    <!-- Memory Warning Banner -->
    <div v-if="memoryWarning" class="memory-warning">
      <oc-icon name="alert-triangle" />
      <span>{{ $gettext('High memory usage detected') }} ({{ formatSize(estimatedMemoryUsage) }}). {{ $gettext('Large operations may be slow') }}.</span>
      <oc-button @click="clearCache" size="small" appearance="outlined">
        {{ $gettext('Clear Cache') }}
      </oc-button>
    </div>

    <!-- Progress Indicator for Large Files -->
    <div v-if="streamingProgress > 0 && streamingProgress < 100" class="streaming-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: streamingProgress + '%' }"></div>
      </div>
      <span>{{ $gettext('Loading archive') }}: {{ streamingProgress }}%</span>
    </div>

    <div class="archive-header">
      <h1>
        <oc-icon name="file-zip" size="large" />
        {{ archiveName }}
        <span v-if="isLargeArchive" class="large-file-badge">{{ $gettext('Large File') }}</span>
      </h1>
      <div class="archive-stats">
        <span>{{ fileCount }} {{ $gettext('files') }}</span>
        <span>{{ formatSize(totalSize) }}</span>
        <span>{{ $gettext('Compressed') }}: {{ formatSize(compressedSize) }}</span>
        <span v-if="totalSize > 0" class="compression-ratio">
          {{ $gettext('Ratio') }}: {{ Math.round((1 - compressedSize / totalSize) * 100) }}%
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <oc-spinner size="large" />
      <p>{{ loadingMessage }}</p>
      <p v-if="isLargeArchive" class="loading-tip">
        {{ $gettext('Large archive detected. This may take a moment...') }}
      </p>
    </div>

    <div v-else-if="error" class="error">
      <oc-icon name="alert-circle" size="large" />
      <p>{{ error }}</p>
      <oc-button v-if="canRetry" @click="loadArchive" appearance="outlined">
        {{ $gettext('Retry') }}
      </oc-button>
    </div>

    <div v-else class="archive-content">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-box">
          <oc-text-input
            v-model="searchQuery"
            :placeholder="$gettext('Search files...')"
            class="search-input"
            @input="debouncedSearch"
          >
            <template #trailingIcon>
              <oc-icon name="search" />
            </template>
          </oc-text-input>
        </div>
        
        <div class="actions">
          <oc-button
            :disabled="selectedFiles.length === 0 || extracting"
            @click="downloadSelected"
            appearance="filled"
          >
            <oc-icon name="download" />
            {{ $gettext('Download Selected') }} ({{ selectedFiles.length }})
          </oc-button>
          
          <oc-button
            @click="showExtractAllWarning"
            appearance="outlined"
            :disabled="extracting"
          >
            <oc-icon name="download-cloud" />
            {{ $gettext('Extract All') }}
          </oc-button>

          <oc-button
            v-if="selectedFiles.length > 0"
            @click="createArchiveFromSelected"
            appearance="outlined"
            :disabled="extracting"
          >
            <oc-icon name="file-zip" />
            {{ $gettext('Create Archive') }}
          </oc-button>
        </div>
      </div>

      <!-- Breadcrumb Navigation -->
      <div v-if="currentPath.length > 0" class="breadcrumb">
        <oc-button
          @click="navigateToRoot"
          appearance="raw"
          size="small"
        >
          <oc-icon name="home" />
        </oc-button>
        <span v-for="(part, index) in currentPath" :key="index">
          <oc-icon name="chevron-right" size="small" />
          <oc-button
            @click="navigateToPath(index)"
            appearance="raw"
            size="small"
          >
            {{ part }}
          </oc-button>
        </span>
      </div>

      <!-- Virtual Scrolling File List for Large Archives -->
      <div class="file-list" ref="fileListContainer" @scroll="handleScroll">
        <table class="files-table">
          <thead>
            <tr>
              <th class="checkbox-col">
                <oc-checkbox
                  :model-value="allSelected"
                  @update:model-value="toggleSelectAll"
                />
              </th>
              <th @click="sortBy('name')" class="sortable">
                <span>{{ $gettext('Name') }}</span>
                <oc-icon v-if="sortField === 'name'" :name="sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'" size="small" />
              </th>
              <th @click="sortBy('size')" class="sortable">
                <span>{{ $gettext('Size') }}</span>
                <oc-icon v-if="sortField === 'size'" :name="sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'" size="small" />
              </th>
              <th @click="sortBy('modified')" class="sortable">
                <span>{{ $gettext('Modified') }}</span>
                <oc-icon v-if="sortField === 'modified'" :name="sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'" size="small" />
              </th>
              <th>{{ $gettext('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <!-- Spacer for virtual scrolling -->
            <tr v-if="virtualScrollOffset > 0" :style="{ height: virtualScrollOffset + 'px' }"></tr>
            
            <tr
              v-for="file in visibleFiles"
              :key="file.path"
              :class="{ selected: isSelected(file) }"
              @click="handleFileClick(file, $event)"
            >
              <td class="checkbox-col">
                <oc-checkbox
                  :model-value="isSelected(file)"
                  @update:model-value="toggleSelection(file)"
                  @click.stop
                />
              </td>
              <td class="file-name">
                <oc-icon :name="getFileIcon(file)" />
                <span>{{ file.name }}</span>
              </td>
              <td>{{ file.isDirectory ? '-' : formatSize(file.size) }}</td>
              <td>{{ formatDate(file.modified) }}</td>
              <td class="actions-col">
                <oc-button
                  v-if="!file.isDirectory"
                  @click.stop="previewFile(file)"
                  appearance="raw"
                  size="small"
                  :aria-label="$gettext('Preview')"
                  :disabled="file.size > MAX_PREVIEW_SIZE"
                >
                  <oc-icon name="eye" />
                </oc-button>
                <oc-button
                  v-if="!file.isDirectory"
                  @click.stop="downloadFile(file)"
                  appearance="raw"
                  size="small"
                  :aria-label="$gettext('Download')"
                  :disabled="extracting"
                >
                  <oc-icon name="download" />
                </oc-button>
                <oc-button
                  v-if="file.isDirectory"
                  @click.stop="navigateToDirectory(file)"
                  appearance="raw"
                  size="small"
                  :aria-label="$gettext('Open')"
                >
                  <oc-icon name="folder-open" />
                </oc-button>
              </td>
            </tr>
            
            <!-- Bottom spacer for virtual scrolling -->
            <tr v-if="virtualScrollBottomOffset > 0" :style="{ height: virtualScrollBottomOffset + 'px' }"></tr>
          </tbody>
        </table>
      </div>
      
      <!-- Extraction Progress -->
      <div v-if="extracting" class="extraction-progress">
        <oc-spinner size="small" />
        <span>{{ $gettext('Extracting') }}: {{ extractionProgress }} / {{ extractionTotal }}</span>
        <oc-button @click="cancelExtraction" size="small" appearance="outlined">
          {{ $gettext('Cancel') }}
        </oc-button>
      </div>
    </div>

    <!-- Preview Modal -->
    <oc-modal
      v-if="previewFileRef"
      :title="previewFileRef.name"
      @cancel="closePreview"
    >
      <div class="preview-content">
        <div v-if="previewLoading" class="loading">
          <oc-spinner />
        </div>
        <div v-else-if="previewError" class="error">
          {{ previewError }}
        </div>
        <div v-else-if="previewData">
          <!-- Text Preview -->
          <pre v-if="isTextFile(previewFileRef)" class="text-preview">{{ previewData }}</pre>
          
          <!-- Image Preview -->
          <img
            v-else-if="isImageFile(previewFileRef)"
            :src="previewData"
            :alt="previewFileRef.name"
            class="image-preview"
          />
          
          <!-- Fallback -->
          <div v-else class="no-preview">
            <oc-icon name="file" size="xxlarge" />
            <p>{{ $gettext('Preview not available for this file type') }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <oc-button @click="downloadFile(previewFileRef)">
          <oc-icon name="download" />
          {{ $gettext('Download') }}
        </oc-button>
        <oc-button @click="closePreview" appearance="outlined">
          {{ $gettext('Close') }}
        </oc-button>
      </template>
    </oc-modal>

    <!-- Extract All Warning Modal -->
    <oc-modal
      v-if="showExtractWarning"
      :title="$gettext('Extract All Files')"
      @cancel="showExtractWarning = false"
    >
      <div class="warning-content">
        <oc-icon name="alert-triangle" size="large" />
        <p>{{ $gettext('You are about to extract') }} {{ fileCount }} {{ $gettext('files') }} ({{ formatSize(totalSize) }}).</p>
        <p v-if="isLargeArchive" class="warning-text">
          {{ $gettext('This is a large archive. Extraction may take several minutes and use significant memory.') }}
        </p>
        <p>{{ $gettext('Continue?') }}</p>
      </div>
      <template #footer>
        <oc-button @click="confirmExtractAll" appearance="filled">
          {{ $gettext('Extract') }}
        </oc-button>
        <oc-button @click="showExtractWarning = false" appearance="outlined">
          {{ $gettext('Cancel') }}
        </oc-button>
      </template>
    </oc-modal>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useClientService, useResourcesStore, useLoadingService } from '@opencloud-eu/web-pkg'
import { Archive } from 'libarchive.js/main.js'

interface ArchiveFile {
  path: string
  name: string
  size: number
  compressed: number
  modified: Date
  isDirectory: boolean
  mode: number
  file?: any
}

// Memory management constants
const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks for streaming
const MAX_PREVIEW_SIZE = 10 * 1024 * 1024 // 10MB max for preview
const VIRTUAL_LIST_BUFFER = 50 // Number of items to render in viewport
const CACHE_CLEANUP_INTERVAL = 30000 // 30 seconds
const LARGE_ARCHIVE_THRESHOLD = 1024 * 1024 * 1024 // 1GB
const ROW_HEIGHT = 40 // Estimated row height in pixels
const DEBOUNCE_DELAY = 300 // ms

export default defineComponent({
  name: 'ArchiveViewer',
  setup() {
    const route = useRoute()
    const clientService = useClientService()
    const resourcesStore = useResourcesStore()
    const loadingService = useLoadingService()

    // State
    const loading = ref(true)
    const loadingMessage = ref('Loading archive...')
    const error = ref('')
    const canRetry = ref(true)
    const archiveName = ref('')
    const archiveFiles = ref<ArchiveFile[]>([])
    const currentPath = ref<string[]>([])
    const searchQuery = ref('')
    const selectedFiles = ref<ArchiveFile[]>([])
    const sortField = ref<'name' | 'size' | 'modified'>('name')
    const sortDirection = ref<'asc' | 'desc'>('asc')
    
    // Preview state
    const previewFileRef = ref<ArchiveFile | null>(null)
    const previewData = ref<string | null>(null)
    const previewLoading = ref(false)
    const previewError = ref('')
    
    // Large file handling state
    const archiveHandle = ref<any>(null)
    const extractionCache = new Map<string, Blob>()
    const cacheCleanupTimer = ref<number | null>(null)
    const isLargeArchive = ref(false)
    const virtualScrollOffset = ref(0)
    const virtualScrollBottomOffset = ref(0)
    const fileListContainer = ref<HTMLElement | null>(null)
    const streamingProgress = ref(0)
    const memoryWarning = ref(false)
    const estimatedMemoryUsage = ref(0)
    
    // Extraction state
    const extracting = ref(false)
    const extractionProgress = ref(0)
    const extractionTotal = ref(0)
    const extractionAborted = ref(false)
    const showExtractWarning = ref(false)
    
    // Search debounce
    let searchDebounceTimer: number | null = null

    // Computed
    const fileCount = computed(() => archiveFiles.value.filter(f => !f.isDirectory).length)
    const totalSize = computed(() => 
      archiveFiles.value.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.size), 0)
    )
    const compressedSize = computed(() =>
      archiveFiles.value.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.compressed), 0)
    )

    const currentDirectory = computed(() => currentPath.value.join('/'))

    const displayedFiles = computed(() => {
      let files = archiveFiles.value

      // Filter by current directory
      const dirPrefix = currentDirectory.value ? currentDirectory.value + '/' : ''
      files = files.filter(f => {
        const relativePath = f.path.startsWith(dirPrefix) ? f.path.slice(dirPrefix.length) : null
        if (!relativePath) return false
        
        // Show only direct children
        const parts = relativePath.split('/').filter(p => p)
        return parts.length === 1 || (parts.length === 2 && f.isDirectory)
      })

      // Apply search filter
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        files = files.filter(f => f.name.toLowerCase().includes(query))
      }

      // Sort files
      files = [...files].sort((a, b) => {
        // Directories first
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1

        let comparison = 0
        switch (sortField.value) {
          case 'name':
            comparison = a.name.localeCompare(b.name)
            break
          case 'size':
            comparison = a.size - b.size
            break
          case 'modified':
            comparison = a.modified.getTime() - b.modified.getTime()
            break
        }

        return sortDirection.value === 'asc' ? comparison : -comparison
      })

      return files
    })

    // Virtual scrolling - only render visible items
    const visibleFiles = computed(() => {
      if (!isLargeArchive.value || displayedFiles.value.length < 100) {
        return displayedFiles.value
      }

      const container = fileListContainer.value
      if (!container) return displayedFiles.value.slice(0, VIRTUAL_LIST_BUFFER)

      const scrollTop = container.scrollTop
      const visibleHeight = container.clientHeight
      
      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_LIST_BUFFER)
      const endIndex = Math.min(
        displayedFiles.value.length,
        Math.ceil((scrollTop + visibleHeight) / ROW_HEIGHT) + VIRTUAL_LIST_BUFFER
      )

      virtualScrollOffset.value = startIndex * ROW_HEIGHT
      virtualScrollBottomOffset.value = (displayedFiles.value.length - endIndex) * ROW_HEIGHT

      return displayedFiles.value.slice(startIndex, endIndex)
    })

    const allSelected = computed(() => 
      displayedFiles.value.length > 0 && 
      displayedFiles.value.every(f => selectedFiles.value.includes(f))
    )

    // Methods
    const checkMemory = () => {
      // @ts-ignore - performance.memory is Chrome-specific
      if (performance.memory) {
        // @ts-ignore
        const used = performance.memory.usedJSHeapSize
        // @ts-ignore
        const limit = performance.memory.jsHeapSizeLimit
        
        estimatedMemoryUsage.value = used
        memoryWarning.value = used > limit * 0.8 // Warn at 80% memory usage
      }
    }

    const clearCache = () => {
      extractionCache.clear()
      if (previewData.value && isImageFile(previewFileRef.value!)) {
        URL.revokeObjectURL(previewData.value)
      }
      previewData.value = null
      previewFileRef.value = null
      
      // Force garbage collection hint
      if (global.gc) {
        global.gc()
      }
      
      checkMemory()
    }

    const setupCacheCleanup = () => {
      cacheCleanupTimer.value = window.setInterval(() => {
        // Remove old cache entries if memory is getting high
        if (extractionCache.size > 100) {
          const entries = Array.from(extractionCache.entries())
          // Remove first half of cache
          entries.slice(0, Math.floor(entries.length / 2)).forEach(([key]) => {
            extractionCache.delete(key)
          })
        }
        checkMemory()
      }, CACHE_CLEANUP_INTERVAL)
    }

    const loadArchive = async () => {
      try {
        loading.value = true
        error.value = ''
        canRetry.value = false
        streamingProgress.value = 0
        
        const fileId = route.query.fileId as string
        if (!fileId) {
          throw new Error('No file ID provided')
        }

        loadingMessage.value = 'Fetching archive information...'
        
        // Get file resource
        const resource = resourcesStore.getResource(fileId)
        if (!resource) {
          throw new Error('Resource not found')
        }

        archiveName.value = resource.name
        const archiveSize = resource.size || 0
        
        // Check if this is a large archive
        isLargeArchive.value = archiveSize > LARGE_ARCHIVE_THRESHOLD

        if (isLargeArchive.value) {
          loadingMessage.value = `Loading large archive (${formatSize(archiveSize)})...`
        } else {
          loadingMessage.value = 'Downloading archive...'
        }
        
        // Download the file with progress tracking for large files
        let loadedBytes = 0
        const response = await clientService.webdav.getFileContents(resource)
        
        if (!response.body) {
          throw new Error('No response body')
        }

        // Stream the response for large files
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break
          
          chunks.push(value)
          loadedBytes += value.length
          
          if (archiveSize > 0) {
            streamingProgress.value = Math.round((loadedBytes / archiveSize) * 100)
          }
        }
        
        // Combine chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        const combinedArray = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of chunks) {
          combinedArray.set(chunk, offset)
          offset += chunk.length
        }
        
        loadingMessage.value = 'Parsing archive structure...'
        streamingProgress.value = 0
        
        // Open archive with libarchive.js
        const archiveBlob = new Blob([combinedArray])
        archiveHandle.value = await Archive.open(new File([archiveBlob], resource.name))
        
        loadingMessage.value = 'Reading file entries...'
        
        // Get all entries without extracting
        const entries = await archiveHandle.value.getFilesArray()
        
        loadingMessage.value = 'Processing file metadata...'
        
        // Process entries in batches for large archives
        const files: ArchiveFile[] = []
        const directories = new Set<string>()
        const batchSize = isLargeArchive.value ? 100 : 1000

        for (let i = 0; i < entries.length; i += batchSize) {
          const batch = entries.slice(i, i + batchSize)
          
          for (const entry of batch) {
            const pathParts = entry.file.name.split('/').filter((p: string) => p)
            const fileName = pathParts[pathParts.length - 1]
            const isDirectory = entry.file.name.endsWith('/')

            // Add intermediate directories
            let currentDir = ''
            for (let j = 0; j < pathParts.length - 1; j++) {
              currentDir += (currentDir ? '/' : '') + pathParts[j]
              if (!directories.has(currentDir)) {
                directories.add(currentDir)
                files.push({
                  path: currentDir,
                  name: pathParts[j],
                  size: 0,
                  compressed: 0,
                  modified: new Date(),
                  isDirectory: true,
                  mode: 0,
                  file: null
                })
              }
            }

            if (!isDirectory) {
              files.push({
                path: entry.file.name.replace(/\/$/, ''),
                name: fileName,
                size: entry.file.size || 0,
                compressed: entry.file.compressed || 0,
                modified: new Date(entry.file.lastModified || Date.now()),
                isDirectory: false,
                mode: entry.file.mode || 0,
                file: entry.file
              })
            }
          }
          
          // Update progress for large archives
          if (isLargeArchive.value) {
            streamingProgress.value = Math.round(((i + batchSize) / entries.length) * 100)
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }

        archiveFiles.value = files
        loading.value = false
        streamingProgress.value = 0
        canRetry.value = true
        
        // Setup cache cleanup
        setupCacheCleanup()
        
        // Initial memory check
        checkMemory()
        
      } catch (err: any) {
        console.error('Error loading archive:', err)
        error.value = err.message || 'Failed to load archive'
        loading.value = false
        canRetry.value = true
      }
    }

    const handleScroll = () => {
      // Trigger recompute of visible files
      if (isLargeArchive.value) {
        checkMemory()
      }
    }

    const debouncedSearch = () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }
      searchDebounceTimer = window.setTimeout(() => {
        // Search is reactive, just trigger recompute
      }, DEBOUNCE_DELAY)
    }

    const navigateToRoot = () => {
      currentPath.value = []
      selectedFiles.value = []
    }

    const navigateToPath = (index: number) => {
      currentPath.value = currentPath.value.slice(0, index + 1)
      selectedFiles.value = []
    }

    const navigateToDirectory = (file: ArchiveFile) => {
      const parts = file.path.split('/').filter(p => p)
      currentPath.value = parts
      selectedFiles.value = []
    }

    const handleFileClick = (file: ArchiveFile, event: MouseEvent) => {
      if (file.isDirectory) {
        navigateToDirectory(file)
      } else if (!event.ctrlKey && !event.metaKey) {
        if (file.size <= MAX_PREVIEW_SIZE) {
          previewFile(file)
        }
      }
    }

    const toggleSelection = (file: ArchiveFile) => {
      const index = selectedFiles.value.indexOf(file)
      if (index >= 0) {
        selectedFiles.value.splice(index, 1)
      } else {
        selectedFiles.value.push(file)
      }
    }

    const toggleSelectAll = () => {
      if (allSelected.value) {
        selectedFiles.value = []
      } else {
        selectedFiles.value = [...displayedFiles.value.filter(f => !f.isDirectory)]
      }
    }

    const isSelected = (file: ArchiveFile) => {
      return selectedFiles.value.includes(file)
    }

    const sortBy = (field: 'name' | 'size' | 'modified') => {
      if (sortField.value === field) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      } else {
        sortField.value = field
        sortDirection.value = 'asc'
      }
    }

    const downloadFile = async (file: ArchiveFile) => {
      if (!file.file || extracting.value) return
      
      try {
        loadingService.addTask()
        
        // Check cache first
        let blob = extractionCache.get(file.path)
        
        if (!blob) {
          // Extract the file
          const extracted = await Archive.extract(file.file)
          blob = new Blob([extracted])
          
          // Cache for reuse (if not too large)
          if (file.size < 50 * 1024 * 1024) { // Cache files under 50MB
            extractionCache.set(file.path, blob)
          }
        }
        
        // Create download link
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        // Clean up URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 100)
        
        loadingService.removeTask()
        checkMemory()
      } catch (err) {
        console.error('Download error:', err)
        loadingService.removeTask()
      }
    }

    const downloadSelected = async () => {
      if (extracting.value) return
      
      extracting.value = true
      extractionProgress.value = 0
      extractionTotal.value = selectedFiles.value.length
      extractionAborted.value = false
      
      try {
        for (let i = 0; i < selectedFiles.value.length && !extractionAborted.value; i++) {
          const file = selectedFiles.value[i]
          if (!file.isDirectory) {
            await downloadFile(file)
            extractionProgress.value = i + 1
            // Allow cancellation
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      } finally {
        extracting.value = false
        extractionProgress.value = 0
        extractionTotal.value = 0
      }
    }

    const showExtractAllWarning = () => {
      showExtractWarning.value = true
    }

    const confirmExtractAll = async () => {
      showExtractWarning.value = false
      await downloadAll()
    }

    const downloadAll = async () => {
      const files = archiveFiles.value.filter(f => !f.isDirectory)
      
      if (extracting.value) return
      
      extracting.value = true
      extractionProgress.value = 0
      extractionTotal.value = files.length
      extractionAborted.value = false
      
      try {
        for (let i = 0; i < files.length && !extractionAborted.value; i++) {
          await downloadFile(files[i])
          extractionProgress.value = i + 1
          
          // Cleanup cache periodically for large extractions
          if (i % 50 === 0) {
            checkMemory()
            if (memoryWarning.value) {
              // Clear some cache to free memory
              const cacheEntries = Array.from(extractionCache.keys())
              cacheEntries.slice(0, 25).forEach(key => extractionCache.delete(key))
            }
          }
          
          // Allow cancellation
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      } finally {
        extracting.value = false
        extractionProgress.value = 0
        extractionTotal.value = 0
      }
    }

    const cancelExtraction = () => {
      extractionAborted.value = true
    }

    const createArchiveFromSelected = async () => {
      // For now, just download them individually
      await downloadSelected()
    }

    const previewFile = async (file: ArchiveFile) => {
      if (file.isDirectory || file.size > MAX_PREVIEW_SIZE) return
      
      previewFileRef.value = file
      previewData.value = null
      previewLoading.value = true
      previewError.value = ''

      try {
        // Check cache first
        let blob = extractionCache.get(file.path)
        
        if (!blob) {
          const extracted = await Archive.extract(file.file)
          blob = new Blob([extracted])
          
          // Cache preview files
          if (file.size < 10 * 1024 * 1024) {
            extractionCache.set(file.path, blob)
          }
        }
        
        if (isTextFile(file)) {
          const text = await blob.text()
          // Limit text preview to 100KB for performance
          previewData.value = text.length > 100000 ? text.slice(0, 100000) + '\n...(truncated)' : text
        } else if (isImageFile(file)) {
          previewData.value = URL.createObjectURL(blob)
        } else {
          previewError.value = 'Preview not available for this file type'
        }
      } catch (err: any) {
        previewError.value = err.message || 'Failed to load preview'
      } finally {
        previewLoading.value = false
      }
    }

    const closePreview = () => {
      if (previewData.value && isImageFile(previewFileRef.value!)) {
        URL.revokeObjectURL(previewData.value)
      }
      previewFileRef.value = null
      previewData.value = null
      previewError.value = ''
    }

    const getFileIcon = (file: ArchiveFile) => {
      if (file.isDirectory) return 'folder'
      
      const ext = file.name.split('.').pop()?.toLowerCase()
      const iconMap: Record<string, string> = {
        txt: 'file-text',
        md: 'file-text',
        js: 'file-code',
        ts: 'file-code',
        json: 'file-code',
        html: 'file-code',
        css: 'file-code',
        jpg: 'file-image',
        jpeg: 'file-image',
        png: 'file-image',
        gif: 'file-image',
        svg: 'file-image',
        pdf: 'file-pdf',
        zip: 'file-zip',
        tar: 'file-zip',
        gz: 'file-zip'
      }
      
      return iconMap[ext || ''] || 'file'
    }

    const isTextFile = (file: ArchiveFile) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'log', 'csv', 'yaml', 'yml', 'ini', 'conf'].includes(ext || '')
    }

    const isImageFile = (file: ArchiveFile) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext || '')
    }

    const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
    }

    const formatDate = (date: Date) => {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
    }

    // Lifecycle
    onMounted(() => {
      loadArchive()
    })

    onUnmounted(() => {
      // Cleanup
      if (cacheCleanupTimer.value) {
        clearInterval(cacheCleanupTimer.value)
      }
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }
      clearCache()
      if (archiveHandle.value) {
        try {
          archiveHandle.value.close()
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    })

    watch(() => route.query.fileId, () => {
      clearCache()
      loadArchive()
    })

    return {
      loading,
      loadingMessage,
      error,
      canRetry,
      archiveName,
      fileCount,
      totalSize,
      compressedSize,
      currentPath,
      searchQuery,
      displayedFiles,
      visibleFiles,
      selectedFiles,
      allSelected,
      sortField,
      sortDirection,
      previewFileRef,
      previewData,
      previewLoading,
      previewError,
      isLargeArchive,
      fileListContainer,
      virtualScrollOffset,
      virtualScrollBottomOffset,
      streamingProgress,
      memoryWarning,
      estimatedMemoryUsage,
      extracting,
      extractionProgress,
      extractionTotal,
      showExtractWarning,
      MAX_PREVIEW_SIZE,
      navigateToRoot,
      navigateToPath,
      navigateToDirectory,
      handleFileClick,
      handleScroll,
      toggleSelection,
      toggleSelectAll,
      isSelected,
      sortBy,
      downloadFile,
      downloadSelected,
      downloadAll,
      showExtractAllWarning,
      confirmExtractAll,
      cancelExtraction,
      createArchiveFromSelected,
      previewFile,
      closePreview,
      getFileIcon,
      isTextFile,
      isImageFile,
      formatSize,
      formatDate,
      debouncedSearch,
      clearCache,
      loadArchive
    }
  }
})
</script>

<style scoped>
.archive-viewer {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.memory-warning {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--oc-color-swatch-warning-muted);
  border: 1px solid var(--oc-color-swatch-warning-default);
  border-radius: 4px;
  margin-bottom: 1rem;
  color: var(--oc-color-swatch-warning-contrast);
}

.streaming-progress {
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--oc-color-background-muted);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: var(--oc-color-swatch-primary-default);
  transition: width 0.3s ease;
}

.large-file-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: var(--oc-color-swatch-warning-muted);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
}

.archive-header {
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--oc-color-border);
  padding-bottom: 1rem;
}

.archive-header h1 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
}

.archive-stats {
  display: flex;
  gap: 2rem;
  color: var(--oc-color-text-muted);
  font-size: 0.875rem;
}

.compression-ratio {
  font-weight: 600;
  color: var(--oc-color-swatch-success-default);
}

.loading,
.error {
  text-align: center;
  padding: 3rem;
}

.loading p {
  margin-top: 1rem;
  color: var(--oc-color-text-muted);
}

.loading-tip {
  font-style: italic;
  color: var(--oc-color-swatch-warning-default);
}

.error {
  color: var(--oc-color-swatch-danger-default);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 250px;
  max-width: 400px;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: var(--oc-color-background-muted);
  border-radius: 4px;
}

.file-list {
  background: var(--oc-color-background-default);
  border: 1px solid var(--oc-color-border);
  border-radius: 4px;
  overflow-y: auto;
  max-height: 60vh;
}

.files-table {
  width: 100%;
  border-collapse: collapse;
}

.files-table thead {
  background: var(--oc-color-background-muted);
  border-bottom: 1px solid var(--oc-color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.files-table th,
.files-table td {
  padding: 0.75rem;
  text-align: left;
}

.files-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.files-table th.sortable:hover {
  background: var(--oc-color-background-hover);
}

.files-table th.sortable span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.checkbox-col {
  width: 40px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.files-table tbody tr {
  border-bottom: 1px solid var(--oc-color-border);
  cursor: pointer;
}

.files-table tbody tr:hover {
  background: var(--oc-color-background-hover);
}

.files-table tbody tr.selected {
  background: var(--oc-color-background-highlight);
}

.actions-col {
  display: flex;
  gap: 0.25rem;
  justify-content: flex-end;
}

.extraction-progress {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem;
  background: var(--oc-color-background-default);
  border: 1px solid var(--oc-color-border);
  border-radius: 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 1000;
}

.preview-content {
  min-height: 400px;
  max-height: 70vh;
  overflow: auto;
}

.text-preview {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: monospace;
  font-size: 0.875rem;
  padding: 1rem;
  background: var(--oc-color-background-muted);
  border-radius: 4px;
}

.image-preview {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.no-preview {
  text-align: center;
  padding: 3rem;
  color: var(--oc-color-text-muted);
}

.warning-content {
  text-align: center;
  padding: 2rem;
}

.warning-text {
  color: var(--oc-color-swatch-warning-default);
  font-weight: 600;
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .archive-viewer {
    padding: 1rem;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-box {
    max-width: none;
  }

  .actions {
    flex-direction: column;
  }

  .files-table {
    font-size: 0.875rem;
  }

  .files-table th,
  .files-table td {
    padding: 0.5rem;
  }
  
  .extraction-progress {
    bottom: 1rem;
    right: 1rem;
    left: 1rem;
  }
}
</style>
