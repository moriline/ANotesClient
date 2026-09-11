import { computed, ref, triggerRef, watch, type Ref } from 'vue'

// Состояние сворачивания групп в режиме «По эпикам» (tasks_view.md §4).
//
// Храним РАЗВЁРНУТЫЕ группы, а не свёрнутые: по умолчанию (пустой набор) всё
// свёрнуто — сначала видно структуру работы (заголовки эпиков с прогрессом и
// сроком), а задачи разворачиваешь там, где они сейчас нужны. Свёрнутые пять
// эпиков и один развёрнутый — это фильтр без фильтра (§1).
//
// sessionStorage, а не localStorage: «что я сейчас развернул» — это где я
// нахожусь, а не долговременная настройка; через неделю неактуально. Состояние
// переживает переход на страницу задачи и обратно. Ключ включает projectId —
// развёрнутые эпики одного проекта не влияют на другой.

export function useEpicCollapse(projectId: Ref<number | undefined>, kind: 'epicExpanded' | 'milestoneExpanded' = 'epicExpanded') {
  const storageKey = computed(() => `taskmind.${kind}.${projectId.value ?? 'all'}`)
  const expanded = ref<Set<number>>(new Set())

  watch(storageKey, (key) => {
    try {
      const raw = sessionStorage.getItem(key)
      expanded.value = raw ? new Set<number>(JSON.parse(raw)) : new Set()
    } catch {
      expanded.value = new Set()
    }
  }, { immediate: true })

  function persist() {
    try {
      sessionStorage.setItem(storageKey.value, JSON.stringify([...expanded.value]))
    } catch {
      // приватный режим / переполнение — просто не сохраняем
    }
  }

  function isCollapsed(id: number) {
    return !expanded.value.has(id)
  }

  function toggle(id: number) {
    if (expanded.value.has(id)) expanded.value.delete(id)
    else expanded.value.add(id)
    triggerRef(expanded) // мутация Set на месте — реактивность вручную
    persist()
  }

  function collapseAll() {
    expanded.value = new Set()
    persist()
  }

  function expandAll(ids: number[]) {
    expanded.value = new Set(ids)
    persist()
  }

  return { isCollapsed, toggle, collapseAll, expandAll }
}
