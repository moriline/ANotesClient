<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { commandPaletteOpen, createTaskModalOpen } from '@/composables/useGlobalUi'
import { useShortcuts } from '@/composables/useShortcuts'
import { initials } from '@/utils/format'
import CommandPalette from '@/components/common/CommandPalette.vue'
import TaskFormModal from '@/components/task/TaskFormModal.vue'
import NotificationBell from '@/components/layout/NotificationBell.vue'

useShortcuts()

const auth = useAuthStore()
const mobileOpen = ref(false)

const navItems = [
  { label: 'Задачи', icon: 'i-lucide-check-square', to: '/tasks' },
  { label: 'Проекты', icon: 'i-lucide-folder', to: '/projects' },
  { label: 'Отчёты', icon: 'i-lucide-bar-chart-3', to: '/reports' },
  { label: 'Пользователи', icon: 'i-lucide-users', to: '/people' }
]

const displayName = computed(() => auth.profile?.displayName || auth.profile?.username || '')

const profileMenuItems = computed(() => [
  [{ label: displayName.value, description: auth.profile?.email, type: 'label' as const }],
  [
    { label: 'Мой профиль', icon: 'i-lucide-user', to: '/profile' },
    { label: 'ИИ-агент', icon: 'i-lucide-sparkles', to: '/agent' },
    { label: 'Справка', icon: 'i-lucide-circle-help', to: '/help' }
  ],
  [{ label: 'Выйти', icon: 'i-lucide-log-out', onSelect: () => auth.logout() }]
])
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-default bg-white">
    <div class="mx-auto flex h-14 w-[95%] items-center gap-4 px-6">
      <UButton
        icon="i-lucide-menu"
        variant="outline"
        color="primary"
        class="lg:hidden"
        aria-label="Меню"
        @click="mobileOpen = true"
      />

      <RouterLink to="/tasks" class="flex items-center gap-2 shrink-0">
        <span class="flex size-6 items-center justify-center rounded-full bg-primary">
          <UIcon name="i-lucide-sprout" class="size-3.5 text-white" />
        </span>
        <span class="text-base font-semibold">ANotes</span>
      </RouterLink>

      <UNavigationMenu :items="navItems" orientation="horizontal" class="hidden lg:flex" />

      <div class="ml-auto flex items-center gap-3">
        <UInput
          icon="i-lucide-search"
          placeholder="Поиск задач"
          class="hidden w-[220px] sm:block"
          :model-value="''"
          readonly
          @focus="commandPaletteOpen = true"
          @click="commandPaletteOpen = true"
        >
          <template #trailing>
            <UKbd>⌘K</UKbd>
          </template>
        </UInput>
        <UButton
          icon="i-lucide-search"
          variant="outline"
          color="primary"
          class="sm:hidden"
          aria-label="Поиск"
          @click="commandPaletteOpen = true"
        />

        <NotificationBell />

        <UDropdownMenu :items="profileMenuItems" :popper="{ placement: 'bottom-end' }">
          <button type="button" class="flex items-center gap-1 rounded-full">
            <UAvatar :src="auth.profile?.avatarUrl || undefined" :text="initials(displayName)" size="sm" />
            <UIcon name="i-lucide-chevron-down" class="size-3.5 text-muted" />
          </button>
        </UDropdownMenu>
      </div>
    </div>

    <USlideover v-model:open="mobileOpen" side="left" title="ANotes">
      <template #body>
        <nav class="flex flex-col gap-1">
          <UButton
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :icon="item.icon"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            @click="mobileOpen = false"
          >
            {{ item.label }}
          </UButton>
        </nav>
      </template>
    </USlideover>

    <TaskFormModal v-model:open="createTaskModalOpen" />
    <CommandPalette />
  </header>
</template>
