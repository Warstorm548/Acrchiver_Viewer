<template>
  <div class="archive-viewer flex flex-col items-center justify-center h-full p-4 gap-2">
    <oc-icon name="file-zip" size="xlarge" />
    <h1 class="archive-viewer-name text-lg font-semibold" v-text="resource.name" />
    <p class="archive-viewer-size" v-text="fileSize" />
    <p class="archive-viewer-placeholder" v-text="$gettext('Archive contents will appear here.')" />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType } from 'vue'
import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject, formatFileSize } from '@opencloud-eu/web-pkg'
import { useGettext } from 'vue3-gettext'

export default defineComponent({
  name: 'ArchiveViewer',
  props: {
    applicationConfig: { type: Object as PropType<AppConfigObject>, required: true },
    resource: { type: Object as PropType<Resource>, required: true }
  },
  setup(props) {
    const { current: currentLanguage } = useGettext()

    const fileSize = computed(() => formatFileSize(props.resource.size, currentLanguage))

    return {
      fileSize
    }
  }
})
</script>
