<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import RelativeTime from '@/components/common/RelativeTime.vue'
import WikiMarkdown from '@/components/wiki/WikiMarkdown.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useConfirm } from '@/composables/useConfirm'
import { deleteWikiPage } from '@/api/wiki'
import { ApiError } from '@/api/http'
import type { WikiBacklinkResponse, WikiPageResponse } from '@/types/domain'

const props = defineProps<{
  page: WikiPageResponse
  backlinks: WikiBacklinkResponse[]
  pageIndex: Map<string, number>
  parentTitle?: string
}>()

const emit = defineEmits<{ deleted: [] }>()

const router = useRouter()
const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const base = computed(() => `/projects/${props.page.projectId}/wiki/${props.page.id}`)

function userName(id: number): string {
  const u = dictionaries.userById.get(id)
  return u?.displayName || u?.username || `Пользователь #${id}`
}

function copyLink() {
  navigator.clipboard?.writeText(window.location.href)
  toast.add({ title: 'Ссылка скопирована', color: 'primary' })
}

async function remove() {
  const ok = await confirm({
    title: `Удалить страницу «${props.page.title}»?`,
    description: 'Ссылки на неё в других страницах станут «красными». Отменить нельзя.',
    danger: true
  })
  if (!ok) return
  try {
    await deleteWikiPage(props.page.id)
    finishDelete()
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const cascade = await confirm({
        title: 'У страницы есть вложенные',
        description: 'Удалить страницу вместе со всеми вложенными страницами? Отменить нельзя.',
        confirmLabel: 'Удалить всё',
        danger: true
      })
      if (!cascade) return
      try {
        await deleteWikiPage(props.page.id, true)
        finishDelete()
      } catch (err) {
        toast.add({ title: 'Не удалось удалить', description: err instanceof ApiError ? err.message : undefined, color: 'error' })
      }
      return
    }
    toast.add({ title: 'Не удалось удалить', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function finishDelete() {
  toast.add({ title: 'Страница удалена', color: 'primary' })
  emit('deleted')
}

const menuItems = [[
  { label: 'Копировать ссылку', icon: 'i-lucide-link', onSelect: copyLink },
  { label: 'История изменений', icon: 'i-lucide-history', onSelect: () => router.push(`${base.value}/history`) }
], [
  { label: 'Удалить страницу', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove }
]]
</script>

<template>
  <article class="min-w-0">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <RouterLink
          v-if="page.parentId"
          :to="`/projects/${page.projectId}/wiki/${page.parentId}`"
          class="mb-1 flex items-center gap-1 text-xs text-muted hover:text-highlighted"
        >
          <UIcon name="i-lucide-corner-left-up" class="size-3.5" />
          {{ parentTitle || 'Родительская страница' }}
        </RouterLink>
        <h1 class="text-2xl font-semibold leading-8 text-highlighted">{{ page.title }}</h1>
        <p v-if="page.summary" class="mt-1 text-sm text-muted">{{ page.summary }}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span class="font-mono">#{{ page.id }}</span>
          <span>·</span>
          <span>Изменил(а) {{ userName(page.updatedBy) }}</span>
          <RelativeTime :value="page.updatedAt" />
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <UButton :to="`${base}/edit`" icon="i-lucide-pencil" size="sm" color="primary">Изменить</UButton>
        <UButton :to="`${base}/history`" icon="i-lucide-history" size="sm" variant="outline" color="primary" />
        <UDropdownMenu :items="menuItems">
          <UButton icon="i-lucide-ellipsis" size="sm" variant="outline" color="primary" />
        </UDropdownMenu>
      </div>
    </div>

    <WikiMarkdown :source="page.content" :project-id="page.projectId" :page-index="pageIndex" />

    <div v-if="backlinks.length" class="mt-10 border-t border-default pt-4">
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Упоминается в ({{ backlinks.length }})
      </p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="b in backlinks" :key="b.pageId">
          <RouterLink
            :to="`/projects/${b.projectId}/wiki/${b.pageId}`"
            class="inline-flex items-center gap-1.5 rounded-md border border-default px-2.5 py-1 text-sm hover:border-primary hover:text-primary"
          >
            <UIcon name="i-lucide-file-text" class="size-3.5 text-muted" />
            {{ b.title }}
          </RouterLink>
        </li>
      </ul>
    </div>
  </article>
</template>
