<script setup lang="ts">
// Панель вложений страницы (wiki_files_client.md §5) — под редактором и под
// просмотром. В режиме чтения (editable=false) только список и скачивание;
// вставка и удаление — только в редакторе, где есть куда вставлять разметку.
import { computed, onMounted, ref, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { listWikiFiles, deleteWikiFile, downloadWikiFile } from '@/api/wikiFiles'
import { ApiError } from '@/api/http'
import type { WikiFileResponse } from '@/types/domain'

const props = withDefaults(defineProps<{ pageId: number; editable?: boolean }>(), {
  editable: false
})
const emit = defineEmits<{ insert: [file: WikiFileResponse]; pick: [] }>()

const toast = useToast()
const { confirm } = useConfirm()

const files = ref<WikiFileResponse[]>([])
const loading = ref(true)
const everLoaded = ref(false)
const expanded = ref(false)
const removingId = ref<number | null>(null)

async function refresh() {
  loading.value = true
  try {
    files.value = await listWikiFiles(props.pageId)
    if (!everLoaded.value) {
      everLoaded.value = true
      expanded.value = files.value.length > 0
    }
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить вложения', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(() => props.pageId, refresh)

defineExpose({ refresh })

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

async function remove(file: WikiFileResponse) {
  removingId.value = file.id
  try {
    await deleteWikiFile(file.id)
    files.value = files.value.filter(f => f.id !== file.id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const ok = await confirm({
        title: `Удалить «${file.originalName}»?`,
        description: 'Файл используется в тексте страницы. После удаления изображение или ссылка станут битыми.',
        confirmLabel: 'Удалить',
        danger: true
      })
      if (ok) {
        try {
          await deleteWikiFile(file.id, true)
          files.value = files.value.filter(f => f.id !== file.id)
        } catch (err) {
          toast.add({ title: 'Не удалось удалить файл', description: err instanceof ApiError ? err.message : undefined, color: 'error' })
        }
      }
    } else {
      toast.add({ title: 'Не удалось удалить файл', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
    }
  } finally {
    removingId.value = null
  }
}

const countLabel = computed(() => files.value.length ? ` (${files.value.length})` : '')

const downloadingId = ref<number | null>(null)
async function download(file: WikiFileResponse) {
  downloadingId.value = file.id
  try {
    await downloadWikiFile(file)
  } catch {
    toast.add({ title: 'Не удалось скачать файл', color: 'error' })
  } finally {
    downloadingId.value = null
  }
}
</script>

<template>
  <div v-if="!loading || everLoaded" class="rounded-lg border border-default">
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      @click="expanded = !expanded"
    >
      <UIcon name="i-lucide-paperclip" class="size-4 shrink-0 text-muted" />
      <span class="flex-1 font-medium">Вложения{{ countLabel }}</span>
      <UButton
        v-if="editable"
        icon="i-lucide-upload"
        size="xs"
        variant="outline"
        color="primary"
        @click.stop="emit('pick')"
      >
        Загрузить
      </UButton>
      <UIcon :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 shrink-0 text-muted" />
    </button>

    <div v-if="expanded" class="flex flex-col divide-y divide-default border-t border-default">
      <p v-if="!files.length" class="px-3 py-3 text-xs text-muted">Вложений пока нет.</p>
      <div v-for="f in files" :key="f.id" class="flex items-center gap-2 px-3 py-2 text-sm">
        <UIcon :name="f.isImage ? 'i-lucide-image' : 'i-lucide-file'" class="size-4 shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate">{{ f.originalName }}</span>
        <span class="hidden shrink-0 text-xs text-muted sm:inline">{{ formatBytes(f.sizeBytes) }}</span>
        <span class="hidden shrink-0 text-xs text-muted md:inline">{{ f.uploadedByName }}</span>
        <UButton
          v-if="editable"
          size="xs"
          variant="outline"
          color="primary"
          @click="emit('insert', f)"
        >
          Вставить
        </UButton>
        <UButton
          v-if="!editable"
          size="xs"
          variant="outline"
          color="primary"
          icon="i-lucide-download"
          :loading="downloadingId === f.id"
          @click="download(f)"
        />
        <UButton
          v-if="editable"
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="neutral"
          :loading="removingId === f.id"
          @click="remove(f)"
        />
      </div>
    </div>
  </div>
</template>
