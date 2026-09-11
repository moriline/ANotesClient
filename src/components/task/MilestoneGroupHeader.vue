<script setup lang="ts">
import { computed } from 'vue'
import DueDate from '@/components/task/DueDate.vue'
import { MILESTONE_STATE_META } from '@/utils/milestoneState'
import type { MilestoneGroup } from '@/composables/useMilestoneGrouping'

// Заголовок группы вехи в режиме «По вехам» (plan.md §5.6). Свёрнутая строка
// отвечает на «успеваем ли»: прогресс, счётчик, срок — на месте. Как и
// EpicGroupHeader — div с role="button", внутри ссылка на веху.
const props = defineProps<{ group: MilestoneGroup; collapsed: boolean }>()
defineEmits<{ toggle: [] }>()

const showBar = computed(() => !!props.group.milestone && props.group.totalCount > 1)
const meta = computed(() => props.group.milestone && MILESTONE_STATE_META[props.group.milestone.state])
</script>

<template>
  <div
    class="flex w-full cursor-pointer select-none items-center gap-3 border-b border-default bg-elevated/40 px-3 py-2.5 hover:bg-elevated/70"
    role="button"
    tabindex="0"
    :aria-expanded="!collapsed"
    @click="$emit('toggle')"
    @keydown.enter.prevent="$emit('toggle')"
    @keydown.space.prevent="$emit('toggle')"
  >
    <UIcon
      :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
      class="size-4 shrink-0 text-muted"
    />
    <UIcon
      name="i-lucide-diamond"
      class="size-4 shrink-0"
      :class="meta ? meta.text : 'text-muted'"
    />

    <RouterLink
      v-if="group.milestone"
      :to="`/projects/${group.milestone.projectId}/milestones/${group.milestone.id}`"
      class="truncate text-sm font-medium hover:text-primary hover:underline"
      :class="group.closed && 'text-muted line-through decoration-1'"
      @click.stop
    >
      {{ group.title }}
    </RouterLink>
    <span v-else class="truncate text-sm font-medium">{{ group.title }}</span>

    <UBadge
      v-if="group.milestone?.state === 'READY'"
      size="xs"
      variant="subtle"
      color="primary"
    >
      Готова к закрытию
    </UBadge>

    <span class="flex-1" />

    <UProgress
      v-if="showBar && meta"
      :model-value="group.doneCount"
      :max="group.totalCount"
      :color="meta.color"
      size="xs"
      class="hidden w-24 shrink-0 sm:block"
    />

    <span class="shrink-0 font-mono text-xs text-muted">
      <template v-if="group.milestone">
        {{ group.doneCount }}/{{ group.totalCount }}
        <span v-if="group.overdueCount" class="text-error"> · {{ group.overdueCount }} просроч.</span>
        <span v-if="group.partial" class="text-dimmed"> · показана {{ group.visibleCount }}</span>
      </template>
      <template v-else>{{ group.visibleCount }}&nbsp;задач</template>
    </span>

    <span class="hidden w-16 shrink-0 text-right text-xs md:block">
      <DueDate v-if="group.dueDate" :value="group.dueDate" />
    </span>
  </div>
</template>
