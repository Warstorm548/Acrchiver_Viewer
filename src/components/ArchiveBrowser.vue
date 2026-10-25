<template>
  <div class="archive-browser ext:flex ext:flex-col ext:gap-3 ext:h-full">
    <div class="archive-toolbar ext:flex ext:flex-wrap ext:items-end ext:justify-between ext:gap-2">
      <oc-text-input
        v-model="searchQuery"
        class="archive-search ext:w-full ext:max-w-sm"
        :label="$gettext('Search in archive')"
        clear-button-enabled
      />
      <oc-button
        class="archive-download-selected"
        appearance="filled"
        :disabled="selectedPaths.size === 0 || downloading"
        :show-spinner="downloading"
        @click="downloadSelection"
      >
        <oc-icon name="download" />
        <span v-text="selectionLabel" />
      </oc-button>
    </div>

    <p
      v-if="extracting"
      class="archive-extracting ext:flex ext:items-center ext:gap-2 ext:text-sm"
      role="status"
    >
      <oc-spinner size="small" :aria-label="$gettext('Extracting')" />
      <span v-text="extractingText" />
    </p>

    <nav
      v-if="!searchQuery"
      class="archive-breadcrumb ext:flex ext:flex-wrap ext:items-center ext:gap-1 ext:text-sm"
    >
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
        <oc-icon v-if="index > 0" name="arrow-right-s" size="small" />
        <button
          type="button"
          class="archive-crumb ext:hover:underline"
          :class="{ 'ext:font-semibold': index === breadcrumbs.length - 1 }"
          @click="openFolder(crumb.path)"
          v-text="crumb.label"
        />
      </template>
    </nav>
    <p
      v-else
      class="archive-search-summary ext:text-sm"
      v-text="
        $ngettext('%{count} result', '%{count} results', rows.length, {
          count: String(rows.length)
        })
      "
    />

    <div class="ext:overflow-auto">
      <table class="archive-table ext:w-full ext:text-sm">
        <thead>
          <tr class="ext:text-left">
            <th class="ext:w-8 ext:p-2">
              <oc-checkbox
                :model-value="allRowsSelected"
                :label="$gettext('Select all')"
                label-hidden
                @update:model-value="toggleAll"
              />
            </th>
            <th v-for="column in columns" :key="column.field" class="ext:p-2">
              <button
                type="button"
                class="archive-sort ext:flex ext:items-center ext:gap-1"
                :data-field="column.field"
                @click="sortBy(column.field)"
              >
                <span v-text="column.label" />
                <oc-icon
                  v-if="sortField === column.field"
                  :name="sortDirection === 'asc' ? 'arrow-up-s' : 'arrow-down-s'"
                  size="small"
                />
              </button>
            </th>
            <th class="ext:p-2 ext:sr-only" v-text="$gettext('Actions')" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in rows"
            :key="entry.path"
            class="archive-row ext:border-t ext:cursor-pointer ext:hover:bg-role-surface-container"
            :class="{ 'archive-row-unsupported ext:opacity-60': !entry.supported }"
            :data-path="entry.path"
            @click="activate(entry)"
          >
            <td class="ext:p-2" @click.stop>
              <oc-checkbox
                :model-value="selectedPaths.has(entry.path)"
                :label="$gettext('Select %{name}', { name: entry.name })"
                label-hidden
                @update:model-value="toggleSelection(entry)"
              />
            </td>
            <td class="ext:p-2">
              <span class="ext:flex ext:items-center ext:gap-2">
                <oc-icon :name="iconFor(entry)" />
                <span class="archive-name ext:break-all" v-text="entry.name" />
                <oc-icon v-if="entry.encrypted" name="lock" size="small" />
              </span>
              <span
                v-if="searchQuery && parentOf(entry)"
                class="archive-row-folder ext:block ext:text-xs ext:opacity-70 ext:break-all"
                v-text="parentOf(entry)"
              />
            </td>
            <td
              class="ext:p-2 ext:whitespace-nowrap"
              v-text="entry.isDirectory ? '–' : formatSize(entry.size)"
            />
            <td class="ext:p-2 ext:whitespace-nowrap" v-text="formatDate(entry.modified)" />
            <td class="ext:p-2 ext:whitespace-nowrap ext:text-right" @click.stop>
              <oc-button
                v-if="canPreview(entry)"
                class="archive-preview"
                appearance="raw"
                size="small"
                :aria-label="$gettext('Preview %{name}', { name: entry.name })"
                @click="previewEntry = entry"
              >
                <oc-icon name="eye" />
              </oc-button>
              <oc-button
                v-if="!entry.isDirectory && entry.supported"
                class="archive-download"
                appearance="raw"
                size="small"
                :aria-label="$gettext('Download %{name}', { name: entry.name })"
                @click="downloadEntry(entry)"
              >
                <oc-icon name="download" />
              </oc-button>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td
              colspan="5"
              class="archive-empty ext:p-4 ext:text-center"
              v-text="
                searchQuery ? $gettext('No matching files') : $gettext('This folder is empty')
              "
            />
          </tr>
        </tbody>
      </table>
    </div>

    <preview-modal
      v-if="previewEntry"
      :handle="handle"
      :entry="previewEntry"
      :read="readEntry"
      @close="previewEntry = null"
      @download="downloadEntry"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { formatFileSize, useMessages } from '@opencloud-eu/web-pkg'
