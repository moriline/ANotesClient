<script setup lang="ts">
import { computed } from 'vue'
import { tagColor } from '@/utils/format'

const props = withDefaults(defineProps<{ tags: string[]; max?: number }>(), { max: 3 })
const emit = defineEmits<{ select: [tag: string] }>()

const visible = computed(() => props.tags.slice(0, props.max))
const hiddenCount = computed(() => Math.max(0, props.tags.length - props.max))
</script>

<template>
  <div v-if="tags.length" class="flex flex-wrap items-center gap-1">
    <UBadge
      v-for="tag in visible"
      :key="tag"
      variant="subtle"
      class="cursor-pointer"
      :style="{ backgroundColor: `${tagColor(tag)}1F`, color: tagColor(tag) }"
      @click="emit('select', tag)"
    >
      {{ tag }}
    </UBadge>
    <span v-if="hiddenCount > 0" class="text-xs text-muted">+{{ hiddenCount }}</span>
  </div>
</template>
