<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NotFoundView from '@/views/NotFoundView.vue'
import MarkdownView from '@/components/common/MarkdownView.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import MilestoneTaskList from '@/components/milestone/MilestoneTaskList.vue'
import MilestoneFormModal from '@/components/milestone/MilestoneFormModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useConfirm } from '@/composables/useConfirm'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import {
  getMilestone,
  closeMilestone,
  reopenMilestone,
  deleteMilestone
} from '@/api/milestones'
import { ApiError } from '@/api/http'
import { formatDate } from '@/utils/format'
import { MILESTONE_STATE_META, dueLabel } from '@/utils/milestoneState'
import type { MilestoneResponse } from '@/types/domain'

const props = defineProps<{ projectId: string; milestoneId: string }>()
const router = useRouter()
const dictionaries = useDictionariesStore()
const { confirm } = useConfirm()
const toast = useToast()

const pid = computed(() => Number(props.projectId))
const mid = computed(() => Number(props.milestoneId))
const project = computed(() => dictionaries.projectById.get(pid.value))

const milestone = ref<MilestoneResponse | null>(null)
const loading = ref(true)
const notFound = ref(false)
const busy = ref(false)
const editOpen = ref(false)

const meta = computed(() => milestone.value && MILESTONE_STATE_META[milestone.value.state])
const closed = computed(() => milestone.value?.state === 'CLOSED')

async function load() {
  loading.value = true
  notFound.value = false
  milestone.value = null
  try {
    dictionaries.loadProjects().catch(() => {})
    dictionaries.loadMilestones(pid.value).catch(() => {})
    milestone.value = await getMilestone(mid.value)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      notFound.value = true
    } else {
      toast.add({
        title: 'Не удалось загрузить веху',
        description: e instanceof ApiError ? e.message : undefined,
        color: 'error'
      })
    }
  } finally {
    loading.value = false
  }
}

// Прогресс и state считает сервер — после правки задач перечитываем веху целиком.
async function refresh() {
  try {
    milestone.value = await getMilestone(mid.value)
    dictionaries.loadMilestones(pid.value, true).catch(() => {})
  } catch { /* не критично */ }
}

watch([pid, mid], load, { immediate: true })

