<script setup lang="ts">
import { confirmState, resolveConfirm } from '@/composables/useConfirm'

function onUpdateOpen(value: boolean) {
  if (!value) resolveConfirm(false)
}
</script>

<template>
  <UModal :open="confirmState.open" :title="confirmState.title" @update:open="onUpdateOpen">
    <template #body>
      <p v-if="confirmState.description" class="text-sm text-muted">{{ confirmState.description }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton variant="outline" color="primary" @click="resolveConfirm(false)">
          {{ confirmState.cancelLabel }}
        </UButton>
        <UButton :color="confirmState.danger ? 'error' : 'primary'" @click="resolveConfirm(true)">
          {{ confirmState.confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
