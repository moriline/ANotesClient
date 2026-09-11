<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import WikiTree from '@/components/wiki/WikiTree.vue'
import WikiPageContent from '@/components/wiki/WikiPageContent.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { getWikiBacklinks, getWikiPage } from '@/api/wiki'
import { ApiError } from '@/api/http'
import type { WikiBacklinkResponse, WikiPageResponse, WikiTreeNodeResponse } from '@/types/domain'

const props = defineProps<{ projectId: string; pageId?: string }>()

const router = useRouter()
const dictionaries = useDictionariesStore()

const pid = computed(() => Number(props.projectId))
const pageIdNum = computed(() => {
  const n = Number(props.pageId)
  return props.pageId && Number.isInteger(n) ? n : undefined
})

const project = computed(() => dictionaries.projectById.get(pid.value))
const tree = computed<WikiTreeNodeResponse[]>(() => dictionaries.wikiTreeByProject[pid.value] ?? [])

const treeLoading = ref(true)
const treeError = ref<string | null>(null)

const page = ref<WikiPageResponse | null>(null)
const backlinks = ref<WikiBacklinkResponse[]>([])
const pageLoading = ref(false)
const pageError = ref<string | null>(null)

// Заголовок (в нижнем регистре) → id: резолв [[ссылок]] внутри содержимого.
const pageIndex = computed(() => {
  const map = new Map<string, number>()
  for (const n of tree.value) map.set(n.title.toLowerCase(), n.id)
  return map
})
const parentTitle = computed(() => {
  const pidRef = page.value?.parentId
  if (!pidRef) return undefined
  return tree.value.find(n => n.id === pidRef)?.title
})

const roots = computed(() =>
  tree.value.filter(n => n.parentId == null).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
)

function maybeRedirectToFirst() {
  if (pageIdNum.value || treeLoading.value || treeError.value) return
  const first = roots.value[0]
  if (first) router.replace(`/projects/${pid.value}/wiki/${first.id}`)
}

async function loadTree() {
  treeLoading.value = true
  treeError.value = null
  try {
    await dictionaries.loadWikiTree(pid.value, true)
    dictionaries.loadProjects().catch(() => {})
    dictionaries.loadUsers().catch(() => {})
  } catch (e) {
    treeError.value = e instanceof ApiError && e.status === 403
      ? 'У вас нет доступа к базе знаний этого проекта.'
      : 'Не удалось загрузить базу знаний.'
  } finally {
    treeLoading.value = false
  }
  maybeRedirectToFirst()
}

async function loadPage() {
  const id = pageIdNum.value
  if (!id) {
    page.value = null
    backlinks.value = []
    maybeRedirectToFirst()
    return
  }
  pageLoading.value = true
  pageError.value = null
  try {
    const [p, links] = await Promise.all([getWikiPage(id), getWikiBacklinks(id).catch(() => [])])
    page.value = p
    backlinks.value = links
  } catch (e) {
    page.value = null
    backlinks.value = []
    pageError.value = e instanceof ApiError && (e.status === 404 || e.status === 403)
      ? 'Страница не найдена или недоступна.'
      : 'Не удалось загрузить страницу.'
  } finally {
    pageLoading.value = false
  }
}

async function onDeleted() {
  await dictionaries.loadWikiTree(pid.value, true)
  const next = roots.value[0]
  if (next) router.replace(`/projects/${pid.value}/wiki/${next.id}`)
  else router.replace(`/projects/${pid.value}/wiki`)
}

watch(pid, loadTree, { immediate: true })
watch(pageIdNum, loadPage, { immediate: true })
</script>

<template>
  <div>
    <PageHeader title="База знаний" :subtitle="project?.name">
      <template #actions>
        <HelpLink topic="wiki" label="Справка: база знаний" />
        <UButton :to="`/projects/${pid}/wiki/new`" icon="i-lucide-plus" color="primary">Страница</UButton>
      </template>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <RouterLink
        to="/projects"
        class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Назад к проектам
      </RouterLink>

      <EmptyState
        v-if="treeError"
        icon="i-lucide-lock"
        title="База знаний недоступна"
        :description="treeError"
      />

      <EmptyState
        v-else-if="!treeLoading && !tree.length"
        icon="i-lucide-book-open"
        title="В базе знаний пока пусто"
        description="Соберите здесь знания, связанные с задачами проекта: архитектуру, регламенты, онбординг."
      >
        <template #action>
          <UButton :to="`/projects/${pid}/wiki/new`" color="primary" icon="i-lucide-plus">Создать первую страницу</UButton>
        </template>
      </EmptyState>

      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside class="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <div v-if="treeLoading" class="flex flex-col gap-2">
            <USkeleton class="h-8 w-full" />
            <USkeleton class="h-6 w-3/4" />
            <USkeleton class="h-6 w-2/3" />
          </div>
          <WikiTree
            v-else
            :nodes="tree"
            :project-id="pid"
            :current-page-id="pageIdNum"
          />
        </aside>

        <main class="min-w-0">
          <div v-if="pageLoading" class="flex flex-col gap-3">
            <USkeleton class="h-8 w-1/2" />
            <USkeleton class="h-4 w-1/3" />
            <USkeleton class="mt-4 h-40 w-full" />
          </div>

          <EmptyState
            v-else-if="pageError"
            icon="i-lucide-file-question"
            title="Страница недоступна"
            :description="pageError"
          />

          <WikiPageContent
            v-else-if="page"
            :page="page"
            :backlinks="backlinks"
            :page-index="pageIndex"
            :parent-title="parentTitle"
            @deleted="onDeleted"
          />

          <p v-else class="py-16 text-center text-sm text-muted">Выберите страницу слева.</p>
        </main>
      </div>
    </div>
  </div>
</template>