async function close() {
  if (!milestone.value) return
  const incomplete = milestone.value.taskTotal - milestone.value.taskDone
  const ok = await confirm({
    title: 'Закрыть веху?',
    description: incomplete > 0
      ? `В вехе осталось ${incomplete} незакрытых задач(и). Их можно перенести в другую веху позже. Закрыть сейчас?`
      : 'Все задачи вехи выполнены. Отметить веху завершённой?',
    confirmLabel: 'Закрыть веху',
    danger: false
  })
  if (!ok) return
  busy.value = true
  try {
    milestone.value = await closeMilestone(milestone.value.id)
    dictionaries.loadMilestones(pid.value, true).catch(() => {})
    toast.add({ title: 'Веха закрыта', color: 'primary' })
  } catch (e) {
    toast.add({
      title: 'Не удалось закрыть веху',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    busy.value = false
  }
}

async function reopen() {
  if (!milestone.value) return
  busy.value = true
  try {
    milestone.value = await reopenMilestone(milestone.value.id)
    dictionaries.loadMilestones(pid.value, true).catch(() => {})
    toast.add({ title: 'Веха открыта заново', color: 'primary' })
  } catch (e) {
    toast.add({
      title: 'Не удалось открыть веху',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    busy.value = false
  }
}

// --- Удаление ---------------------------------------------------------------
// Задачи вехи НЕ удаляются никогда (plan.md §4.4). Если задачи есть — выбор:
// открепить (milestoneId=null) или перенести в другую открытую веху.
const deleteOpen = ref(false)
const deleting = ref(false)
const moveTargetId = ref<number | undefined>()

const otherOpenMilestones = computed(() =>
  (dictionaries.milestonesByProject[pid.value] ?? [])
    .filter(m => m.id !== mid.value && m.state !== 'CLOSED')
    .map(m => ({ label: `${m.title} — ${formatDate(m.dueDate)}`, value: m.id }))
)

async function startDelete() {
  if (!milestone.value) return
  if (milestone.value.taskTotal > 0) {
    moveTargetId.value = undefined
    deleteOpen.value = true
    return
  }
  const ok = await confirm({
    title: `Удалить веху «${milestone.value.title}»?`,
    description: 'Веха будет удалена. Это действие нельзя отменить.'
  })
  if (ok) await doDelete()
}

async function doDelete(opts: { tasks?: 'detach' | 'move'; to?: number } = {}) {
  if (!milestone.value) return
  deleting.value = true
  try {
    await deleteMilestone(milestone.value.id, opts)
    deleteOpen.value = false
    bumpTasksVersion()
    dictionaries.loadMilestones(pid.value, true).catch(() => {})
    toast.add({ title: 'Веха удалена', color: 'primary' })
    router.push(`/projects/${pid.value}/milestones`)
  } catch (e) {
    toast.add({
      title: 'Не удалось удалить веху',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

function onTasksChanged() {
  refresh()
}

function onEdited(updated: MilestoneResponse) {
  milestone.value = updated
}
</script>

<template>
  <div v-if="notFound">
    <NotFoundView title="Веха не найдена" />
  </div>
  <div v-else class="mx-auto w-[95%] px-6 py-6">
    <RouterLink
      :to="`/projects/${pid}/milestones`"
      class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      Вехи{{ project ? ` · ${project.name}` : '' }}
    </RouterLink>

    <div v-if="loading" class="flex flex-col gap-3">
      <USkeleton class="h-7 w-1/3" />
      <USkeleton class="h-4 w-1/2" />
      <USkeleton class="h-24 w-full" />
    </div>

    <template v-else-if="milestone && meta">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <UIcon
              :name="closed ? 'i-lucide-diamond' : 'i-lucide-diamond-plus'"
              class="size-5 shrink-0"
              :class="meta.text"
            />
            <h1 class="text-xl font-semibold leading-7" :class="closed && 'text-muted'">
              {{ milestone.title }}
            </h1>
            <UBadge size="sm" variant="subtle" :color="meta.color">{{ meta.label }}</UBadge>
            <HelpLink
              topic="milestones"
              hash="states"
              label="Справка: состояния вехи"
              hint="Состояние вехи (Запланирована, В работе, Под риском, Просрочена, Готова к закрытию, Закрыта) считает сервер по составу задач и сроку — вручную не выставить."
            />
          </div>
          <p class="mt-1.5 text-sm text-muted">
            Срок {{ formatDate(milestone.dueDate) }}
            <template v-if="!closed"> · {{ dueLabel(milestone.dueDate) }}</template>
            · {{ milestone.taskDone }} из {{ milestone.taskTotal }}
            <template v-if="milestone.taskOverdue">
              · <span class="text-error">{{ milestone.taskOverdue }} просрочено</span>
            </template>
            <template v-if="closed && milestone.closedByName">
              · закрыл(а) {{ milestone.closedByName }}
            </template>
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <UButton
            v-if="!closed"
            color="primary"
            :loading="busy"
            @click="close"
          >
            Закрыть веху
          </UButton>
          <UButton
            v-else
            variant="outline"
            color="primary"
            :loading="busy"
            @click="reopen"
          >
            Открыть заново
          </UButton>
          <UDropdownMenu
            :items="[[
              { label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => { editOpen = true } }
            ], [
              { label: 'Удалить веху', icon: 'i-lucide-trash-2', color: 'error', onSelect: startDelete }
            ]]"
          >
            <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" />
          </UDropdownMenu>
        </div>
      </div>

      <UProgress
        class="mt-4"
        :model-value="milestone.taskDone"
        :max="Math.max(milestone.taskTotal, 1)"
        :color="meta.color"
        size="md"
      />

      <div
        v-if="milestone.state === 'READY'"
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3"
      >
        <p class="text-sm">
          <span class="font-medium">Все задачи вехи выполнены.</span>
          Веха собрана — закрыть её?
        </p>
        <UButton size="sm" color="primary" :loading="busy" @click="close">Закрыть веху</UButton>
      </div>

      <div v-if="milestone.description" class="mt-6">
        <MarkdownView :source="milestone.description" />
      </div>

      <div class="mt-8 border-t border-default pt-6">
        <MilestoneTaskList
          :key="milestone.id"
          :milestone-id="milestone.id"
          :project-id="pid"
          :milestone-due-date="milestone.dueDate"
          :milestone-closed="closed"
          @changed="onTasksChanged"
        />
      </div>

      <MilestoneFormModal
        v-model:open="editOpen"
        :project-id="pid"
        :milestone="milestone"
        @saved="onEdited"
      />

      <UModal
        v-model:open="deleteOpen"
        title="Удалить веху с задачами"
        :ui="{ content: 'max-w-md' }"
      >
        <template #body>
          <p class="text-sm">
            К вехе «{{ milestone.title }}» привязано {{ milestone.taskTotal }} задач(и).
            Задачи не удаляются — выберите, что с ними сделать.
          </p>
          <div class="mt-4">
            <p class="mb-1 text-xs text-muted">Перенести в другую веху (необязательно)</p>
            <USelectMenu
              v-model="moveTargetId"
              :items="otherOpenMilestones"
              value-key="value"
              placeholder="— выбрать веху —"
              class="w-full"
              :disabled="!otherOpenMilestones.length"
            />
          </div>
        </template>
        <template #footer>
          <div class="flex w-full flex-wrap justify-end gap-2">
            <UButton variant="outline" color="primary" :disabled="deleting" @click="deleteOpen = false">
              Отмена
            </UButton>
            <UButton
              v-if="moveTargetId"
              color="error"
              :loading="deleting"
              @click="doDelete({ tasks: 'move', to: moveTargetId })"
            >
              Перенести задачи и удалить
            </UButton>
            <UButton
              v-else
              color="error"
              :loading="deleting"
              @click="doDelete({ tasks: 'detach' })"
            >
              Открепить задачи и удалить
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
