<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WikiTreeNodeResponse } from '@/types/domain'

// Панель навигации по дереву вики. Дерево двухуровневое (wiki.md §7.3): корневые
// страницы и их прямые дети. Приходит плоским списком, иерархию собираем здесь.

const props = defineProps<{
  nodes: WikiTreeNodeResponse[]
  projectId: number
  currentPageId?: number
}>()

const query = ref('')
const collapsed = ref<Set<number>>(new Set())

// summaryInferred: описание не задано, это обрезка начала текста страницы.
const autoHint = 'Автопревью — своё описание у страницы не задано'

const byPosition = (a: WikiTreeNodeResponse, b: WikiTreeNodeResponse) =>
  a.position - b.position || a.title.localeCompare(b.title)

const roots = computed(() => props.nodes.filter(n => n.parentId == null).sort(byPosition))

const childrenByParent = computed(() => {
  const map = new Map<number, WikiTreeNodeResponse[]>()
  for (const n of props.nodes) {
    if (n.parentId == null) continue
    const list = map.get(n.parentId) ?? []
    list.push(n)
    map.set(n.parentId, list)
  }
  for (const list of map.values()) list.sort(byPosition)
  return map
})

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return null
  return props.nodes
    .filter(n => n.title.toLowerCase().includes(q) || (n.summary?.toLowerCase().includes(q) ?? false))
    .sort((a, b) => a.title.localeCompare(b.title))
})

function toggle(id: number) {
  const next = new Set(collapsed.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsed.value = next
}

function linkTo(id: number) {
  return `/projects/${props.projectId}/wiki/${id}`
}
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <UInput
      v-model="query"
      icon="i-lucide-search"
      size="sm"
      placeholder="Поиск по дереву"
    >
      <template v-if="query" #trailing>
        <UButton icon="i-lucide-x" variant="link" color="neutral" size="xs" aria-label="Очистить" @click="query = ''" />
      </template>
    </UInput>

    <nav class="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
      <!-- Режим поиска: плоский список совпадений -->
      <ul v-if="matches" class="flex flex-col gap-0.5">
        <li v-for="node in matches" :key="node.id">
          <RouterLink
            :to="linkTo(node.id)"
            class="block rounded-md px-2 py-1.5 hover:bg-elevated/60"
            :class="node.id === currentPageId ? 'bg-elevated font-medium text-highlighted' : 'text-default'"
          >
            <span class="block truncate">{{ node.title }}</span>
            <span
              v-if="node.summary"
              class="block truncate text-xs font-normal"
              :class="node.summaryInferred ? 'italic text-dimmed' : 'text-muted'"
              :title="node.summaryInferred ? autoHint : node.summary"
            >{{ node.summary }}</span>
          </RouterLink>
        </li>
        <li v-if="!matches.length" class="px-2 py-2 text-xs text-muted">Ничего не найдено</li>
      </ul>

      <!-- Обычный режим: дерево на два уровня -->
      <ul v-else class="flex flex-col gap-0.5">
        <li v-for="root in roots" :key="root.id">
          <div
            class="group flex items-start gap-0.5 rounded-md pr-1 hover:bg-elevated/60"
            :class="root.id === currentPageId ? 'bg-elevated' : ''"
          >
            <button
              v-if="childrenByParent.get(root.id)?.length"
              type="button"
              class="mt-1.5 flex size-5 shrink-0 items-center justify-center text-muted hover:text-highlighted"
              :aria-label="collapsed.has(root.id) ? 'Развернуть' : 'Свернуть'"
              @click="toggle(root.id)"
            >
              <UIcon :name="collapsed.has(root.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3.5" />
            </button>
            <span v-else class="size-5 shrink-0" />
            <RouterLink
              :to="linkTo(root.id)"
              class="min-w-0 flex-1 py-1.5 pr-1"
              :class="root.id === currentPageId ? 'text-highlighted' : 'text-default'"
            >
              <span class="block truncate" :class="root.id === currentPageId ? 'font-medium' : ''">{{ root.title }}</span>
              <span
                v-if="root.summary"
                class="block truncate text-xs"
                :class="root.summaryInferred ? 'italic text-dimmed' : 'text-muted'"
                :title="root.summaryInferred ? autoHint : root.summary"
              >{{ root.summary }}</span>
              <span v-else class="block truncate text-xs italic text-dimmed">Без описания</span>
            </RouterLink>
            <RouterLink
              :to="{ path: `/projects/${projectId}/wiki/new`, query: { parent: root.id } }"
              class="mt-1.5 hidden size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-elevated hover:text-highlighted group-hover:flex"
              title="Добавить вложенную страницу"
            >
              <UIcon name="i-lucide-plus" class="size-3.5" />
            </RouterLink>
          </div>

          <ul v-if="!collapsed.has(root.id)" class="ml-5 flex flex-col gap-0.5 border-l border-default pl-2">
            <li v-for="child in childrenByParent.get(root.id) ?? []" :key="child.id">
              <RouterLink
                :to="linkTo(child.id)"
                class="block rounded-md px-2 py-1.5 hover:bg-elevated/60"
                :class="child.id === currentPageId ? 'bg-elevated font-medium text-highlighted' : 'text-default'"
              >
                <span class="block truncate">{{ child.title }}</span>
                <span
                  v-if="child.summary"
                  class="block truncate text-xs font-normal"
                  :class="child.summaryInferred ? 'italic text-dimmed' : 'text-muted'"
                  :title="child.summaryInferred ? autoHint : child.summary"
                >{{ child.summary }}</span>
                <span v-else class="block truncate text-xs font-normal italic text-dimmed">Без описания</span>
              </RouterLink>
            </li>
          </ul>
        </li>
        <li v-if="!roots.length" class="px-2 py-2 text-xs text-muted">Пока нет страниц</li>
      </ul>
    </nav>

    <RouterLink
      :to="`/projects/${projectId}/wiki/new`"
      class="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-default py-2 text-sm text-muted hover:border-primary hover:text-primary"
    >
      <UIcon name="i-lucide-plus" class="size-4" />
      Новая страница
    </RouterLink>
  </div>
</template>
