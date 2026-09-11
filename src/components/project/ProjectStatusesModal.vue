<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { createProjectStatus, listProjectStatuses, updateProjectStatus } from '@/api/projectStatuses'
import { ApiError } from '@/api/http'
import type { ProjectResponse, ProjectStatusResponse } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ project: ProjectResponse | null }>()

const dictionaries = useDictionariesStore()
const toast = useToast()

const STATUS_COLORS = ['#6B7280', '#3E8A61', '#7FB13F', '#0E7490', '#1D4ED8', '#7E22CE', '#B45309', '#B91C1C']

interface StatusRow {
  id: number
  statusName: string
  statusColor: string
  statusOrder: number
  isClosed: boolean
  isHidden: boolean
  isDefault: boolean
}

const rows = ref<StatusRow[]>([])
const original = new Map<number, StatusRow>()
const loading = ref(false)
const saving = ref(false)

const draft = reactive({ statusName: '', statusColor: STATUS_COLORS[1]!, isClosed: false })
const creating = ref(false)

function toRow(s: ProjectStatusResponse): StatusRow {
  return {
    id: s.id,
    statusName: s.statusName,
    statusColor: s.statusColor || STATUS_COLORS[0]!,
    statusOrder: s.statusOrder,
    isClosed: s.isClosed,
    isHidden: s.isHidden,
    isDefault: s.isDefault
  }
}

async function load() {
  if (!props.project) return
  loading.value = true
  try {
    const list = await listProjectStatuses(props.project.id)
    list.sort((a, b) => a.statusOrder - b.statusOrder)
    rows.value = list.map(toRow)
    original.clear()
    for (const r of rows.value) original.set(r.id, { ...r })
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить статусы', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(open, (visible) => {
  if (visible) {
    draft.statusName = ''
    draft.statusColor = STATUS_COLORS[1]!
    draft.isClosed = false
    load()
  }
})

function isRowDirty(row: StatusRow): boolean {
  const o = original.get(row.id)
  if (!o) return false
  return o.statusName !== row.statusName.trim()
    || o.statusColor !== row.statusColor
    || o.statusOrder !== row.statusOrder
    || o.isClosed !== row.isClosed
    || o.isHidden !== row.isHidden
}

const dirtyRows = computed(() => rows.value.filter(isRowDirty))
const hasInvalid = computed(() => dirtyRows.value.some(r => !r.statusName.trim()))

async function saveChanges() {
  if (!props.project || !dirtyRows.value.length || hasInvalid.value) return
  saving.value = true
  try {
    for (const row of dirtyRows.value) {
      await updateProjectStatus(row.id, {
        statusName: row.statusName.trim(),
        statusColor: row.statusColor,
        statusOrder: Number(row.statusOrder) || 0,
        isClosed: row.isClosed,
        isHidden: row.isHidden
      })
    }
    toast.add({ title: 'Статусы обновлены', color: 'primary' })
    await load()
    await dictionaries.loadStatuses(props.project.id, true)
  } catch (e) {
    toast.add({ title: 'Не удалось сохранить статусы', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function addStatus() {
  if (!props.project || !draft.statusName.trim()) return
  creating.value = true
  try {
    const nextOrder = rows.value.reduce((max, r) => Math.max(max, r.statusOrder), 0) + 1
    await createProjectStatus({
      projectId: props.project.id,
      statusName: draft.statusName.trim(),
      statusColor: draft.statusColor,
      statusOrder: nextOrder,
      isClosed: draft.isClosed
    })
    toast.add({ title: 'Статус добавлен', color: 'primary' })
    draft.statusName = ''
    draft.isClosed = false
    await load()
    await dictionaries.loadStatuses(props.project.id, true)
  } catch (e) {
    toast.add({ title: 'Не удалось добавить статус', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="`Статусы проекта «${project?.name ?? ''}»`" :ui="{ content: 'max-w-[640px]' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <div v-if="loading" class="flex flex-col gap-2">
          <USkeleton class="h-12 w-full" />
          <USkeleton class="h-12 w-full" />
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="row in rows"
            :key="row.id"
            class="flex flex-col gap-2 rounded-md border border-default px-3 py-2.5"
          >
            <div class="flex items-center gap-2">
              <UInput v-model="row.statusName" placeholder="Название статуса" class="flex-1" size="sm" />
              <UBadge v-if="row.isDefault" variant="subtle" color="primary" size="sm">по умолчанию</UBadge>
              <UInputNumber v-model="row.statusOrder" :min="0" :step="1" size="sm" class="w-24" />
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div class="flex items-center gap-1.5">
                <button
                  v-for="c in STATUS_COLORS"
                  :key="c"
                  type="button"
                  class="size-5 rounded-full ring-offset-1"
                  :class="row.statusColor === c ? 'ring-2 ring-primary' : ''"
                  :style="{ background: c }"
                  :aria-label="c"
                  @click="row.statusColor = c"
                />
              </div>
              <UCheckbox v-model="row.isClosed" label="Закрывающий" />
              <UCheckbox v-model="row.isHidden" label="Скрытый" />
            </div>
          </div>
          <p v-if="!rows.length" class="py-2 text-center text-sm text-muted">У проекта пока нет статусов</p>
          <p class="text-xs text-muted">
            «Закрывающий» — задача считается завершённой. «Скрытый» — статус не предлагается в новых выборках.
            Удаление статусов в API не предусмотрено.
          </p>
        </div>

        <div class="flex flex-col gap-2 border-t border-default pt-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">Новый статус</p>
          <div class="flex items-center gap-2">
            <UInput v-model="draft.statusName" placeholder="Название" class="flex-1" size="sm" @keydown.enter="addStatus" />
            <div class="flex items-center gap-1.5">
              <button
                v-for="c in STATUS_COLORS"
                :key="c"
                type="button"
                class="size-5 rounded-full ring-offset-1"
                :class="draft.statusColor === c ? 'ring-2 ring-primary' : ''"
                :style="{ background: c }"
                :aria-label="c"
                @click="draft.statusColor = c"
              />
            </div>
          </div>
          <div class="flex items-center justify-between">
            <UCheckbox v-model="draft.isClosed" label="Закрывающий" />
            <UButton icon="i-lucide-plus" size="sm" :loading="creating" :disabled="!draft.statusName.trim()" @click="addStatus">
              Добавить
            </UButton>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <span v-if="dirtyRows.length" class="text-xs text-muted">Изменено статусов: {{ dirtyRows.length }}</span>
        <span v-else />
        <div class="flex gap-2">
          <UButton variant="outline" color="primary" @click="open = false">Закрыть</UButton>
          <UButton
            color="primary"
            :loading="saving"
            :disabled="!dirtyRows.length || hasInvalid"
            @click="saveChanges"
          >
            Сохранить изменения
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
