# ANotes — представление списка задач: группировка по эпикам

Режим просмотра списка задач с группировкой по эпикам и сворачиванием групп. Дополняет `parent_task.md` (модель EPIC/TASK) и спецификацию экрана `/tasks`.

Стек: Vue 3 + TypeScript + Nuxt UI на клиенте, Quarkus + Panache на сервере.

---

## 1. Что даёт группировка

**Экран перестаёт быть плоским.** Тридцать строк подряд читаются как список, тридцать строк в шести группах — как структура работы. На проекте разработки ПО это разница между «у нас куча задач» и «мы делаем четыре вещи, и вот на какой стадии каждая».

**Сворачивание работает как фильтр без фильтра.** Свернул пять эпиков, оставил один — получил его задачи, не трогая панель фильтров и не теряя контекста остальных.

**Заголовок группы несёт данные.** Прогресс, срок, суммарное списанное время видны на уровне строки эпика, без открытия.

### Где окупается

| Эпиков в проекте | Вывод |
|---|---|
| до 3 | избыточно, плоский список удобнее |
| **5–15** | **оптимум, ради этого всё и делается** |
| более 40 | свёрнутые заголовки сами становятся неудобным списком |

Второго уровня свёртки в модели EPIC/TASK нет по построению, поэтому при сорока эпиках группировка перестаёт помогать. Это не повод её усложнять — это повод завести меньше эпиков.

**Важная оговорка:** это улучшение просмотра, а не структуры. Если люди заводят эпики как попало, аккуратное дерево лишь наглядно покажет беспорядок.

---

## 2. Четыре места, где группировка ломается

Прежде чем код — проблемы, которые надо решить осознанно. Все четыре встречаются в любом трекере с группировкой.

### 2.1 Сортировка по колонке

Человек кликает «Срок». Что должно произойти — отсортироваться задачи внутри групп или переупорядочиться сами группы? Оба ответа осмысленны, оба неожиданны.

**Решение: сортировка действует внутри групп, порядок групп не меняется.** Отдельная сортировка групп — в меню заголовка колонки эпика.

Без этого правила пользователи считают сортировку сломанной: кликнул по «Сроку», а самая срочная задача осталась в середине экрана, потому что её эпик третий сверху.

### 2.2 Фильтр по исполнителю

Анна выбирает «мои задачи». У эпика исполнителя нет — значит либо он исчезает вместе со своими задачами, либо остаётся с неполным составом.

**Решение: эпик остаётся, если после фильтрации в нём есть хотя бы одна задача. Заголовок честно сообщает о неполноте:**

```
▾ 📦 EPIC-12  Переработка обмена манифестами    3/5 · показана 1
```

Без пометки «показана 1» человек решит, что прогресс посчитан неверно: видит одну задачу, а счётчик утверждает про пять.

### 2.3 Задачи без эпика

Их всегда много, особенно в начале. Группа «Без эпика» быстро становится крупнейшей и превращает группировку в декорацию.

**Решение: группа всегда последняя, всегда свёрнута по умолчанию, в заголовке — число.** Плюс это полезный диагностический сигнал: если в ней 80% задач, эпиками не пользуются.

### 2.4 Пагинация

При 25 строках на страницу группа, разрезанная границей страницы, рассыпает всё представление.

**Решение: в режиме группировки пагинация по задачам отключается.** Загружаются все незакрытые задачи проекта разом. До нескольких тысяч это нормально: строка списка весит ~300 байт, тысяча задач — 300 КБ, что сопоставимо с одной фотографией.

Порог, при котором понадобится пагинация по эпикам, — примерно 5000 задач в проекте. Тогда `GET /api/projects/{id}/epics?page=0&size=20`, а задачи каждого эпика догружаются при разворачивании.

---

## 3. Какой режим основной

**Плоский список — по умолчанию.** Он универсален: работает с любым фильтром, любой сортировкой, любой пагинацией.

**Исключение:** если выбран ровно один проект и в нём есть эпики — открывать сразу в группированном виде. Выбор проекта и есть сигнал «покажи структуру этой работы».

```ts
const groupBy = ref<'none' | 'epic'>('none')

watch([selectedProject, epicCount], ([project, count]) => {
  if (userChangedMode.value) return          // явный выбор человека важнее
  groupBy.value = project && count > 0 ? 'epic' : 'none'
})
```

`userChangedMode` обязателен: если человек переключился на плоский вид, смена фильтра проекта не должна возвращать его обратно.

---

## 4. Состояние сворачивания

Схлопнутое дерево, разворачивающееся при каждом возврате из задачи, — одно из самых раздражающих поведений в трекерах. Состояние переживает навигацию.

