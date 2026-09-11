<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { addProjectMember, listProjectMembers, removeProjectMember, updateProjectMemberRole } from '@/api/projectMembers'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError } from '@/api/http'
import { initials } from '@/utils/format'
import type { ProjectMemberResponse, ProjectResponse } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ project: ProjectResponse | null }>()

const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const members = ref<ProjectMemberResponse[]>([])
const loading = ref(false)
const newUserId = ref<number | undefined>(undefined)
const newRoleId = ref<number | undefined>(undefined)
const adding = ref(false)

const userItems = computed(() => dictionaries.users
  .filter(u => !members.value.some(m => m.userId === u.id))
  .map(u => ({ label: u.displayName || u.username, value: u.id })))

const roleItems = computed(() => dictionaries.roles.map(r => ({ label: r.name, value: r.id })))

function roleLabel(roleId: number, fallback: string): string {
  return dictionaries.roleById.get(roleId)?.name || fallback || `Роль #${roleId}`
}

async function load() {
  if (!props.project) return
  loading.value = true
  try {
    members.value = await listProjectMembers(props.project.id)
    // Держим кэш словаря (список для @упоминаний на странице задачи) в актуальном
    // состоянии — сюда попадают и только что добавленные/удалённые участники.
    dictionaries.membersByProject[props.project.id] = members.value
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить участников', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(open, (visible) => {
  if (visible) {
    // force — чтобы в списке «добавить участника» сразу были только что
    // заведённые пользователи, а не устаревший кэш словаря.
    dictionaries.loadUsers(true).catch(() => {})
    dictionaries.loadRoles().catch(() => {})
    load()
  }
})

async function addMember() {
  if (!props.project || !newUserId.value || !newRoleId.value) return
  adding.value = true
  try {
    await addProjectMember(props.project.id, { userId: newUserId.value, roleId: newRoleId.value })
    toast.add({ title: 'Участник добавлен', color: 'primary' })
    newUserId.value = undefined
    newRoleId.value = undefined
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось добавить участника', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    adding.value = false
  }
}

async function changeRole(member: ProjectMemberResponse, roleId: number | undefined) {
  if (!props.project || !roleId || roleId === member.roleId) return
  try {
    await updateProjectMemberRole(props.project.id, member.userId, { roleId })
    toast.add({ title: 'Роль обновлена', color: 'primary' })
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось изменить роль', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function removeMember(member: ProjectMemberResponse) {
  if (!props.project) return
  const ok = await confirm({ title: `Убрать ${member.displayName || member.username} из проекта?` })
  if (!ok) return
  try {
    await removeProjectMember(props.project.id, member.userId)
    toast.add({ title: 'Участник удалён', color: 'primary' })
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить участника', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="`Участники проекта «${project?.name ?? ''}»`" :ui="{ content: 'max-w-[560px]' }">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <div v-for="member in members" :key="member.id" class="flex items-center justify-between gap-2 rounded-md border border-default px-3 py-2">
            <div class="flex min-w-0 items-center gap-2">
              <UAvatar :text="initials(member.displayName || member.username)" size="sm" />
              <div class="min-w-0">
                <p class="truncate text-sm">{{ member.displayName || member.username }}</p>
                <p class="text-xs text-muted">{{ roleLabel(member.roleId, member.roleName) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <USelectMenu
                v-if="roleItems.length"
                :model-value="member.roleId"
                :items="roleItems"
                value-key="value"
                size="xs"
                class="w-40"
                @update:model-value="(v: number) => changeRole(member, v)"
              />
              <UInput
                v-else
                :model-value="member.roleId"
                type="number"
                class="w-16"
                size="xs"
                @change="(e: Event) => changeRole(member, Number((e.target as HTMLInputElement).value))"
              />
              <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="removeMember(member)" />
            </div>
          </div>
          <p v-if="!loading && members.length === 0" class="py-4 text-center text-sm text-muted">Пока нет участников</p>
        </div>

        <div class="flex items-end gap-2 border-t border-default pt-4">
          <UFormField label="Пользователь" class="flex-1">
            <USelectMenu v-model="newUserId" :items="userItems" value-key="value" placeholder="Выберите" class="w-full" />
          </UFormField>
          <UFormField label="Роль" class="w-40">
            <USelectMenu
              v-if="roleItems.length"
              v-model="newRoleId"
              :items="roleItems"
              value-key="value"
              placeholder="Выберите"
              class="w-full"
            />
            <UInput v-else v-model.number="newRoleId" type="number" placeholder="ID роли" class="w-full" />
          </UFormField>
          <UButton icon="i-lucide-plus" :loading="adding" :disabled="!newUserId || !newRoleId" @click="addMember">Добавить</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
