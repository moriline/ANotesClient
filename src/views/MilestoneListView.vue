<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import MilestoneFormModal from '@/components/milestone/MilestoneFormModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { ApiError } from '@/api/http'
import { formatDate, plural } from '@/utils/format'
import { MILESTONE_STATE_META, dueLabel, milestonePercent } from '@/utils/milestoneState'

const props = defineProps<{ projectId: string }>()

const dictionaries = useDictionariesStore()

const pid = computed(() => Number(props.projectId))
const project = computed(() => dictionaries.projectById.get(pid.value))

const loading = ref(true)
const errorText = ref<string | null>(null)
const showClosed = ref(false)
const createOpen = ref(false)

const milestones = computed(() => dictionaries.milestonesByProject[pid.value] ?? [])
const visible = computed(() =>
  milestones.value.filter(m => showClosed.value || m.state !== 'CLOSED')
)
const closedCount = computed(() => milestones.value.filter(m => m.state === 'CLOSED').length)

async function load() {
  loading.value = true
  errorText.value = null
  try {
    dictionaries.loadProjects().catch(() => {})
    await dictionaries.loadMilestones(pid.value, true)
  } catch (e) {
    if (e instanceof ApiError) {
      errorText.value = e.status === 403
        ? 'Вы не участник этого проекта — вехи недоступны.'
        : e.status === 404
          ? 'Проект не найден.'
          : e.message
    } else {
      errorText.value = 'Не удалось загрузить вехи.'
    }
  } finally {
    loading.value = false
  }
}

watch(pid, load, { immediate: true })
</script>

<template>
  <div>
    <PageHeader title="Вехи" :subtitle="project?.name">
      <template #actions>
        <HelpLink topic="milestones" label="Справка: вехи" />
        <UButton icon="i-lucide-plus" color="primary" @click="createOpen = true">Веха</UButton>
      </template>
      <UCheckbox
        v-if="closedCount"
        v-model="showClosed"
        :label="`Показать закрытые (${closedCount})`"
      />
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
        v-if="errorText"
        icon="i-lucide-triangle-alert"
        title="Вехи недоступны"
        :description="errorText"
      />

      <div v-else-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
      </div>

      <EmptyState
        v-else-if="!milestones.length"
        icon="i-lucide-diamond"
        title="В проекте нет вех"
        description="Веха — контрольная точка по сроку: релиз, демо, конец беты. Создайте первую."
      >
        <template #action>
          <UButton icon="i-lucide-plus" color="primary" @click="createOpen = true">Создать веху</UButton>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="!visible.length"
        icon="i-lucide-diamond"
        title="Все вехи закрыты"
        description="Открытых вех нет. Включите «Показать закрытые», чтобы увидеть завершённые."
      />

      <ul v-else class="rounded-lg border border-default">
        <RouterLink
          v-for="m in visible"
          :key="m.id"
          :to="`/projects/${pid}/milestones/${m.id}`"
          class="block border-b border-default px-4 py-3 last:border-b-0 hover:bg-elevated/50"
          :class="MILESTONE_STATE_META[m.state].dim && 'opacity-60'"
        >
          <div class="mb-1.5 flex items-center gap-2">
            <UIcon
              :name="m.state === 'CLOSED' ? 'i-lucide-diamond' : 'i-lucide-diamond-plus'"
              class="size-4 shrink-0"
              :class="MILESTONE_STATE_META[m.state].text"
            />
            <span class="truncate text-sm font-medium" :class="m.state === 'CLOSED' && 'line-through decoration-1'">
              {{ m.title }}
            </span>
            <UBadge
              v-if="m.state === 'READY'"
              size="xs"
              variant="subtle"
              color="primary"
            >
              Готова к закрытию
            </UBadge>
            <span class="flex-1" />
            <span class="shrink-0 text-xs" :class="m.state === 'LATE' ? 'text-error' : 'text-muted'">
              {{ dueLabel(m.dueDate, m.state === 'CLOSED') }}
            </span>
          </div>

          <div class="flex items-center gap-3 pl-6">
            <UProgress
              v-if="m.taskTotal > 1"
              :model-value="m.taskDone"
              :max="m.taskTotal"
              :color="MILESTONE_STATE_META[m.state].color"
              size="xs"
              class="max-w-64 flex-1"
            />
            <span v-else class="flex-1" />
            <span class="shrink-0 font-mono text-xs text-muted">
              {{ m.taskTotal ? `${m.taskDone}/${m.taskTotal}` : 'нет задач' }}
              <span v-if="m.taskTotal">· {{ milestonePercent(m) }}%</span>
              <span v-if="m.taskOverdue" class="text-error"> · {{ m.taskOverdue }} {{ plural(m.taskOverdue, ['просрочена', 'просрочены', 'просрочены']) }}</span>
            </span>
            <span class="shrink-0 font-mono text-xs text-muted">{{ formatDate(m.dueDate) }}</span>
          </div>
        </RouterLink>
      </ul>
    </div>

    <MilestoneFormModal
      v-model:open="createOpen"
      :project-id="pid"
      @created="load"
    />
  </div>
</template>
