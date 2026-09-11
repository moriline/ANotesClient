<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import RelativeTime from '@/components/common/RelativeTime.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import type { NotificationResponse } from '@/types/domain'

// Колокольчик из notifications.md §1: UChip со счётчиком + UPopover со списком.
// Счётчик обновляется опросом (store), список подгружается при открытии.

const notifications = useNotificationsStore()
const auth = useAuthStore()
const router = useRouter()

const open = ref(false)

const TYPE_ICON: Record<string, string> = {
  MENTION: 'i-lucide-at-sign',
  ASSIGNED: 'i-lucide-user-plus',
  COMMENT: 'i-lucide-message-square',
  STATUS_CHANGED: 'i-lucide-arrow-right-left',
  DUE_SOON: 'i-lucide-clock'
}
function iconFor(type: string): string {
  return TYPE_ICON[type] ?? 'i-lucide-bell'
}

function onToggle(value: boolean) {
  open.value = value
  if (value) notifications.loadList()
}

function activate(n: NotificationResponse) {
  if (!n.read) notifications.markRead(n.id)
  const projectId = notifications.projectForTask(n.taskId)
  if (projectId && n.taskId != null) {
    open.value = false
    router.push(`/tasks/${projectId}/${n.taskId}`)
  }
}

onMounted(() => {
  if (auth.isAuthenticated) notifications.start()
})
onUnmounted(() => {
  notifications.stop()
})
watch(() => auth.isAuthenticated, (authed) => {
  if (authed) {
    notifications.start()
  } else {
    notifications.stop()
    notifications.reset()
  }
})
</script>

<template>
  <UPopover :open="open" :content="{ align: 'end' }" @update:open="onToggle">
    <UChip
      :text="notifications.unread > 9 ? '9+' : notifications.unread"
      :show="notifications.hasUnread"
      size="lg"
      color="error"
    >
      <UButton icon="i-lucide-bell" variant="outline" color="primary" aria-label="Уведомления" />
    </UChip>

    <template #content>
      <div class="w-80">
        <div class="flex items-center justify-between border-b border-default px-3 py-2">
          <span class="inline-flex items-center gap-1 text-sm font-medium">
            Уведомления
            <HelpLink topic="notifications" label="Справка: уведомления" />
          </span>
          <UButton
            v-if="notifications.hasUnread"
            variant="link"
            size="xs"
            color="neutral"
            @click="notifications.markAllRead()"
          >
            Прочитать все
          </UButton>
        </div>

        <div class="max-h-96 overflow-y-auto">
          <div
            v-if="notifications.loadingList && !notifications.items.length"
            class="flex flex-col gap-2 p-3"
          >
            <USkeleton class="h-11 w-full" />
            <USkeleton class="h-11 w-full" />
            <USkeleton class="h-11 w-full" />
          </div>

          <p
            v-else-if="!notifications.items.length"
            class="px-3 py-10 text-center text-sm text-muted"
          >
            Пока пусто
          </p>

          <button
            v-for="n in notifications.items"
            v-else
            :key="n.id"
            type="button"
            class="flex w-full gap-2.5 border-b border-default px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-elevated/60"
            :class="notifications.projectForTask(n.taskId) ? 'cursor-pointer' : 'cursor-default'"
            @click="activate(n)"
          >
            <span
              class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
              :class="n.read ? 'bg-elevated text-muted' : 'bg-primary/10 text-primary'"
            >
              <UIcon :name="iconFor(n.type)" class="size-3.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span
                class="block text-sm leading-snug"
                :class="n.read ? 'text-muted' : 'text-default'"
              >{{ n.text }}</span>
              <span class="mt-0.5 block text-xs text-muted">
                <RelativeTime :value="n.createdAt" />
              </span>
            </span>
            <span v-if="!n.read" class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
