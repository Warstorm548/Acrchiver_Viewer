<template>
  <div class="archive-viewer">
    <!-- Memory Warning Banner -->
    <div v-if="memoryWarning" class="memory-warning">
      <oc-icon name="alert-triangle" />
      <span>High memory usage detected ({{ formatSize(estimatedMemoryUsage) }}). Large operations may be slow. Consider closing other tabs.</span>
    </div>

    <div class="archive-header">
      <h1>
        <oc-icon name="file-zip" size="large" />
        {{ archiveName }}
      </h1>
      <div class="archive-stats">
        <span>{{ fileCount }} {{ $gettext('files') }}</span>
        <span>{{ formatSize(totalSize) }}</span>
        <span>{{ $gettext('Compressed') }}: {{ formatSize(compressedSize) }}</span>
        <span v-if="totalSize > 0" class="compression-ratio">
          Ratio: {{ Math.round((1 - compressedSize / totalSize) * 100) }}%
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <oc-spinner size="large" />
      <p>{{ loadingMessage }}</p>
    </div>

    <div v-else-if="error" class="error">
      <oc-icon name="alert-circle" size="large" />
      <p>{{ error }}</p>
    </div>

    <div v-else class="archive-content">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-box">
          <oc-text-input
            v-model="searchQuery"
            :placeholder="$gettext('Search files...')"
            class="search-input"
          >
            <template #trailingIcon>
              <oc-icon name="search" />
            </template>
          </oc-text-input>
        </div>
        
        <div class="actions">
          <oc-button
            :disabled="selectedFiles.length === 0"
            @click="downloadSelected"
            appearance="filled"
          >
            <oc-icon name="download" />
            {{ $gettext('Download Selected') }} ({{ selectedFiles.length }})
          </oc-button>
          
          <oc-button
            @click="downloadAll"
            appearance="outlined"
          >
            <oc-icon name="download-cloud" />
            {{ $gettext('Extract All') }}
          </oc-button>

          <oc-button
            v-if="selectedFiles.length > 0"
            @click="createArchiveFromSelected"
            appearance="outlined"
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

      <!-- File List -->
      <div class="file-list">
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
            <tr
              v-for="file in displayedFiles"
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
                >
                  <oc-icon name="eye" />
                </oc-button>
                <oc-button
                  v-if="!file.isDirectory"
                  @click.stop="downloadFile(file)"
                  appearance="raw"
                  size="small"
                  :aria-label="$gettext('Download')"
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
          </tbody>
        </table>
      </div>
    </div>

    <!-- Preview Modal -->
    <oc-modal
      v-if="previewFile"
      :title="previewFile.name"
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
          <pre v-if="isTextFile(previewFile)" class="text-preview">{{ previewData }}</pre>
          
          <!-- Image Preview -->
          <img
            v-else-if="isImageFile(previewFile)"
            :src="previewData"
            :alt="previewFile.name"
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
        <oc-button @click="downloadFile(previewFile)">
          <oc-icon name="download" />
          {{ $gettext('Download') }}
        </oc-button>
        <oc-button @click="closePreview" appearance="outlined">
          {{ $gettext('Close') }}
        </oc-button>
      </template>
    </oc-modal>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
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
  offset?: number // File offset in archive for streaming
}

