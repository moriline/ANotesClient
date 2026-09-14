// Доступ к чужой личной доске (todo.txt п.2): полную доску (занятость + задачи)
// видит только admin или тот, у кого в ОБЩЕМ с целевым пользователем проекте
// роль ~ «Manager» (реальный бэкенд сеет роли Admin/Manager/Developer/Guest/
// Client — ai.md §…; локальный demo-мок называет их иначе, поэтому сравниваем
// по подстроке, а не точным именем). Всем остальным — только имя и аватар.
// Нет отдельной ручки «мои права глобально» — единственный источник тут это
// GET /api/projects (только проекты вызывающего) + GET /api/projects/{id}/members
// на каждый из них, поэтому проверка стоит одного похода в API за проект и
// делается один раз при открытии страницы, не на каждый рендер.
import { useAuthStore } from '@/stores/auth'
import { useDictionariesStore } from '@/stores/dictionaries'

const MANAGER_ROLE_RE = /manager|менеджер/i

export async function canViewUserBoard(targetUserId: number): Promise<boolean> {
  const auth = useAuthStore()
  if (auth.isAdmin) return true
  const viewerId = auth.profile?.id
  if (!viewerId) return false
  if (viewerId === targetUserId) return true

  const dictionaries = useDictionariesStore()
  const projects = await dictionaries.loadProjects()
  const memberLists = await Promise.all(
    projects.map(p => dictionaries.loadMembers(p.id).catch(() => []))
  )
  return memberLists.some(members => {
    const targetIsMember = members.some(m => m.userId === targetUserId)
    if (!targetIsMember) return false
    return members.some(m => m.userId === viewerId && MANAGER_ROLE_RE.test(m.roleName))
  })
}