```ts
// composables/useEpicCollapse.ts
export function useEpicCollapse(projectId: Ref<number | null>) {
  const key = computed(() => `epic-collapse:${projectId.value ?? 'all'}`)
  const collapsed = ref<Set<number>>(new Set())

  // sessionStorage, а не localStorage: состояние вида — не долговременная настройка
  watch(key, k => {
    try {
      const raw = sessionStorage.getItem(k)
      collapsed.value = new Set(raw ? JSON.parse(raw) : [])
    } catch { collapsed.value = new Set() }
  }, { immediate: true })

  watch(collapsed, v => {
    try { sessionStorage.setItem(key.value, JSON.stringify([...v])) } catch {}
  }, { deep: true })

  function toggle(epicId: number) {
    collapsed.value.has(epicId)
      ? collapsed.value.delete(epicId)
      : collapsed.value.add(epicId)
    triggerRef(collapsed)
  }

  const collapseAll = (ids: number[]) => { collapsed.value = new Set(ids); triggerRef(collapsed) }
  const expandAll   = ()             => { collapsed.value = new Set();    triggerRef(collapsed) }

  return { collapsed, toggle, collapseAll, expandAll }
}
```

`sessionStorage`, а не `localStorage`: состояние сворачивания — это «где я сейчас нахожусь», а не настройка пользователя. Через неделю оно неактуально.

Ключ включает `projectId`: свёрнутые эпики одного проекта не должны влиять на другой.

---

## 5. Группировка на клиенте

Данных в ответе `POST /api/find` уже достаточно: `parentId`, `parentKey`, `parentTitle`, `taskType`, `childTotal`, `childDone`. Дополнительных запросов не требуется.

```ts
// composables/useEpicGrouping.ts
export interface EpicGroup {
  epic: TaskResponse | null      // null — группа «Без эпика»
  tasks: TaskResponse[]
  visibleCount: number           // после фильтрации
  totalCount: number             // childTotal с сервера
  doneCount: number              // childDone с сервера
}

export function useEpicGrouping(
  items: Ref<TaskResponse[]>,
  sortFn: Ref<(a: TaskResponse, b: TaskResponse) => number>
) {
  return computed<EpicGroup[]>(() => {
    const epics = new Map<number, TaskResponse>()
    const byEpic = new Map<number, TaskResponse[]>()
    const orphans: TaskResponse[] = []

    for (const item of items.value) {
      if (item.taskType === 'EPIC') { epics.set(item.id, item); continue }
      if (item.parentId == null)    { orphans.push(item);       continue }
      const bucket = byEpic.get(item.parentId) ?? []
      bucket.push(item)
      byEpic.set(item.parentId, bucket)
    }

    const groups: EpicGroup[] = []

    for (const [epicId, tasks] of byEpic) {
      const epic = epics.get(epicId)
      // Эпик мог не попасть в выдачу (фильтр по исполнителю его отсекает),
      // но задачи несут parentKey/parentTitle — их достаточно для заголовка.
      groups.push({
        epic: epic ?? synthesizeEpic(tasks[0]),
        tasks: [...tasks].sort(sortFn.value),
        visibleCount: tasks.length,
        totalCount: epic?.childTotal ?? tasks[0].parentChildTotal ?? tasks.length,
        doneCount:  epic?.childDone  ?? tasks[0].parentChildDone  ?? 0
      })
    }

    // пустые эпики — в выдаче есть, задач нет
    for (const [id, epic] of epics) {
      if (!byEpic.has(id)) {
        groups.push({ epic, tasks: [], visibleCount: 0,
                      totalCount: epic.childTotal ?? 0, doneCount: epic.childDone ?? 0 })
      }
    }

    groups.sort((a, b) => (a.epic?.key ?? '').localeCompare(b.epic?.key ?? ''))

    if (orphans.length) {
      groups.push({                      // всегда последняя
        epic: null,
        tasks: [...orphans].sort(sortFn.value),
        visibleCount: orphans.length,
        totalCount: orphans.length,
        doneCount: 0
      })
    }
    return groups
  })
}
```

Три случая, которые легко упустить и которые обязательно всплывут:

- **Эпик не попал в выдачу.** Фильтр «мои задачи» отсекает эпики (у них нет исполнителя), но их задачи остаются. Заголовок собирается из `parentKey`/`parentTitle` самой задачи.
- **Пустые эпики.** Есть в выдаче, задач нет. Без отдельного прохода они исчезнут с экрана, и человек решит, что эпик удалился.
- **`sortFn` применяется внутри групп**, а порядок самих групп фиксирован по ключу эпика — реализация правила из §2.1.

---

## 6. Разметка

### 6.1 Как это выглядит

