<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import DataTableShell from '@/components/common/DataTableShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import CreateUserModal from '@/components/people/CreateUserModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { listUsers } from '@/api/users'
import { deleteAdminUser, listAdminUsers, setAdminUserStatus } from '@/api/admin'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError } from '@/api/http'
import { initials, formatDateTime } from '@/utils/format'
import type { AdminUserResponse, UserSummary } from '@/types/domain'

const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const loading = ref(true)
const search = ref('')
const users = ref<UserSummary[]>([])
const adminUsers = ref<AdminUserResponse[]>([])
// Признак админа для этого экрана — ответ самого /api/admin/users: 200 → админ,
// 403 → нет. На роли из auth-стора не опираемся вовсе: стартуем не-админом,
// проба в load() поднимает до админа при 200.
const isAdminView = ref(false)
const createOpen = ref(false)

async function loadCatalog() {
  isAdminView.value = false
  users.value = await listUsers({ q: search.value || undefined, limit: 100 })
}

async function load() {
  loading.value = true
  try {
    try {
      adminUsers.value = await listAdminUsers()
      isAdminView.value = true
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) await loadCatalog()
      else throw e
    }
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить пользователей', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(load)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  if (isAdminView.value) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 300)
})

async function toggleActive(user: AdminUserResponse) {
  try {
    await setAdminUserStatus(user.id, { isActive: !user.isActive })
    toast.add({ title: user.isActive ? 'Пользователь отключён' : 'Пользователь активирован', color: 'primary' })
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось изменить статус', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function onUserCreated() {
  // Обновляем и админский список, и общий словарь пользователей — иначе
  // новый юзер не появится в выпадашках (участники проекта, исполнитель…),
  // пока не перезагрузить страницу.
  await Promise.all([load(), dictionaries.loadUsers(true).catch(() => {})])
}

async function removeUser(user: AdminUserResponse) {
  const ok = await confirm({
    title: `Удалить пользователя «${user.displayName || user.username}»?`,
    description: 'Это действие нельзя отменить.'
  })
  if (!ok) return
  try {
    await deleteAdminUser(user.id)
    toast.add({ title: 'Пользователь удалён', color: 'primary' })
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить пользователя', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader :title="isAdminView ? 'Пользователи' : 'Каталог пользователей'">
      <template v-if="isAdminView" #actions>
        <UButton icon="i-lucide-user-plus" color="primary" @click="createOpen = true">Пользователь</UButton>
      </template>
      <UInput v-if="!isAdminView" v-model="search" icon="i-lucide-search" placeholder="Поиск по имени" class="w-[240px]" />
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <DataTableShell v-if="isAdminView" :loading="loading" :empty="!loading && adminUsers.length === 0">
        <template #empty>
          <EmptyState icon="i-lucide-users" title="Пользователей пока нет">
            <template #action>
              <UButton color="primary" @click="createOpen = true">Создать пользователя</UButton>
            </template>
          </EmptyState>
        </template>
        <thead class="bg-elevated/40 text-left text-xs text-muted">
          <tr>
            <th class="px-4 py-2">Пользователь</th>
            <th class="w-24 px-2 py-2">Админ</th>
            <th class="w-28 px-2 py-2">Статус</th>
            <th class="w-32 px-2 py-2">Регистрация</th>
            <th class="w-12 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in adminUsers" :key="user.id" class="border-t border-default">
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.displayName || user.username)" size="sm" />
                <div class="min-w-0">
                  <p class="truncate text-sm">{{ user.displayName || user.username }}</p>
                  <p class="truncate text-xs text-muted">{{ user.email }}</p>
                </div>
              </div>
            </td>
            <td class="px-2 py-3">
              <UBadge v-if="user.isAdmin" variant="subtle" color="secondary">Админ</UBadge>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="px-2 py-3">
              <UBadge :variant="'subtle'" :color="user.isActive ? 'primary' : 'neutral'">
                {{ user.isActive ? 'Активен' : 'Отключён' }}
              </UBadge>
            </td>
            <td class="px-2 py-3 text-xs text-muted">{{ formatDateTime(user.createdAt) }}</td>
            <td class="px-2 py-3">
              <UDropdownMenu
                :items="[[
                  { label: user.isActive ? 'Отключить' : 'Активировать', icon: 'i-lucide-power', onSelect: () => toggleActive(user) }
                ], [
                  { label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeUser(user) }
                ]]"
              >
                <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" size="xs" />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>
      </DataTableShell>

      <DataTableShell v-else :loading="loading" :empty="!loading && users.length === 0">
        <template #empty>
          <EmptyState icon="i-lucide-users" title="Никого не нашли" description="Попробуйте изменить запрос" />
        </template>
        <thead class="bg-elevated/40 text-left text-xs text-muted">
          <tr>
            <th class="px-4 py-2">Пользователь</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-t border-default">
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.displayName || user.username)" size="sm" />
                <div class="min-w-0">
                  <p class="truncate text-sm">{{ user.displayName || user.username }}</p>
                  <p class="truncate text-xs text-muted">@{{ user.username }}</p>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </DataTableShell>
    </div>

    <CreateUserModal v-model:open="createOpen" @created="onUserCreated" />
  </div>
</template>
