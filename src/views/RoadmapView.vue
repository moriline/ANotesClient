<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { getRoadmap } from '@/api/roadmap'
import { ApiError } from '@/api/http'
import { autoScale, useTimeScale, type ScaleMode } from '@/composables/useTimeScale'
import { formatDate, formatDuration, plural } from '@/utils/format'
import { MILESTONE_STATE_META } from '@/utils/milestoneState'
import type { RoadmapItem, RoadmapResponse, RoadmapState } from '@/types/domain'

const props = defineProps<{ projectId: string }>()

const route = useRoute()
const router = useRouter()
const dictionaries = useDictionariesStore()

const pid = computed(() => Number(props.projectId))
const project = computed(() => dictionaries.projectById.get(pid.value))

const data = ref<RoadmapResponse | null>(null)
const loading = ref(true)
const errorText = ref<string | null>(null)

// Внешний прямоугольник полосы — срок (приглушённый цвет состояния), внутренняя
// заливка — прогресс (насыщенный цвет). Правило состояния живёт на сервере
// (roadmap.md §3.3, §4.6) — клиент только раскрашивает.
const STATE_META: Record<RoadmapState, { label: string; bar: string; border: string; fill: string; swatch: string }> = {
  NOT_STARTED: { label: 'Не начат', bar: 'bg-elevated', border: 'border-default', fill: 'bg-transparent', swatch: 'bg-muted' },
  IN_PROGRESS: { label: 'В работе', bar: 'bg-secondary/15', border: 'border-secondary/40', fill: 'bg-secondary', swatch: 'bg-secondary' },
  DONE: { label: 'Готов', bar: 'bg-primary/15', border: 'border-primary/40', fill: 'bg-primary', swatch: 'bg-primary' },
  AT_RISK: { label: 'Под угрозой', bar: 'bg-warning/15', border: 'border-warning/50', fill: 'bg-warning', swatch: 'bg-warning' },
  OVERDUE: { label: 'Просрочен', bar: 'bg-error/15', border: 'border-error/50', fill: 'bg-error', swatch: 'bg-error' }
}
const LEGEND_ORDER: RoadmapState[] = ['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'OVERDUE', 'DONE']

// --- Масштаб шкалы ------------------------------------------------------
const SCALES: { value: ScaleMode; label: string }[] = [
  { value: 'week', label: 'Недели' },
  { value: 'month', label: 'Месяцы' },
  { value: 'quarter', label: 'Кварталы' }
]
const queryScale = SCALES.find(s => s.value === route.query.scale)?.value ?? null
// null → масштаб по диапазону данных; иначе выбор человека (важнее автоподбора).
const userScale = ref<ScaleMode | null>(queryScale)

const fromDate = computed(() => new Date(data.value?.rangeFrom ?? Date.now()))
const toDate = computed(() => new Date(data.value?.rangeTo ?? Date.now()))
const scale = computed<ScaleMode>(() =>
  userScale.value ?? (data.value ? autoScale(fromDate.value, toDate.value) : 'month')
)

const { posOf, barStyle, ticks } = useTimeScale(fromDate, toDate, scale)

const todayPos = computed(() => posOf(new Date()))
const todayInRange = computed(() => todayPos.value >= 0 && todayPos.value <= 100)

// Вехи проекта поверх шкалы эпиков (plan.md §5.5) — вертикальная линия с ромбом.
// Пересечение ромба с полосой эпика сразу показывает, попадает ли работа в срок.
const milestonesOnScale = computed(() => {
  const list = dictionaries.milestonesByProject[pid.value] ?? []
  return list
    .filter(m => {
      const p = posOf(m.dueDate)
      return p >= 0 && p <= 100
    })
    .sort((a, b) => a.dueDate - b.dueDate)
})

function setScale(s: ScaleMode) {
  userScale.value = s
  router.replace({ query: { ...route.query, scale: s } })
}

// --- Производные --------------------------------------------------------
const items = computed(() => data.value?.items ?? [])
const undated = computed(() => data.value?.undated ?? [])

const summary = computed(() => {
  const all = [...items.value, ...undated.value]
  const by = (s: RoadmapState) => all.filter(e => e.state === s).length
  return { total: all.length, atRisk: by('AT_RISK'), overdue: by('OVERDUE'), done: by('DONE') }
})

function fillPct(e: RoadmapItem): number {
  return e.childTotal > 0 ? Math.round((e.childDone / e.childTotal) * 100) : 0
}
function barLeft(e: RoadmapItem) {
  return barStyle(e.startDate ?? fromDate.value, e.dueDate ?? toDate.value)
}

// --- Загрузка ----------------------------------------------------------
async function load() {
  loading.value = true
  errorText.value = null
  try {
    dictionaries.loadProjects().catch(() => {})
    dictionaries.loadMilestones(pid.value).catch(() => {})
    data.value = await getRoadmap(pid.value)
  } catch (e) {
    data.value = null
    if (e instanceof ApiError) {
      errorText.value = e.status === 403
        ? 'Вы не участник этого проекта — дорожная карта недоступна.'
        : e.status === 404
          ? 'Проект не найден.'
          : e.message
    } else {
      errorText.value = 'Не удалось загрузить дорожную карту.'
    }
  } finally {
    loading.value = false
  }
}

watch(pid, load, { immediate: true })
</script>

<template>
  <div>
    <PageHeader title="Дорожная карта" :subtitle="project?.name">
      <template #actions>
        <div v-if="data && items.length" class="inline-flex rounded-lg border border-default p-0.5">
          <button
            v-for="s in SCALES"
            :key="s.value"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm transition-colors"
            :class="scale === s.value ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
            @click="setScale(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
        <HelpLink topic="roadmap" label="Справка: дорожная карта" />
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
        v-if="errorText"
        icon="i-lucide-triangle-alert"
        title="Дорожная карта недоступна"
        :description="errorText"
      />

      <div v-else-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>

      <EmptyState
        v-else-if="data && !items.length && !undated.length"
        icon="i-lucide-calendar-range"
        title="В проекте нет эпиков"
        description="Дорожная карта строится по эпикам. Создайте первый эпик — и он появится на шкале."
      />

      <div v-else-if="data">
        <p class="mb-4 text-sm text-muted">
          {{ summary.total }} {{ plural(summary.total, ['эпик', 'эпика', 'эпиков']) }}
          <template v-if="summary.overdue"> · <span class="text-error">{{ summary.overdue }} {{ plural(summary.overdue, ['просрочен', 'просрочены', 'просрочены']) }}</span></template>
          <template v-if="summary.atRisk"> · <span class="text-warning">{{ summary.atRisk }} под угрозой</span></template>
          <template v-if="summary.done"> · {{ summary.done }} {{ plural(summary.done, ['готов', 'готовы', 'готовы']) }}</template>
        </p>

        <div v-if="items.length" class="overflow-x-auto rounded-lg border border-default">
          <div class="min-w-[680px]">
            <!-- шапка со шкалой времени -->
            <div class="flex border-b border-default bg-elevated/40 text-xs text-muted">
              <div class="w-56 shrink-0 px-4 py-2 font-medium">Эпик</div>
              <div class="relative flex-1 py-2">
                <span
                  v-for="t in ticks"
                  :key="t.key"
                  class="absolute -translate-x-1/2 whitespace-nowrap"
                  :class="t.major ? 'font-medium text-default' : ''"
                  :style="{ left: `${t.pos}%` }"
                >{{ t.label }}</span>
                <span
                  v-if="todayInRange"
                  class="absolute -translate-x-1/2 whitespace-nowrap font-medium text-error"
                  :style="{ left: `${todayPos}%` }"
                >сегодня</span>
              </div>
            </div>

            <!-- вехи проекта (plan.md §5.5) — ромбы с подписью над шкалой -->
            <div v-if="milestonesOnScale.length" class="flex border-b border-default bg-elevated/20">
              <div class="w-56 shrink-0 px-4 py-1.5 text-xs font-medium text-muted">Вехи</div>
              <div class="relative flex-1 py-1.5">
                <RouterLink
                  v-for="m in milestonesOnScale"
                  :key="m.id"
                  :to="`/projects/${pid}/milestones/${m.id}`"
                  class="absolute flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-xs hover:underline"
                  :style="{ left: `${posOf(m.dueDate)}%` }"
                  :title="`${m.title} · ${formatDate(m.dueDate)}`"
                >
                  <UIcon name="i-lucide-diamond" class="size-3 shrink-0" :class="MILESTONE_STATE_META[m.state].text" />
                  <span class="hidden text-muted lg:inline">{{ m.title }}</span>
                </RouterLink>
              </div>
            </div>

            <!-- строки -->
            <div class="relative">
              <!-- деления шкалы под полосами -->
              <div class="pointer-events-none absolute inset-y-0 left-56 right-0">
                <div
                  v-for="t in ticks"
                  :key="t.key"
                  class="absolute inset-y-0 border-l"
                  :class="t.major ? 'border-default' : 'border-default/40'"
                  :style="{ left: `${t.pos}%` }"
                />
              </div>

              <RouterLink
                v-for="e in items"
                :key="e.id"
                :to="`/tasks/${pid}/${e.id}`"
                class="relative flex items-stretch border-b border-default last:border-b-0 hover:bg-elevated/40"
              >
                <div class="w-56 shrink-0 px-4 py-3 min-w-0">
                  <div class="truncate text-sm font-medium text-highlighted">{{ e.title }}</div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-xs text-muted">
                    <span>#{{ e.id }}</span>
                    <span>·</span>
                    <span>{{ e.childDone }}/{{ e.childTotal }}</span>
                    <span v-if="e.childOverdue" class="text-error">· {{ e.childOverdue }} просроч.</span>
                  </div>
                </div>

                <div class="relative flex-1">
                  <UTooltip :delay-duration="150">
                    <template #content>
                      <div class="flex max-w-[260px] flex-col gap-0.5 py-0.5 text-xs">
                        <span class="font-medium text-highlighted">{{ e.title }}</span>
                        <span :class="STATE_META[e.state].fill === 'bg-transparent' ? 'text-muted' : ''">
                          {{ STATE_META[e.state].label }}
                        </span>
                        <span class="text-muted">
                          {{ formatDate(e.startDate) }} — {{ formatDate(e.dueDate) }}
                          <template v-if="e.datesInferred"> · срок выведен по задачам</template>
                        </span>
                        <span class="text-muted">Задачи: {{ e.childDone }} из {{ e.childTotal }}<template v-if="e.childOverdue"> · {{ e.childOverdue }} просрочено</template></span>
                        <span v-if="e.spentSeconds" class="text-muted">Списано: {{ formatDuration(e.spentSeconds) }}</span>
                      </div>
                    </template>
                    <div
                      class="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded border"
                      :class="[STATE_META[e.state].bar, STATE_META[e.state].border, e.datesInferred ? 'border-dashed' : '']"
                      :style="barLeft(e)"
                    >
                      <div
                        class="h-full transition-[width] duration-300"
                        :class="STATE_META[e.state].fill"
                        :style="{ width: `${fillPct(e)}%` }"
                      />
                    </div>
                  </UTooltip>
                </div>
              </RouterLink>

              <!-- вертикальные линии вех — по срокам, поверх полос -->
              <div v-if="milestonesOnScale.length" class="pointer-events-none absolute inset-y-0 left-56 right-0 z-10">
                <div
                  v-for="m in milestonesOnScale"
                  :key="m.id"
                  class="absolute inset-y-0 w-px opacity-40"
                  :class="MILESTONE_STATE_META[m.state].text"
                  :style="{ left: `${posOf(m.dueDate)}%`, background: 'currentColor' }"
                />
              </div>

              <!-- линия «сегодня» — поверх полос, чтобы сравнивать заливку с ней -->
              <div v-if="todayInRange" class="pointer-events-none absolute inset-y-0 left-56 right-0 z-20">
                <div class="absolute inset-y-0 w-px bg-error/70" :style="{ left: `${todayPos}%` }" />
              </div>
            </div>
          </div>
        </div>

        <!-- легенда -->
        <div v-if="items.length" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span v-for="s in LEGEND_ORDER" :key="s" class="inline-flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm" :class="STATE_META[s].swatch" />
            {{ STATE_META[s].label }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-4 rounded-sm border border-dashed border-default" />
            срок выведен по задачам
          </span>
        </div>

        <!-- эпики без сроков (roadmap.md §2.2 — не прячем) -->
        <div v-if="undated.length" class="mt-8 border-t border-default pt-4">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Без сроков — {{ undated.length }}
          </p>
          <p class="mb-3 max-w-[60ch] text-xs text-muted">
            У этих эпиков нет ни своих дат, ни задач с датами. Задайте срок в форме эпика, чтобы он попал на шкалу.
          </p>
          <ul class="flex flex-col">
            <RouterLink
              v-for="e in undated"
              :key="e.id"
              :to="`/tasks/${pid}/${e.id}`"
              class="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-elevated/50"
            >
              <UIcon name="i-lucide-package" class="size-4 shrink-0 text-muted" />
              <span class="min-w-0 flex-1 truncate">{{ e.title }}</span>
              <span v-if="e.childOverdue" class="shrink-0 text-xs text-error">{{ e.childOverdue }} просроч.</span>
              <span class="shrink-0 font-mono text-xs text-muted">{{ e.childDone }}/{{ e.childTotal }}</span>
            </RouterLink>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