```
Задачи                        [Вид: Список ▾]  [Фильтры]  [+ Задача]
─────────────────────────────────────────────────────────────────────
▸ 📦 EPIC-12  Переработка обмена     ███████░░ 3/5   12ч 30м   20 сен
▾ 📦 EPIC-13  Клиент на Vue          ░░░░░░░░░ 0/8    2ч 15м     —
     TSK-201  Каркас приложения        ДК   К работе             —
     TSK-202  Страница задачи           —   Бэклог               —
▾ 📦 EPIC-14  Уведомления             ████░░░░ 2/5 · показана 1   —
     TSK-310  Web Push подписки        АИ   В работе          25 сен
▸ 📁 Без эпика                                    7 задач
```

Свёрнутая строка отвечает на «как идут дела» **без разворачивания**. Если для этого нужно раскрыть группу — группировка не окупается.

### 6.2 Заголовок группы

```vue
<script setup lang="ts">
const props = defineProps<{ group: EpicGroup; collapsed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const partial = computed(() =>
  props.group.visibleCount > 0 && props.group.visibleCount < props.group.totalCount)
</script>

<template>
  <div
    class="flex items-center gap-3 py-2 px-3 bg-elevated/50 border-y border-default
           cursor-pointer select-none hover:bg-elevated"
    role="button"
    :aria-expanded="!collapsed"
    tabindex="0"
    @click="emit('toggle')"
    @keydown.enter.prevent="emit('toggle')"
    @keydown.space.prevent="emit('toggle')">

    <UIcon
      :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
      class="size-4 text-muted shrink-0" />

    <UIcon
      :name="group.epic ? 'i-lucide-package' : 'i-lucide-folder'"
      class="size-4 text-primary shrink-0" />

    <span v-if="group.epic" class="font-mono text-xs text-muted w-20 shrink-0">
      {{ group.epic.key }}
    </span>

    <span class="text-sm font-medium truncate">
      {{ group.epic?.title ?? 'Без эпика' }}
    </span>

    <span class="flex-1" />

    <!-- прогресс только при двух и более задачах: 0/1 — это булево значение,
         нарисованное полосой, оно повторяет статус единственной задачи -->
    <UProgress
      v-if="group.epic && group.totalCount > 1"
      :model-value="group.doneCount" :max="group.totalCount"
      color="secondary" size="xs" class="w-24 shrink-0" />

    <span class="font-mono text-xs text-muted shrink-0">
      <template v-if="group.epic">
        {{ group.doneCount }}/{{ group.totalCount }}
        <span v-if="partial" class="text-dimmed">
          · показана {{ group.visibleCount }}
        </span>
      </template>
      <template v-else>{{ group.visibleCount }} задач</template>
    </span>

    <DueDate v-if="group.epic?.dueDate" :date="group.epic.dueDate" class="w-20 shrink-0" />
  </div>
</template>
```

`role="button"` и обработчики `Enter`/`Space` — не формальность: заголовок группы это `div`, и без них он недоступен с клавиатуры.

### 6.3 Сборка списка

```vue
<script setup lang="ts">
const { collapsed, toggle, collapseAll, expandAll } = useEpicCollapse(projectId)
const groups = useEpicGrouping(items, sortFn)

const allEpicIds = computed(() =>
  groups.value.filter(g => g.epic).map(g => g.epic!.id))

// «Без эпика» свёрнута по умолчанию — она обычно самая большая
const isCollapsed = (g: EpicGroup) =>
  g.epic ? collapsed.value.has(g.epic.id) : !expandedOrphans.value
</script>

<template>
  <div class="border border-default rounded-lg overflow-hidden">
    <TaskTableHeader />

    <template v-for="g in groups" :key="g.epic?.id ?? 'orphans'">
      <EpicGroupHeader
        :group="g"
        :collapsed="isCollapsed(g)"
        @toggle="g.epic ? toggle(g.epic.id) : (expandedOrphans = !expandedOrphans)" />

      <template v-if="!isCollapsed(g)">
        <TaskRow v-for="t in g.tasks" :key="t.id" :task="t" indented />
        <div v-if="!g.tasks.length" class="py-3 px-3 pl-12 text-sm text-muted">
          В эпике пока нет задач.
          <UButton variant="link" size="xs" @click="createIn(g.epic!)">Добавить</UButton>
        </div>
      </template>
    </template>
  </div>
</template>
```

`v-if` на разворачивании, а не `v-show`: свёрнутые группы не должны держать DOM. При двадцати эпиках по тридцать задач разница — 600 узлов против 20.

### 6.4 Переключатель вида

```vue
<USelect
  v-model="groupBy"
  :items="[
    { label: 'Список',    value: 'none', icon: 'i-lucide-list' },
    { label: 'По эпикам', value: 'epic', icon: 'i-lucide-layers' }
  ]"
  @update:model-value="userChangedMode = true" />
```