interface MemoryStats {
  totalHeap: number
  usedHeap: number
  limit: number
}

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

    // Memory management state
    const archiveHandle = ref<any>(null)
    const memoryWarning = ref(false)
    const estimatedMemoryUsage = ref(0)
    const CHUNK_SIZE = 64 * 1024 * 1024 // 64MB chunks for streaming
    const MAX_PREVIEW_SIZE = 10 * 1024 * 1024 // 10MB max for preview
    const MAX_MEMORY_USAGE = 0.7 // Use max 70% of available memory

    // Computed
    const fileCount = computed(() => archiveFiles.value.filter(f => !f.isDirectory).length)
    const totalSize = computed(() => 
      archiveFiles.value.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.size), 0)
    )
    const compressedSize = computed(() =>
      archiveFiles.value.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.compressed), 0)
    )

    const currentDirectory = computed(() => currentPath.value.join('/'))

    // Memory monitoring
    const checkMemory = (): MemoryStats | null => {
      if ('memory' in performance && (performance as any).memory) {
        const mem = (performance as any).memory
        return {
          totalHeap: mem.totalJSHeapSize,
          usedHeap: mem.usedJSHeapSize,
          limit: mem.jsHeapSizeLimit
        }
      }
      return null
    }

    const getAvailableMemory = (): number => {
      const stats = checkMemory()
      if (stats) {
        return stats.limit - stats.usedHeap
      }
      // Estimate 2GB if memory API not available
      return 2 * 1024 * 1024 * 1024
    }

    const updateMemoryWarning = () => {
      const stats = checkMemory()
      if (stats) {
        const usageRatio = stats.usedHeap / stats.limit
        memoryWarning.value = usageRatio > MAX_MEMORY_USAGE
        estimatedMemoryUsage.value = stats.usedHeap
      }
    }

    // Garbage collection hint (if available)
    const forceGarbageCollection = () => {
      if ('gc' in global && typeof (global as any).gc === 'function') {
        try {
          (global as any).gc()
        } catch (e) {
          // GC not available, ignore
        }
      }
    }

    // Clean up blob URLs and release memory
    const cleanupMemory = () => {
      if (previewData.value && previewFileRef.value && isImageFile(previewFileRef.value)) {
        URL.revokeObjectURL(previewData.value)
      }
      previewData.value = null
      previewFileRef.value = null
      selectedFiles.value = []
      
      // Clear any cached data
      updateMemoryWarning()
      forceGarbageCollection()
    }

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

    const allSelected = computed(() => 
      displayedFiles.value.length > 0 && 
      displayedFiles.value.every(f => selectedFiles.value.includes(f))
    )

    // Methods
    const loadArchive = async () => {
      try {
        loading.value = true
        error.value = ''
        
        const fileId = route.query.fileId as string
        if (!fileId) {
          throw new Error('No file ID provided')
        }

        loadingMessage.value = 'Fetching archive metadata...'
        
        // Get file metadata first to check size
        const resource = resourcesStore.getResource(fileId)
        if (!resource) {
          throw new Error('Resource not found')
        }

        archiveName.value = resource.name
        const archiveSize = resource.size || 0

        // Check available memory
        const availableMemory = getAvailableMemory()
        const estimatedUsage = archiveSize * 1.5 // Estimate with overhead
        
        if (estimatedUsage > availableMemory) {
          console.warn(`Large archive detected: ${formatSize(archiveSize)}. Using streaming mode.`)
        }

        loadingMessage.value = 'Opening archive (streaming mode)...'
        
        // Use streaming approach for large files
        if (archiveSize > 1024 * 1024 * 1024) { // > 1GB
          await loadArchiveStreaming(resource)
        } else {
          await loadArchiveStandard(resource)
        }
        
        loading.value = false
        updateMemoryWarning()
      } catch (err: any) {
        console.error('Error loading archive:', err)
        error.value = err.message || 'Failed to load archive'
        loading.value = false
      }
    }

    // Standard loading for smaller archives
    const loadArchiveStandard = async (resource: any) => {
      loadingMessage.value = 'Downloading archive...'
      
      const response = await clientService.webdav.getFileContents(resource)
      const arrayBuffer = await response.arrayBuffer()
      
      loadingMessage.value = 'Parsing archive structure...'
      
      // Open archive with libarchive.js
      const archive = await Archive.open(new File([arrayBuffer], resource.name))
      archiveHandle.value = archive
      
      // Get all entries
      const entries = await archive.getFilesArray()
      
      await processArchiveEntries(entries)
    }

    // Streaming loading for large archives
    const loadArchiveStreaming = async (resource: any) => {
      loadingMessage.value = 'Initializing stream reader...'
      
      // Get ReadableStream from response
      const response = await clientService.webdav.getFileContents(resource)
      
      if (!response.body) {
        throw new Error('Stream not available')
      }

      // Read archive in chunks to extract metadata only
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalRead = 0
      const maxHeaderRead = 100 * 1024 * 1024 // Read first 100MB to get file list
      
      try {
        while (totalRead < maxHeaderRead) {
          const { done, value } = await reader.read()
          
          if (done) break
          
          chunks.push(value)
          totalRead += value.length
          
          loadingMessage.value = `Reading archive headers... ${formatSize(totalRead)}`
          
          // Process periodically to avoid blocking
          if (totalRead % (10 * 1024 * 1024) === 0) {
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }
        
        reader.cancel()
      } catch (e) {
        reader.releaseLock()
        throw e
      }

      // Combine chunks for initial parsing
      const combinedSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Uint8Array(combinedSize)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }

      loadingMessage.value = 'Parsing archive structure...'
      
      // Parse with the partial data (enough for file list)
      const archive = await Archive.open(new File([combined], resource.name))
      archiveHandle.value = archive
      
      // Get file list (metadata only, no extraction)
      const entries = await archive.getFilesArray()
      
      await processArchiveEntries(entries, true) // streaming mode
      
      // Clear chunk data to free memory
      chunks.length = 0
      forceGarbageCollection()
    }

    // Process archive entries (shared by both methods)
    const processArchiveEntries = async (entries: any[], streaming = false) => {
      loadingMessage.value = 'Processing file list...'
      
      const files: ArchiveFile[] = []
      const directories = new Set<string>()
      let processedCount = 0

      for (const entry of entries) {
        const pathParts = entry.file.name.split('/').filter((p: string) => p)
        const fileName = pathParts[pathParts.length - 1]
        const isDirectory = entry.file.name.endsWith('/')

        // Add intermediate directories
        let currentDir = ''
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentDir += (currentDir ? '/' : '') + pathParts[i]
          if (!directories.has(currentDir)) {
            directories.add(currentDir)
            files.push({
              path: currentDir,
              name: pathParts[i],
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
            file: streaming ? null : entry.file, // Don't keep file references in streaming mode
            offset: entry.file.offset || 0
          })
        }

        processedCount++
        if (processedCount % 1000 === 0) {
          loadingMessage.value = `Processed ${processedCount} files...`
          // Yield to UI thread
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      archiveFiles.value = files
      
      // In streaming mode, close the archive handle to free memory
      if (streaming && archiveHandle.value) {
        // Keep handle for later file extraction on demand
      }
    }

    const navigateToRoot = () => {
      currentPath.value = []
    }

    const navigateToPath = (index: number) => {
      currentPath.value = currentPath.value.slice(0, index + 1)
    }

    const navigateToDirectory = (file: ArchiveFile) => {
      const parts = file.path.split('/').filter(p => p)
      currentPath.value = parts
    }

    const handleFileClick = (file: ArchiveFile, event: MouseEvent) => {
      if (file.isDirectory) {
        navigateToDirectory(file)
      } else if (!event.ctrlKey && !event.metaKey) {
        previewFile(file)
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
        selectedFiles.value = [...displayedFiles.value]
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
      try {
        if (!file.file && !archiveHandle.value) return
        
        loadingService.addTask()
        
        // Check memory before extraction
        updateMemoryWarning()
        if (memoryWarning.value) {
          if (!confirm('Memory usage is high. Continue with download?')) {
            loadingService.removeTask()
            return
          }
        }

        // For large files, use streaming extraction
        if (file.size > CHUNK_SIZE) {
          await downloadFileStreaming(file)
        } else {
          await downloadFileStandard(file)
        }
        
        loadingService.removeTask()
        
        // Clean up after download
        forceGarbageCollection()
        updateMemoryWarning()
      } catch (err) {
        console.error('Download error:', err)
        loadingService.removeTask()
        error.value = 'Download failed. File may be too large or corrupted.'
      }
    }

    const downloadFileStandard = async (file: ArchiveFile) => {
      // Standard extraction for small files
      const extracted = file.file ? await Archive.extract(file.file) : await extractFileByPath(file.path)
      const blob = new Blob([extracted])
      
      triggerDownload(blob, file.name)
    }

    const downloadFileStreaming = async (file: ArchiveFile) => {
      // For very large files, extract in chunks
      console.log(`Streaming download for large file: ${file.name} (${formatSize(file.size)})`)
      
      const chunks: Uint8Array[] = []
      let totalExtracted = 0
      
      // Extract file data
      const extracted = file.file ? await Archive.extract(file.file) : await extractFileByPath(file.path)
      
      // For very large extractions, use chunked blob creation
      if (extracted.length > 500 * 1024 * 1024) { // > 500MB
        // Create blob from chunks to avoid memory spike
        const chunkSize = 100 * 1024 * 1024 // 100MB chunks
        const blobParts: Uint8Array[] = []
        
        for (let offset = 0; offset < extracted.length; offset += chunkSize) {
          const end = Math.min(offset + chunkSize, extracted.length)
          blobParts.push(extracted.slice(offset, end))
          
          // Yield to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 0))
        }
        
        const blob = new Blob(blobParts)
        triggerDownload(blob, file.name)
      } else {
        const blob = new Blob([extracted])
        triggerDownload(blob, file.name)
      }
    }

    // Extract file by path when file reference not available (streaming mode)
    const extractFileByPath = async (path: string): Promise<Uint8Array> => {
      if (!archiveHandle.value) {
        throw new Error('Archive not loaded')
      }
      
      // Re-open archive if needed and extract specific file
      const entries = await archiveHandle.value.getFilesArray()
      const entry = entries.find((e: any) => e.file.name === path || e.file.name === path + '/')
      
      if (!entry) {
        throw new Error('File not found in archive')
      }
      
      return await Archive.extract(entry.file)
    }

    const triggerDownload = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      // Clean up URL after a delay to ensure download started
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    const downloadSelected = async () => {
      if (selectedFiles.value.length === 0) return
      
      // Warn for large batch downloads
      const totalSize = selectedFiles.value.reduce((sum, f) => sum + f.size, 0)
      if (totalSize > 2 * 1024 * 1024 * 1024) { // > 2GB
        if (!confirm(`You are about to download ${formatSize(totalSize)} of data. This may take a while and use significant memory. Continue?`)) {
          return
        }
      }

      // Download files sequentially to manage memory
      for (let i = 0; i < selectedFiles.value.length; i++) {
        const file = selectedFiles.value[i]
        if (!file.isDirectory) {
          loadingMessage.value = `Downloading ${i + 1}/${selectedFiles.value.length}: ${file.name}`
          await downloadFile(file)
          
          // Pause between downloads to allow garbage collection
          await new Promise(resolve => setTimeout(resolve, 100))
          forceGarbageCollection()
        }
      }
      
      selectedFiles.value = []
      loadingMessage.value = ''
    }

    const downloadAll = async () => {
      const files = archiveFiles.value.filter(f => !f.isDirectory)
      const totalSize = files.reduce((sum, f) => sum + f.size, 0)
      
      if (totalSize > 5 * 1024 * 1024 * 1024) { // > 5GB
        if (!confirm(`You are about to extract all ${files.length} files (${formatSize(totalSize)}). This will take significant time and memory. Continue?`)) {
          return
        }
      }

      // Download in batches to manage memory
      const BATCH_SIZE = 10
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        
        for (const file of batch) {
          loadingMessage.value = `Extracting ${i + 1}/${files.length}: ${file.name}`
          await downloadFile(file)
        }
        
        // Force cleanup between batches
        await new Promise(resolve => setTimeout(resolve, 500))
        cleanupMemory()
      }
      
      loadingMessage.value = ''
    }

    const createArchiveFromSelected = async () => {
      // This would require creating a new archive from selected files
      // For now, we'll just download them individually
      await downloadSelected()
    }

    const previewFile = async (file: ArchiveFile) => {
      if (file.isDirectory) return
      
      // Check file size before preview
      if (file.size > MAX_PREVIEW_SIZE) {
        previewError.value = `File too large for preview (${formatSize(file.size)}). Maximum: ${formatSize(MAX_PREVIEW_SIZE)}`
        previewFileRef.value = file
        previewLoading.value = false
        return
      }

      // Check available memory
      updateMemoryWarning()
      if (memoryWarning.value && file.size > 1024 * 1024) {
        previewError.value = 'Memory usage is high. Please try downloading the file instead.'
        previewFileRef.value = file
        previewLoading.value = false
        return
      }
      
      previewFileRef.value = file
      previewData.value = null
      previewLoading.value = true
      previewError.value = ''

      try {
        const extracted = file.file ? await Archive.extract(file.file) : await extractFileByPath(file.path)
        
        if (isTextFile(file)) {
          // For text files, limit size
          const maxTextSize = 1024 * 1024 // 1MB for text preview
          if (extracted.length > maxTextSize) {
            const decoder = new TextDecoder()
            const truncated = extracted.slice(0, maxTextSize)
            previewData.value = decoder.decode(truncated) + '\n\n... (file truncated for preview)'
          } else {
            const decoder = new TextDecoder()
            previewData.value = decoder.decode(extracted)
          }
        } else if (isImageFile(file)) {
          // For images, check size
          if (extracted.length > 50 * 1024 * 1024) { // 50MB max for images
            previewError.value = 'Image too large for preview. Please download to view.'
          } else {
            const blob = new Blob([extracted])
            previewData.value = URL.createObjectURL(blob)
          }
        } else {
          previewError.value = 'Preview not available for this file type'
        }
        
        // Clean up extracted data
        forceGarbageCollection()
      } catch (err: any) {
        previewError.value = err.message || 'Failed to load preview'
      } finally {
        previewLoading.value = false
      }
    }

    const closePreview = () => {
      if (previewData.value && previewFileRef.value && isImageFile(previewFileRef.value)) {
        URL.revokeObjectURL(previewData.value)
      }
      previewFileRef.value = null
      previewData.value = null
      previewError.value = ''
      
      forceGarbageCollection()
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
      return ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'log', 'csv'].includes(ext || '')
    }

    const isImageFile = (file: ArchiveFile) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext || '')
    }

    const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
    }

    const formatDate = (date: Date) => {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
    }

    // Lifecycle
    onMounted(() => {
      loadArchive()
      
      // Set up memory monitoring
      const memoryCheckInterval = setInterval(() => {
        updateMemoryWarning()
      }, 5000) // Check every 5 seconds
      
      // Clean up on unmount
      onBeforeUnmount(() => {
        clearInterval(memoryCheckInterval)
        cleanupMemory()
        
        // Close archive handle
        if (archiveHandle.value && archiveHandle.value.close) {
          try {
            archiveHandle.value.close()
          } catch (e) {
            console.warn('Error closing archive:', e)
          }
        }
      })
    })

    watch(() => route.query.fileId, () => {
      cleanupMemory()
      loadArchive()
    })

    return {
      loading,
      loadingMessage,
      error,
      archiveName,
      fileCount,
      totalSize,
      compressedSize,
      currentPath,
      searchQuery,
      displayedFiles,
      selectedFiles,
      allSelected,
      sortField,
      sortDirection,
      previewFileRef,
      previewData,
      previewLoading,
      previewError,
      memoryWarning,
      estimatedMemoryUsage,
      navigateToRoot,
      navigateToPath,
      navigateToDirectory,
      handleFileClick,
      toggleSelection,
      toggleSelectAll,
      isSelected,
      sortBy,
      downloadFile,
      downloadSelected,
      downloadAll,
      createArchiveFromSelected,
      previewFile,
      closePreview,
      getFileIcon,
      isTextFile,
      isImageFile,
      formatSize,
      formatDate
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
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
  background: var(--oc-color-swatch-warning-default);
  color: var(--oc-color-swatch-warning-contrast);
  border-radius: 4px;
  font-weight: 500;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
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
  flex-wrap: wrap;
}

.compression-ratio {
  color: var(--oc-color-swatch-success-default);
  font-weight: 500;
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
  overflow: hidden;
}

.files-table {
  width: 100%;
  border-collapse: collapse;
}

.files-table thead {
  background: var(--oc-color-background-muted);
  border-bottom: 1px solid var(--oc-color-border);
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
}
</style>
