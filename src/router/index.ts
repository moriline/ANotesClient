import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    chrome?: boolean
  }
}

// GitHub Pages не умеет history-режим (прямой переход на /tasks/1/42 даст 404)
// — в демо (client_pages.md §2.4) роутер работает по хэшу, адреса вида
// /ANotesClient/#/tasks/1/42. В боевом режиме — обычный history.
const history = import.meta.env.VITE_DEMO === 'true'
  ? createWebHashHistory(import.meta.env.BASE_URL)
  : createWebHistory(import.meta.env.BASE_URL)

export const router = createRouter({
  history,
  scrollBehavior(to, from, savedPosition) {
    // Якорь (#id) — плавно к элементу с отступом под липкую шапку.
    if (to.hash) return { el: to.hash, top: 80, behavior: 'smooth' }
    if (savedPosition) return savedPosition
    // Смена только query (фильтры вкладок синкаются в URL) — прокрутку не трогаем.
    if (to.path === from.path) return false
    return { top: 0 }
  },
  routes: [
    { path: '/', redirect: '/tasks' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, chrome: false }
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true, chrome: false }
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('@/views/TaskListView.vue')
    },
    {
      path: '/tasks/:projectId/:taskId',
      name: 'task',
      component: () => import('@/views/TaskDetailView.vue'),
      props: true
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectListView.vue')
    },
    {
      // База знаний проекта. Дерево живёт внутри страницы (двухколоночный
      // макет), а не в каркасе приложения — глобальное правило «боковой панели
      // нет» не нарушено (wiki.md §7.2). Страницы вложены в проект, как задачи.
      path: '/projects/:projectId/wiki',
      name: 'wiki',
      component: () => import('@/views/WikiIndexView.vue'),
      props: true
    },
    {
      path: '/projects/:projectId/wiki/new',
      name: 'wiki-new',
      component: () => import('@/views/WikiEditView.vue'),
      props: true
    },
    {
      path: '/projects/:projectId/wiki/:pageId',
      name: 'wiki-page',
      component: () => import('@/views/WikiIndexView.vue'),
      props: true
    },
    {
      path: '/projects/:projectId/wiki/:pageId/edit',
      name: 'wiki-edit',
      component: () => import('@/views/WikiEditView.vue'),
      props: true
    },
    {
      path: '/projects/:projectId/wiki/:pageId/history',
      name: 'wiki-history',
      component: () => import('@/views/WikiHistoryView.vue'),
      props: true
    },
    {
      // Временная шкала эпиков проекта (roadmap.md §4). Всегда про один проект,
      // поэтому вложена в него и не имеет пункта в верхнем меню — как вики.
      path: '/projects/:projectId/roadmap',
      name: 'roadmap',
      component: () => import('@/views/RoadmapView.vue'),
      props: true
    },
    {
      // Вехи проекта (plan.md §5). Контрольные точки по срокам. Вложены в
      // проект, как вики и дорожная карта: веха всегда про один проект, а
      // странице вехи нужен projectId для колонки эпика и ссылки «назад».
      path: '/projects/:projectId/milestones',
      name: 'milestones',
      component: () => import('@/views/MilestoneListView.vue'),
      props: true
    },
    {
      path: '/projects/:projectId/milestones/:milestoneId',
      name: 'milestone',
      component: () => import('@/views/MilestoneDetailView.vue'),
      props: true
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/ReportsView.vue')
    },
    {
      path: '/people',
      name: 'people',
      component: () => import('@/views/PeopleListView.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue')
    },
    {
      // Раздел «варианта 1» из ai.md — подключение ИИ-агента к задачам
      // (токен, адреса, промпт, примеры). Управление токеном живёт здесь,
      // в профиле — только строка-статус со ссылкой сюда.
      path: '/agent',
      name: 'agent',
      component: () => import('@/views/AgentAccessView.vue')
    },
    {
      // Пользовательская справка. Контент — Markdown в src/help/content/*.md,
      // по файлу на раздел; заголовки несут явные якоря ({#id}), на которые
      // ведут ссылки-подсказки из интерфейса (HelpLink.vue). :topic опционален —
      // без него открывается «Обзор».
      path: '/help/:topic?',
      name: 'help',
      component: () => import('@/views/HelpView.vue'),
      props: true
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.public && auth.isAuthenticated) {
    return { path: '/tasks' }
  }
  return true
})