---

## 7. Клавиатура

В спецификации проекта клавиатурная навигация заложена; в группированном виде она даёт больше всего.

| Клавиша | Действие |
|---|---|
| `←` | свернуть группу под курсором; если курсор на задаче — перейти к её эпику |
| `→` | развернуть группу |
| `Shift` + `←` | свернуть все |
| `Shift` + `→` | развернуть все |
| `↑` `↓` | перемещение по видимым строкам, включая заголовки групп |
| `Enter` | открыть задачу или переключить группу |

```ts
useEventListener('keydown', (e: KeyboardEvent) => {
  if (isTypingTarget(e.target)) return          // не мешаем вводу в полях
  if (groupBy.value !== 'epic') return

  if (e.key === 'ArrowLeft'  && e.shiftKey) { collapseAll(allEpicIds.value); e.preventDefault() }
  if (e.key === 'ArrowRight' && e.shiftKey) { expandAll();                   e.preventDefault() }
})
```

`isTypingTarget` обязателен: без него стрелки в поле поиска будут сворачивать группы вместо перемещения курсора по тексту.

---

## 8. Сервер

Изменение ровно одно.

### 8.1 Отключение пагинации в режиме группировки

```java
public record FindTasksRequest(
    /* … существующие поля … */
    TaskType taskType,
    Integer  parentId,
    Boolean  grouped        // true — вернуть всё незакрытое без пагинации
) {}
```

```java
public Page<TaskResponse> find(FindTasksRequest req) {
    if (Boolean.TRUE.equals(req.grouped())) {
        reject(req.projectId() == null,
               "Группировка доступна только в пределах одного проекта");

        var items = repo.findAllForGrouping(req);      // включая эпики
        return new Page<>(items, items.size(), 0, items.size());
    }
    return repo.findPaged(req);
}
```

Требование одного проекта не ограничение, а следствие модели: эпик принадлежит проекту, и группировка через несколько проектов сводится к списку с чужими заголовками.

### 8.2 Защита от больших выборок

```java
private static final int GROUPING_HARD_LIMIT = 5000;

public List<TaskResponse> findAllForGrouping(FindTasksRequest req) {
    var items = /* запрос */;
    if (items.size() >= GROUPING_HARD_LIMIT) {
        throw new BadRequestException(
            "В проекте более %d задач — группировка недоступна, используйте фильтры"
                .formatted(GROUPING_HARD_LIMIT));
    }
    return items;
}
```

Внятный отказ лучше молчаливой отдачи сорока мегабайт. При достижении порога либо вводится пагинация по эпикам, либо старые задачи архивируются.

### 8.3 Чего добавлять не нужно

| | Почему |
|---|---|
| Эндпоинт группировки | группировка целиком на клиенте, данных в ответе достаточно |
| Прогресс эпика в отдельном запросе | `childTotal`/`childDone` уже в `TaskResponse` |
| Хранение состояния сворачивания | `sessionStorage`, не дело сервера |
| Сортировка групп на сервере | порядок групп фиксирован по ключу эпика |

---

## 9. Порядок работ

**Вечер 1.** `useEpicGrouping`, `useEpicCollapse`, `EpicGroupHeader`, переключатель вида. Работает на уже существующих данных, серверных изменений не требует.

**Вечер 2.** Флаг `grouped` в `POST /api/find`, отключение пагинации, ограничение в 5000. Автовыбор режима при одном проекте.

**Вечер 3.** Клавиатура, пометка «показана N» при частичной фильтрации, пустые эпики с кнопкой добавления, свёрнутая по умолчанию группа «Без эпика».

---

## 10. Тесты

| Класс / сценарий | Что проверяет |
|---|---|
| `useEpicGrouping` | задачи распределяются по эпикам; «Без эпика» всегда последняя |
| — эпик вне выдачи | заголовок собирается из `parentKey`/`parentTitle` задачи |
| — пустой эпик | остаётся в списке групп с `0/0`, не исчезает |
| — сортировка | применяется внутри групп, порядок групп неизменен |
| `useEpicCollapse` | состояние переживает переход на задачу и обратно; ключи разных проектов не смешиваются |
| `EpicGroupHeader` | «показана N» появляется только при `visibleCount < totalCount`; `UProgress` скрыт при `totalCount <= 1` |
| `FindGroupedTest` | `grouped=true` без `projectId` даёт `400` |
| `FindGroupedLimitTest` | превышение 5000 даёт `400` с понятным текстом, а не таймаут |
| Доступность | заголовок группы фокусируется табом, `Enter` и `Space` переключают, `aria-expanded` корректен |
