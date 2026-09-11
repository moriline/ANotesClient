import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { getProjectAppearance, listProjects } from '@/api/projects'
import { listUsers } from '@/api/users'
import { listProjectStatuses } from '@/api/projectStatuses'
import { listProjectMembers } from '@/api/projectMembers'
import { listRoles } from '@/api/roles'
import { listProjectEpics } from '@/api/tasks'
import { listProjectMilestones } from '@/api/milestones'
import { getWikiTree } from '@/api/wiki'
import type { MilestoneResponse, ProjectAppearanceResponse, ProjectMemberResponse, ProjectResponse, ProjectStatusResponse, RoleResponse, TaskResponse, UserSummary, WikiTreeNodeResponse } from '@/types/domain'

export const useDictionariesStore = defineStore('dictionaries', () => {
  const projects = ref<ProjectResponse[]>([])
  const users = ref<UserSummary[]>([])
  const roles = ref<RoleResponse[]>([])
  const statusesByProject = reactive<Record<number, ProjectStatusResponse[]>>({})
  // Участники проекта, keyed by projectId. Нужны выпадающему списку упоминаний
  // (@имя) на странице задачи — грузятся один раз при открытии, фильтруются
  // в памяти. Инвалидируются вручную (force) после правки состава в модалке.
  const membersByProject = reactive<Record<number, ProjectMemberResponse[]>>({})
  // Дерево вики кэшируется по projectId. Инвалидируется вручную (force) после
  // создания/переименования/удаления страницы — см. вызовы loadWikiTree(pid, true).
  const wikiTreeByProject = reactive<Record<number, WikiTreeNodeResponse[]>>({})
  // Эпики проекта (с прогрессом), keyed by projectId. Нужны селектору «Эпик» на
  // странице задачи и группировке «По эпикам» в списке. Force-refresh после
  // создания/удаления/конвертации эпика и правки его дочерних задач.
  const epicsByProject = reactive<Record<number, TaskResponse[]>>({})
  // Вехи проекта (все, с прогрессом и state), keyed by projectId. Нужны
  // селектору «Веха» на странице задачи, фильтру/группировке в списке и ромбам
  // на дорожной карте. Force-refresh после любой мутации вехи или её состава.
  const milestonesByProject = reactive<Record<number, MilestoneResponse[]>>({})
  const appearance = ref<ProjectAppearanceResponse | null>(null)

  const projectsLoaded = ref(false)
  const usersLoaded = ref(false)
  const rolesLoaded = ref(false)
  const statusesLoading: Record<number, Promise<ProjectStatusResponse[]> | undefined> = {}
  const membersLoading: Record<number, Promise<ProjectMemberResponse[]> | undefined> = {}
  const epicsLoading: Record<number, Promise<TaskResponse[]> | undefined> = {}
  const milestonesLoading: Record<number, Promise<MilestoneResponse[]> | undefined> = {}

  async function loadProjects(force = false) {
    if (projectsLoaded.value && !force) return projects.value
    projects.value = await listProjects()
    projectsLoaded.value = true
    return projects.value
  }

  async function loadUsers(force = false) {
    if (usersLoaded.value && !force) return users.value
    users.value = await listUsers({ limit: 200 })
    usersLoaded.value = true
    return users.value
  }

  async function loadRoles(force = false) {
    if (rolesLoaded.value && !force) return roles.value
    roles.value = await listRoles()
    rolesLoaded.value = true
    return roles.value
  }

  async function loadStatuses(projectId: number, force = false) {
    if (statusesByProject[projectId] && !force) return statusesByProject[projectId]
    if (statusesLoading[projectId] && !force) return statusesLoading[projectId]
    const promise = listProjectStatuses(projectId).then(list => {
      statusesByProject[projectId] = list.sort((a, b) => a.statusOrder - b.statusOrder)
      delete statusesLoading[projectId]
      return statusesByProject[projectId]
    })
    statusesLoading[projectId] = promise
    return promise
  }

  async function loadMembers(projectId: number, force = false) {
    if (membersByProject[projectId] && !force) return membersByProject[projectId]
    if (membersLoading[projectId] && !force) return membersLoading[projectId]
    const promise = listProjectMembers(projectId)
      .then(list => {
        membersByProject[projectId] = list
        return list
      })
      .finally(() => { delete membersLoading[projectId] })
    membersLoading[projectId] = promise
    return promise
  }

  async function loadEpics(projectId: number, force = false) {
    if (epicsByProject[projectId] && !force) return epicsByProject[projectId]
    if (epicsLoading[projectId] && !force) return epicsLoading[projectId]
    const promise = listProjectEpics(projectId)
      .then(list => {
        epicsByProject[projectId] = list
        return list
      })
      .finally(() => { delete epicsLoading[projectId] })
    epicsLoading[projectId] = promise
    return promise
  }

  async function loadMilestones(projectId: number, force = false) {
    if (milestonesByProject[projectId] && !force) return milestonesByProject[projectId]
    if (milestonesLoading[projectId] && !force) return milestonesLoading[projectId]
    const promise = listProjectMilestones(projectId, 'all')
      .then(list => {
        milestonesByProject[projectId] = list
        return list
      })
      .finally(() => { delete milestonesLoading[projectId] })
    milestonesLoading[projectId] = promise
    return promise
  }

  async function loadWikiTree(projectId: number, force = false) {
    if (wikiTreeByProject[projectId] && !force) return wikiTreeByProject[projectId]
    wikiTreeByProject[projectId] = await getWikiTree(projectId)
    return wikiTreeByProject[projectId]
  }

  const projectById = computed(() => {
    const map = new Map<number, ProjectResponse>()
    for (const p of projects.value) map.set(p.id, p)
    return map
  })

  const userById = computed(() => {
    const map = new Map<number, UserSummary>()
    for (const u of users.value) map.set(u.id, u)
    return map
  })

  const roleById = computed(() => {
    const map = new Map<number, RoleResponse>()
    for (const r of roles.value) map.set(r.id, r)
    return map
  })

  function statusFor(projectId: number | null | undefined, statusId: number | null | undefined) {
    if (!projectId || !statusId) return undefined
    return statusesByProject[projectId]?.find(s => s.id === statusId)
  }

  async function loadAppearance(force = false) {
    if (appearance.value && !force) return appearance.value
    appearance.value = await getProjectAppearance()
    return appearance.value
  }

  return {
    projects,
    users,
    roles,
    statusesByProject,
    membersByProject,
    wikiTreeByProject,
    epicsByProject,
    milestonesByProject,
    appearance,
    loadProjects,
    loadUsers,
    loadRoles,
    loadStatuses,
    loadMembers,
    loadEpics,
    loadMilestones,
    loadWikiTree,
    loadAppearance,
    projectById,
    userById,
    roleById,
    statusFor
  }
})
