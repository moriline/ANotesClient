<script setup lang="ts">
withDefaults(defineProps<{
  loading?: boolean
  empty?: boolean
  skeletonRows?: number
}>(), {
  loading: false,
  empty: false,
  skeletonRows: 8
})
</script>

<template>
  <div>
    <div class="overflow-x-auto rounded-lg border border-default">
      <table v-if="loading || !empty" class="w-full min-w-[760px] border-collapse text-sm">
        <tbody v-if="loading">
          <tr v-for="i in skeletonRows" :key="i" class="border-t border-default first:border-t-0">
            <td class="px-4 py-3">
              <USkeleton class="h-4 w-full" />
            </td>
          </tr>
        </tbody>
        <slot v-else />
      </table>
      <div v-else class="p-2">
        <slot name="empty" />
      </div>
    </div>
    <div v-if="!loading && !empty && $slots.pagination" class="mt-3">
      <slot name="pagination" />
    </div>
  </div>
</template>
