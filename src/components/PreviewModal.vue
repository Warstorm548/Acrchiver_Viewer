<template>
  <oc-modal
    :title="entry.name"
    hide-actions
    element-class="archive-preview-modal"
    @cancel="$emit('close')"
  >
    <template #content>
      <div v-if="loading" class="ext:flex ext:justify-center ext:p-4">
        <oc-spinner :aria-label="$gettext('Loading preview')" />
      </div>
      <p v-else-if="message" class="archive-preview-message" v-text="message" />
      <template v-else>
        <pre
          v-if="text !== null"
          class="archive-preview-text ext:max-h-[60vh] ext:overflow-auto ext:whitespace-pre-wrap ext:break-words ext:text-sm"
          v-text="text"
        />
        <img
          v-else-if="imageUrl"
          class="archive-preview-image ext:max-h-[60vh] ext:max-w-full ext:mx-auto"
          :src="imageUrl"
          :alt="entry.name"
          @error="imageFailed"
        />
        <p
          v-if="truncated"
          class="archive-preview-truncated ext:mt-2 ext:text-sm"
          v-text="$gettext('Only the beginning of the file is shown.')"
        />
      </template>
      <div class="ext:mt-4 ext:flex ext:justify-end ext:gap-2">
        <oc-button
          v-if="entry.supported"
          class="archive-preview-download"
          appearance="outline"
          @click="$emit('download', entry)"
        >
          <oc-icon name="download" />
          <span v-text="$gettext('Download')" />
        </oc-button>
        <oc-button class="archive-preview-close" appearance="filled" @click="$emit('close')">
          <span v-text="$gettext('Close')" />
        </oc-button>
      </div>
    </template>
  </oc-modal>
</template>

<script lang="ts">
import { defineComponent, onBeforeUnmount, onMounted, PropType, ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import { ArchiveEntry, ArchiveHandle } from '../engine'
import { isImageFile, isTextFile } from '../engine/fileTypes'

/** Entries larger than this aren't decompressed for a preview. */
export const MAX_PREVIEW_SIZE = 10 * 1024 * 1024
/** Longest text shown in the preview. */
export const MAX_TEXT_PREVIEW = 1024 * 1024

export default defineComponent({
  name: 'PreviewModal',
  props: {
    /** The archive in browser mode; null when the helper reads it (then `read` is used). */
    handle: { type: Object as PropType<ArchiveHandle>, required: false, default: null },
    entry: { type: Object as PropType<ArchiveEntry>, required: true },
    /** Reads the entry (with the browser's size cap and progress); defaults to `handle.read`. */
    read: {
      type: Function as PropType<(entry: ArchiveEntry) => Promise<Blob>>,
      required: false,
      default: null
    }
  },
  emits: ['close', 'download'],
  setup(props) {
    const { $gettext } = useGettext()
    const loading = ref(true)
    const message = ref('')
    const text = ref<string | null>(null)
    const imageUrl = ref('')
    const truncated = ref(false)

    const load = async () => {
      const { entry } = props
      if (!entry.supported) {
        message.value = entry.encrypted
          ? $gettext('This file is password protected and cannot be previewed.')
          : $gettext('This file cannot be read.')
        return
      }
      if (!isTextFile(entry.name) && !isImageFile(entry.name)) {
        message.value = $gettext('No preview available for this file type.')
        return
      }
      if (entry.size > MAX_PREVIEW_SIZE) {
        message.value = $gettext('This file is too large to preview. Download it instead.')
        return
      }
      const blob = await (props.read ? props.read(entry) : props.handle.read(entry))
      if (isTextFile(entry.name)) {
        truncated.value = blob.size > MAX_TEXT_PREVIEW
        text.value = new TextDecoder().decode(await blob.slice(0, MAX_TEXT_PREVIEW).arrayBuffer())
      } else {
        imageUrl.value = URL.createObjectURL(blob)
      }
    }

    onMounted(async () => {
      try {
        await load()
      } catch (error) {
        console.error(error)
        message.value = $gettext('The preview could not be loaded.')
      } finally {
        loading.value = false
      }
    })

    /** The browser refused to decode the image (damaged, or too many pixels to hold in memory). */
    const imageFailed = () => {
      message.value = $gettext('This image could not be displayed. Download it instead.')
    }

    onBeforeUnmount(() => {
      if (imageUrl.value) {
        URL.revokeObjectURL(imageUrl.value)
      }
    })

    return { loading, message, text, imageUrl, truncated, imageFailed }
  }
})
</script>
