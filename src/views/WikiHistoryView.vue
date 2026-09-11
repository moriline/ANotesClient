<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useConfirm } from '@/composables/useConfirm'
import { getWikiPage, getWikiRevision, getWikiRevisions, updateWikiPage } from '@/api/wiki'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'
import { diffStat, lineDiff } from '@/utils/linediff'
import type { WikiPageResponse, WikiRevisionResponse } from '@/types/domain'

const props = defineProps<{ projectId: string; pageId: string }>()

const router = useRouter()
const dictionaries = useDictionariesStore()
const { confirm } = useConfirm()
const toast = useToast()

const pid = computed(() => Number(props.projectId))
const pageIdNum = computed(() => Number(props.pageId))
const project = computed(() => dictionaries.projectById.get(pid.value))

const page = ref<WikiPageResponse | null>(null)
const revisions = ref<WikiRevisionResponse[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const restoring = ref<number | null>(null)

// Ключ выбранной версии: 'current' — живая страница, иначе id ревизии.
const baseKey = ref<string | null>(null)
const compareKey = ref<string>('current')

// Кэш содержимого версий: 'current' берём из page, ревизии тянем по запросу.
const contentCache = new Map<string, { title: string; content: string }>()
const diffLoading = ref(false)

interface Entry { key: string; label: string; sub: string; revisionId?: number }

const entries = computed<Entry[]>(() => {
  const list: Entry[] = []
  if (page.value) {
    list.push({ key: 'current', label: 'Текущая версия', sub: `изменена ${formatDateTime(page.value.updatedAt)}` })
  }
  for (const r of revisions.value) {
    list.push({
      key: String(r.id),
      label: r.authorName || `Автор #${r.authorId}`,
      sub: formatDateTime(r.createdAt) + (r.comment ? ` · ${r.comment}` : ''),
      revisionId: r.id
    })
  }
  return list
})

async function load() {
  loading.value = true
  loadError.value = null
  try {
    dictionaries.loadProjects().catch(() => {})
    const [p, revs] = await Promise.all([getWikiPage(pageIdNum.value), getWikiRevisions(pageIdNum.value)])
    page.value = p
    revisions.value = revs.slice().sort((a, b) => b.createdAt - a.createdAt)
    contentCache.set('current', { title: p.title, content: p.content })
    // По умолчанию сравниваем два последних снимка; если снимок один — его
    // с текущей версией страницы.
    if (revisions.value.length >= 2) {
      compareKey.value = String(revisions.value[0]!.id)
      baseKey.value = String(revisions.value[1]!.id)
    } else if (revisions.value.length === 1) {
      compareKey.value = 'current'
      baseKey.value = String(revisions.value[0]!.id)
    } else {
      baseKey.value = null
    }
  } catch (e) {
    loadError.value = e instanceof ApiError && (e.status === 404 || e.status === 403)
      ? 'Страница не найдена или недоступна.'
      : 'Не удалось загрузить историю.'
  } finally {
    loading.value = false
  }
}

async function ensureContent(key: string): Promise<{ title: string; content: string } | null> {
  const hit = contentCache.get(key)
  if (hit) return hit
  try {
    const rev = await getWikiRevision(Number(key))
    const val = { title: rev.title, content: rev.content }
    contentCache.set(key, val)
    return val
  } catch {
    return null
  }
}

const diff = ref<ReturnType<typeof lineDiff>>([])
const titleChange = ref<{ from: string; to: string } | null>(null)

async function recomputeDiff() {
  if (!baseKey.value || !compareKey.value || baseKey.value === compareKey.value) {
    diff.value = []
    titleChange.value = null
    return
  }
  diffLoading.value = true
  try {
    const [a, b] = await Promise.all([ensureContent(baseKey.value), ensureContent(compareKey.value)])
    if (!a || !b) {
      diff.value = []
      titleChange.value = null
      return
    }
    diff.value = lineDiff(a.content, b.content)
    titleChange.value = a.title !== b.title ? { from: a.title, to: b.title } : null
  } finally {
    diffLoading.value = false
  }
}

watch([baseKey, compareKey], recomputeDiff)

const stat = computed(() => diffStat(diff.value))

async function restore(revisionId: number) {
  if (!page.value) return
  const rev = revisions.value.find(r => r.id === revisionId)
  if (!rev) return
  const ok = await confirm({
    title: 'Восстановить эту версию?',
    description: `Содержимое страницы заменится текстом версии от ${formatDateTime(rev.createdAt)}. Текущая версия сохранится в истории.`,
    confirmLabel: 'Восстановить',
    danger: false
  })
  if (!ok) return
  restoring.value = revisionId
  try {
    const src = await ensureContent(String(revisionId))
    if (!src) throw new ApiError(0, 'Не удалось получить текст версии')
    const payload = {
      title: src.title,
      content: src.content,
      comment: `Восстановлено из версии от ${formatDateTime(rev.createdAt)}`
    }
    try {
      await updateWikiPage(pageIdNum.value, payload, page.value.version)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const fresh = await getWikiPage(pageIdNum.value)
        await updateWikiPage(pageIdNum.value, payload, fresh.version)
      } else {
        throw e
      }
    }
    await dictionaries.loadWikiTree(pid.value, true)
    toast.add({ title: 'Версия восстановлена', color: 'primary' })
    router.push(`/projects/${pid.value}/wiki/${pageIdNum.value}`)
  } catch (e) {
    toast.add({ title: 'Не удалось восстановить', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    restoring.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="История изменений" :subtitle="project?.name" :bordered="false" />

    <div class="mx-auto w-[95%] px-6 pb-10">
      <RouterLink
        :to="`/projects/${pid}/wiki/${pageIdNum}`"
        class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        {{ page?.title || 'К странице' }}
      </RouterLink>

      <EmptyState v-if="loadError" icon="i-lucide-file-question" title="История недоступна" :description="loadError" />

      <div v-else-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>

      <EmptyState
        v-else-if="!revisions.length"
        icon="i-lucide-history"
        title="История пуста"
        description="Снимок версии создаётся при каждом сохранении страницы. Пока сохранений не было."
      />

      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <div class="flex flex-col gap-1">
          <div class="mb-1 flex items-center gap-4 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span class="w-10 text-center">База</span>
            <span class="w-10 text-center">Сравн.</span>
            <span>Версия</span>
          </div>
          <div
            v-for="e in entries"
            :key="e.key"
            class="flex items-start gap-4 rounded-md px-2 py-2 hover:bg-elevated/50"
          >
            <input
              class="mt-1 w-10"
              type="radio"
              name="base"
              :value="e.key"
              :checked="baseKey === e.key"
              :disabled="e.key === compareKey"
              @change="baseKey = e.key"
            >
            <input
              class="mt-1 w-10"
              type="radio"
              name="compare"
              :value="e.key"
              :checked="compareKey === e.key"
              :disabled="e.key === baseKey"
              @change="compareKey = e.key"
            >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ e.label }}</p>
              <p class="text-xs text-muted">{{ e.sub }}</p>
              <UButton
                v-if="e.revisionId"
                size="xs"
                variant="link"
                color="neutral"
                class="mt-0.5 px-0"
                :loading="restoring === e.revisionId"
                @click="restore(e.revisionId)"
              >
                Восстановить эту версию
              </UButton>
            </div>
          </div>
        </div>

        <div class="min-w-0">
          <div v-if="diffLoading" class="flex flex-col gap-2">
            <USkeleton class="h-6 w-1/3" />
            <USkeleton class="h-48 w-full" />
          </div>
          <div v-else-if="!baseKey || baseKey === compareKey" class="rounded-lg border border-default px-4 py-10 text-center text-sm text-muted">
            Выберите две разные версии для сравнения.
          </div>
          <div v-else class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span class="text-emerald-600">+{{ stat.added }} строк</span>
              <span class="text-red-600">−{{ stat.removed }} строк</span>
              <span v-if="!diff.length" class="text-muted">Содержимое не изменилось</span>
            </div>
            <div
              v-if="titleChange"
              class="rounded-md border border-default px-3 py-2 text-sm"
            >
              Заголовок: <span class="text-red-600 line-through">{{ titleChange.from }}</span>
              → <span class="text-emerald-600">{{ titleChange.to }}</span>
            </div>
            <div v-if="diff.length" class="overflow-x-auto rounded-lg border border-default">
              <pre class="min-w-full text-xs leading-5"><code><span
                v-for="(line, i) in diff"
                :key="i"
                class="block px-3"
                :class="{
                  'bg-emerald-500/10 text-emerald-700': line.type === 'add',
                  'bg-red-500/10 text-red-700': line.type === 'del',
                  'text-muted': line.type === 'ctx'
                }"
              >{{ line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  ' }}{{ line.text || ' ' }}</span></code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