import {
  ArchiveEntry,
  ArchiveError,
  ArchiveHandle,
  archiveExtension,
  buildIndex,
  isOutOfMemory,
  parentPath
} from '../engine'
import { isImageFile, isTextFile } from '../engine/fileTypes'
import { triggerDownload, zipEntries } from '../download'
import PreviewModal from './PreviewModal.vue'

type SortField = 'name' | 'size' | 'modified'

export default defineComponent({
  name: 'ArchiveBrowser',
  components: { PreviewModal },
  props: {
    handle: { type: Object as PropType<ArchiveHandle>, required: true },
    archiveName: { type: String, required: true },
    /** Largest file (or selection total) that may be read out of the archive. */
    maxEntrySize: { type: Number, required: false, default: Number.MAX_SAFE_INTEGER },
    /** Bytes fetched by range requests so far; drives the extraction progress for remote ZIPs. */
    bytesRead: { type: Number, required: false, default: 0 }
  },
  setup(props) {
    const { $gettext, current: currentLanguage } = useGettext()
    const { showErrorMessage } = useMessages()
    const index = computed(() => buildIndex(props.handle.entries))

    const currentFolder = ref('')
    const searchQuery = ref('')
    const sortField = ref<SortField>('name')
    const sortDirection = ref<'asc' | 'desc'>('asc')
    const selectedPaths = ref(new Set<string>())
    const previewEntry = ref<ArchiveEntry | null>(null)
    const downloading = ref(false)

    const columns = computed(() => [
      { field: 'name' as SortField, label: $gettext('Name') },
      { field: 'size' as SortField, label: $gettext('Size') },
      { field: 'modified' as SortField, label: $gettext('Modified') }
    ])

    const compare = (a: ArchiveEntry, b: ArchiveEntry): number => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      let result = 0
      if (sortField.value === 'size') {
        result = a.size - b.size
      } else if (sortField.value === 'modified') {
        result = (a.modified?.getTime() ?? 0) - (b.modified?.getTime() ?? 0)
      }
      if (result === 0) {
        result = a.name.localeCompare(b.name, undefined, { numeric: true })
      }
      return sortDirection.value === 'asc' ? result : -result
    }

    const rows = computed(() => {
      const query = searchQuery.value.trim().toLowerCase()
      const entries = query
        ? index.value.entries.filter((entry) => entry.name.toLowerCase().includes(query))
        : index.value.children(currentFolder.value)
      return [...entries].sort(compare)
    })

    const breadcrumbs = computed(() => {
      const crumbs = [{ path: '', label: props.archiveName }]
      let path = ''
      for (const segment of currentFolder.value.split('/').filter(Boolean)) {
        path = path ? `${path}/${segment}` : segment
        crumbs.push({ path, label: segment })
      }
      return crumbs
    })

    const allRowsSelected = computed(
      () => rows.value.length > 0 && rows.value.every((e) => selectedPaths.value.has(e.path))
    )

    const selectionLabel = computed(() =>
      selectedPaths.value.size
        ? $gettext('Download selected (%{count})', { count: String(selectedPaths.value.size) })
        : $gettext('Download selected')
    )

    const openFolder = (path: string) => {
      currentFolder.value = path
      searchQuery.value = ''
    }

    const sortBy = (field: SortField) => {
      if (sortField.value === field) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      } else {
        sortField.value = field
        sortDirection.value = 'asc'
      }
    }

    const toggleSelection = (entry: ArchiveEntry) => {
      const next = new Set(selectedPaths.value)
      if (!next.delete(entry.path)) {
        next.add(entry.path)
      }
      selectedPaths.value = next
    }

    const toggleAll = (checked: boolean) => {
      const next = new Set(selectedPaths.value)
      rows.value.forEach((entry) => (checked ? next.add(entry.path) : next.delete(entry.path)))
      selectedPaths.value = next
    }

    const canPreview = (entry: ArchiveEntry) =>
      !entry.isDirectory && (isTextFile(entry.name) || isImageFile(entry.name))

    const activate = (entry: ArchiveEntry) => {
      if (entry.isDirectory) {
        openFolder(entry.path)
      } else {
        previewEntry.value = entry
      }
    }

    const formatSize = (size: number) => formatFileSize(size, currentLanguage)

    const tooLargeError = () =>
      new Error(
        $gettext(
          'Files larger than %{limit} cannot be extracted in the browser on this device. Download the whole archive instead.',
          { limit: formatSize(props.maxEntrySize) }
        )
      )

    const outOfMemoryError = () =>
      new Error(
        $gettext(
          'This device does not have enough free memory to extract this. Download the whole archive instead.'
        )
      )

    const reportError = (title: string, error: unknown) => {
      console.error(error)
      let shown = error
      if (error instanceof ArchiveError && error.code === 'too-large') {
        shown = tooLargeError()
      } else if (
        isOutOfMemory(error) ||
        (error instanceof ArchiveError && error.code === 'out-of-memory')
      ) {
        shown = outOfMemoryError()
      }
      showErrorMessage({ title, errors: [shown as Error] })
    }

    /** What is being read right now, for the progress line (`start` = bytesRead at the start). */
    const extracting = ref<{ name: string; start: number; total: number } | null>(null)
    const extractingText = computed(() => {
      const current = extracting.value
      if (!current) {
        return ''
      }
      const done = props.bytesRead - current.start
      if (done <= 0 || current.total <= 0) {
        return $gettext('Extracting %{name}…', { name: current.name })
      }
      return $gettext('Extracting %{name}… %{percent}%', {
        name: current.name,
        percent: String(Math.min(100, Math.round((done / current.total) * 100)))
      })
    })

    const withProgress = async <T,>(name: string, total: number, work: () => Promise<T>) => {
      extracting.value = { name, start: props.bytesRead, total }
      try {
        return await work()
      } finally {
        extracting.value = null
      }
    }

    /** Reads one entry, refusing up front when it is known to be over the cap. */
    const readEntry = (entry: ArchiveEntry): Promise<Blob> => {
      if (entry.size > props.maxEntrySize) {
        return Promise.reject(new ArchiveError('too-large', `"${entry.name}" is too large`))
      }
      return withProgress(entry.name, entry.compressedSize ?? entry.size, () =>
        props.handle.read(entry)
      )
    }

    const downloadEntry = async (entry: ArchiveEntry) => {
      try {
        triggerDownload(await readEntry(entry), entry.name)
      } catch (error) {
        reportError($gettext('Failed to download "%{name}"', { name: entry.name }), error)
      }
    }

    /** Files covered by the selection: selected files plus everything inside selected folders. */
    const selectedFiles = (): ArchiveEntry[] => {
      const files = new Map<string, ArchiveEntry>()
      for (const path of selectedPaths.value) {
        const entry = index.value.get(path)
        const covered = entry?.isDirectory ? index.value.filesBelow(path) : [entry]
        covered.filter((e) => e?.supported).forEach((e) => files.set(e.path, e))
      }
      return [...files.values()]
    }

    const downloadSelection = async () => {
      const files = selectedFiles()
      if (files.length === 0) {
        return
      }
      const total = files.reduce((sum, file) => sum + file.size, 0)
      if (total > props.maxEntrySize) {
        reportError(
          $gettext('Failed to download the selection'),
          new ArchiveError('too-large', 'Selection too large')
        )
        return
      }
      downloading.value = true
      try {
        if (files.length === 1) {
          triggerDownload(await readEntry(files[0]), files[0].name)
        } else {
          const extension = archiveExtension(props.archiveName)
          const baseName = extension
            ? props.archiveName.slice(0, -(extension.length + 1))
            : props.archiveName
          const fileName = `${baseName}-selection.zip`
          const compressed = files.reduce(
            (sum, file) => sum + (file.compressedSize ?? file.size),
            0
          )
          const zip = await withProgress(fileName, compressed, () =>
            zipEntries(props.handle, files, props.maxEntrySize)
          )
          triggerDownload(zip, fileName)
        }
      } catch (error) {
        reportError($gettext('Failed to download the selection'), error)
      } finally {
        downloading.value = false
      }
    }

    const iconFor = (entry: ArchiveEntry) => {
      if (entry.isDirectory) {
        return 'folder'
      }
      if (isImageFile(entry.name)) {
        return 'image'
      }
      return isTextFile(entry.name) ? 'file-text' : 'file'
    }

    const formatDate = (date?: Date) =>
      date && !isNaN(date.getTime()) ? date.toLocaleString(currentLanguage) : '–'
    const parentOf = (entry: ArchiveEntry) => parentPath(entry.path)

    return {
      columns,
      rows,
      breadcrumbs,
      currentFolder,
      searchQuery,
      sortField,
      sortDirection,
      selectedPaths,
      allRowsSelected,
      selectionLabel,
      previewEntry,
      downloading,
      extracting,
      extractingText,
      readEntry,
      openFolder,
      sortBy,
      toggleSelection,
      toggleAll,
      canPreview,
      activate,
      downloadEntry,
      downloadSelection,
      iconFor,
      formatSize,
      formatDate,
      parentOf
    }
  }
})
</script>
