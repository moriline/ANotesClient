# ANotes — дорожная карта эпиков

Временная шкала эпиков проекта. Замена диаграмме Ганта: даёт ответ на вопрос «успеваем ли» без зависимостей, критического пути и каскадного пересчёта дат.

Стек: Quarkus 3.14.4, Java 21, H2, Panache. Клиент — Vue 3 + TypeScript + Nuxt UI.

Зависит от модели EPIC/TASK (`parent_task.md`).

> **Статус (сессия 2026-09-08).** Серверная часть реализована — §3:
> `GET /api/projects/{projectId}/roadmap`, `RoadmapService` (фиксированное число
> запросов, вывод дат по задачам, `stateOf`, предел эпиков через
> `taskmind.roadmap.max-epics`). Порог `0.25` из §3.3 — `@ConfigProperty`
> `taskmind.roadmap.at-risk-threshold` (серверная, не проектная). Схему не
> трогали. Тесты — 8 классов (§6).
> Отклонения: `key` в модели нет — из `RoadmapItem` убран; даты — epoch-ms, а не
> `LocalDate` (как везде в API); `from`/`to` задают только края шкалы, не
> фильтруют эпики. **Клиент (§4) — вне репозитория.** Подробности — `summary.md` §26.

---

## 1. Что это и чем не является

```
                        Сен              Окт              Ноя
                    ┊               ┊               ┊
📦 EPIC-12  Обмен   ████████████▓▓▓▓░░░
   манифестами      ┊  3/5         ┊               ┊
📦 EPIC-13  Клиент  ┊     ░░░░░░░░░░░░░░░░░░░░░░
   на Vue           ┊  0/8         ┊               ┊
📦 EPIC-14  Уведом- ┊               ▓▓▓▓▓▓▓░░░
   ления            ┊  2/5         ┊               ┊
                    ┊              ▲ сегодня       ┊
```

Одна полоса — один эпик. Длина полосы — от `startDate` до `dueDate`. Заливка — доля выполненных задач (`childDone / childTotal`).

**Чего здесь нет намеренно:**

| | Почему |
|---|---|
| Зависимости и стрелки | их нет в модели данных; без них Гант бесполезен, с ними — дорог |
| Критический путь | производная от зависимостей |
| Каскадный пересчёт дат | нечего пересчитывать |
| Отдельные задачи на шкале | тысячи полос нечитаемы; эпиков 5–15, и это ровно тот диапазон, который помещается на экран |
| Перетаскивание полос мышью | правка сроков — в форме эпика; на шкале это провоцирует случайные сдвиги |

**Ключевое ограничение по объёму:** дорожная карта показывает **эпики, а не задачи**. Это не упрощение ради экономии, а условие читаемости.

---

## 2. Данные

### 2.1 Новых таблиц не требуется

Всё уже есть в `tasks` после миграции эпиков:

| Что нужно | Откуда |
|---|---|
| Название и ключ | `title`, `key` |
| Начало полосы | `start_date` |
| Конец полосы | `due_date` |
| Заливка | `childDone / childTotal` из `EpicProgressService` |
| Цвет | производный от состояния (см. §3.3) |

### 2.2 Эпики без дат

Главный практический вопрос: у эпика может не быть ни `startDate`, ни `dueDate`.

Правило вывода дат — **сначала свои, потом по задачам**:

```java
LocalDate effectiveStart = epic.startDate != null
    ? epic.startDate
    : minStartOfChildren(epic.id);        // MIN(COALESCE(start_date, created_at))

LocalDate effectiveDue = epic.dueDate != null
    ? epic.dueDate
    : maxDueOfChildren(epic.id);          // MAX(due_date)
```

Если дат нет ни у эпика, ни у задач — эпик **не рисуется на шкале**, а попадает в отдельный список «Без сроков» под ней. Прятать его совсем нельзя: именно эти эпики чаще всего и требуют внимания планировщика.

Флаг `datesInferred` в ответе позволяет отрисовать выведенные полосы пунктиром — человек должен видеть, что срок не задан, а вычислен.

---

## 3. Сервер

### 3.1 Эндпоинт

```
GET /api/projects/{projectId}/roadmap?from=2026-09-01&to=2026-12-31
```

Один запрос, один проект. Диапазон необязателен: без него сервер сам берёт минимум и максимум по эпикам проекта и добавляет по неделе с каждой стороны.

### 3.2 Ответ

```java
public record RoadmapResponse(
    LocalDate rangeFrom,
    LocalDate rangeTo,
    List<RoadmapItem> items,        // с датами, отсортированы по effectiveStart
    List<RoadmapItem> undated       // без дат вообще
) {}

public record RoadmapItem(
    Integer   id,
    String    key,
    String    title,
    LocalDate startDate,            // effective
    LocalDate dueDate,              // effective
    boolean   datesInferred,        // true → рисовать пунктиром
    int       childTotal,
    int       childDone,
    int       childOverdue,         // задач с истёкшим сроком
    RoadmapState state,
    Integer   spentSeconds          // сумма по задачам эпика
) {}

public enum RoadmapState { NOT_STARTED, IN_PROGRESS, DONE, AT_RISK, OVERDUE }
```

`childOverdue` — то, ради чего дорожную карту смотрят чаще всего. Эпик может укладываться в срок целиком, но содержать три просроченные задачи.

### 3.3 Состояние эпика

Вычисляется на сервере, а не на клиенте: правило должно быть одно для интерфейса, отчётов и агента.

```java
public RoadmapState stateOf(EpicRow e, LocalDate today) {
    if (e.childTotal > 0 && e.childDone == e.childTotal) return DONE;
    if (e.dueDate != null && e.dueDate.isBefore(today))  return OVERDUE;
    if (e.childDone == 0)                                return NOT_STARTED;

    // AT_RISK: прошло больше времени, чем сделано работы
    if (e.startDate != null && e.dueDate != null) {
        long total = DAYS.between(e.startDate, e.dueDate);
        long past  = DAYS.between(e.startDate, today);
        if (total > 0 && past > 0) {
            double timeSpent = (double) past / total;
            double workDone  = (double) e.childDone / e.childTotal;
            if (timeSpent - workDone > 0.25) return AT_RISK;
        }
    }
    return IN_PROGRESS;
}
```

Порог `0.25` — эмпирический: прошло 60% времени, сделано 30% работы → риск. Меньший порог даёт слишком много ложных тревог в начале эпика, больший — предупреждает слишком поздно.

Цвета по состоянию (палитра из спецификации):

| Состояние | Цвет полосы |
|---|---|
| `NOT_STARTED` | `neutral-200`, контур |
| `IN_PROGRESS` | `secondary` (sprout) |
| `DONE` | `primary` (moss) |
| `AT_RISK` | `warning` |
| `OVERDUE` | `error` |

### 3.4 Запрос — один на всю страницу

```java
@ApplicationScoped
public class RoadmapService {

    @Inject EntityManager em;

    public RoadmapResponse build(Integer projectId, LocalDate from, LocalDate to) {
        var rows = em.createQuery("""
            SELECT e.id, e.key, e.title, e.startDate, e.dueDate,
                   MIN(c.startDate), MAX(c.dueDate),
                   COUNT(c),
                   SUM(CASE WHEN s.isClosed = TRUE THEN 1 ELSE 0 END),
                   SUM(CASE WHEN s.isClosed = FALSE
                             AND c.dueDate < :today THEN 1 ELSE 0 END)
            FROM TaskEntity e
            LEFT JOIN TaskEntity c ON c.parentId = e.id
            LEFT JOIN ProjectStatusEntity s ON s.id = c.statusId
            WHERE e.projectId = :pid AND e.taskType = 'EPIC'
            GROUP BY e.id, e.key, e.title, e.startDate, e.dueDate
            """, Object[].class)
            .setParameter("pid", projectId)
            .setParameter("today", LocalDate.now())
            .getResultList();

        // разбор строк, вывод дат, вычисление состояния, разделение на items/undated
    }
}
```

Один запрос на весь экран. `LEFT JOIN` обязателен: без него эпики без задач исчезнут из результата, а именно они часто и есть самая свежая, ещё не наполненная работа.

Индекс `idx_task_type (project_id, task_type)` покрывает выборку эпиков, `idx_task_parent` — присоединение задач.

### 3.5 Время эпика

`spentSeconds` — сумма по задачам, отдельным подзапросом или вторым запросом по собранным `id`. На эпик время списать нельзя, поэтому двусмысленности «своё или с детьми» не возникает.

Держать его в основном `GROUP BY` не стоит: `JOIN` с `time_entry` умножит строки и испортит `COUNT(c)`.

### 3.6 Права и ограничения

- проверка через существующий `PermissionService`: участник проекта;
- жёсткий предел — **200 эпиков** на проект; при превышении `400` с текстом «В проекте слишком много эпиков для дорожной карты, отфильтруйте по датам». На практике недостижимо, но защищает от вырожденных данных.

---

## 4. Клиент

### 4.1 Маршрут и место в интерфейсе

```ts
{ path: '/projects/:id/roadmap', component: RoadmapView, name: 'roadmap' }
```

Вкладка «Дорожная карта» на странице проекта, третья после «Задачи» и «Вики». Отдельного пункта в верхнем меню нет: дорожная карта всегда про один проект.

### 4.2 Геометрия

Вся раскладка сводится к одной функции: дата → позиция в процентах.

```ts
// composables/useTimeScale.ts
export function useTimeScale(from: Ref<Date>, to: Ref<Date>) {
  const totalMs = computed(() => to.value.getTime() - from.value.getTime())

  const posOf = (d: Date | string) => {
    const t = new Date(d).getTime()
    return ((t - from.value.getTime()) / totalMs.value) * 100
  }

  const barStyle = (start: string, due: string) => {
    const left  = Math.max(0, posOf(start))
    const right = Math.min(100, posOf(due))
    return { left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }
  }

  return { posOf, barStyle }
}
```

`Math.max(..., 1.5)` — минимальная ширина полосы. Эпик на один день при годовом масштабе иначе выродится в невидимую линию.

Проценты, а не пиксели: шкала перестраивается при изменении ширины окна без пересчёта в JS.

### 4.3 Компонент

```vue
<script setup lang="ts">
const props = defineProps<{ projectId: number }>()

const scale = ref<'week' | 'month' | 'quarter'>('month')
const { data, refresh } = useAsyncData(() =>
  http<RoadmapResponse>(`/projects/${props.projectId}/roadmap`))

const from = computed(() => new Date(data.value!.rangeFrom))
const to   = computed(() => new Date(data.value!.rangeTo))
const { posOf, barStyle } = useTimeScale(from, to)

const todayPos = computed(() => posOf(new Date()))

const STATE_CLASS: Record<RoadmapState, string> = {
  NOT_STARTED: 'bg-elevated border border-default',
  IN_PROGRESS: 'bg-secondary/25',
  DONE:        'bg-primary/25',
  AT_RISK:     'bg-warning/25',
  OVERDUE:     'bg-error/25'
}
const FILL_CLASS: Record<RoadmapState, string> = {
  NOT_STARTED: 'bg-transparent',
  IN_PROGRESS: 'bg-secondary',
  DONE:        'bg-primary',
  AT_RISK:     'bg-warning',
  OVERDUE:     'bg-error'
}
</script>

<template>
  <div v-if="data">
    <!-- шапка со шкалой времени -->
    <div class="flex border-b border-default text-xs text-muted">
      <div class="w-56 shrink-0 py-2">Эпик</div>
      <div class="relative flex-1 py-2">
        <span v-for="t in ticks" :key="t.label"
              class="absolute" :style="{ left: `${t.pos}%` }">{{ t.label }}</span>
      </div>
    </div>

    <!-- строки -->
    <div class="relative">
      <!-- линия «сегодня» через все строки -->
      <div class="absolute top-0 bottom-0 w-px bg-error/60 z-10 pointer-events-none"
           :style="{ left: `calc(14rem + ${todayPos}% * (1 - 14rem / 100%))` }" />

      <RouterLink v-for="e in data.items" :key="e.id" :to="`/tasks/${e.id}`"
                  class="flex items-center hover:bg-elevated/50 group">
        <div class="w-56 shrink-0 py-2 pr-3 min-w-0">
          <div class="text-sm truncate">{{ e.title }}</div>
          <div class="font-mono text-xs text-muted">
            {{ e.key }} · {{ e.childDone }}/{{ e.childTotal }}
            <span v-if="e.childOverdue" class="text-error">
              · {{ e.childOverdue }} просроч.
            </span>
          </div>
        </div>

        <div class="relative flex-1 h-8">
          <div class="absolute top-1.5 h-5 rounded overflow-hidden"
               :class="[STATE_CLASS[e.state], e.datesInferred && 'border-dashed']"
               :style="barStyle(e.startDate, e.dueDate)">
            <div class="h-full transition-[width]" :class="FILL_CLASS[e.state]"
                 :style="{ width: `${e.childTotal ? e.childDone / e.childTotal * 100 : 0}%` }" />
          </div>
        </div>
      </RouterLink>
    </div>

    <!-- эпики без дат -->
    <div v-if="data.undated.length" class="mt-6 pt-4 border-t border-default">
      <div class="text-xs text-muted mb-2">
        Без сроков — {{ data.undated.length }}
      </div>
      <RouterLink v-for="e in data.undated" :key="e.id" :to="`/tasks/${e.id}`"
                  class="flex items-center gap-3 py-1.5 text-sm hover:underline">
        <UIcon name="i-lucide-package" class="size-4 text-muted" />
        <span class="font-mono text-xs text-muted">{{ e.key }}</span>
        <span class="truncate">{{ e.title }}</span>
        <span class="font-mono text-xs text-muted">
          {{ e.childDone }}/{{ e.childTotal }}
        </span>
      </RouterLink>
    </div>

    <UEmpty v-if="!data.items.length && !data.undated.length"
            icon="i-lucide-calendar-range"
            title="В проекте нет эпиков"
            description="Дорожная карта строится по эпикам. Создайте первый." />
  </div>
</template>
```

### 4.4 Полоса состоит из двух слоёв

Внешний прямоугольник — **срок** (от начала до конца, приглушённый цвет состояния). Внутренняя заливка — **прогресс** (насыщенный цвет, ширина по доле выполненных задач).

Это единственный визуальный приём, который стоит объяснить, потому что он несёт всю информацию: сравнивая заливку с линией «сегодня», человек мгновенно видит, отстаёт эпик или идёт с опережением. Заливка левее линии — отставание.

### 4.5 Масштаб

| Масштаб | Деления | Когда |
|---|---|---|
| Недели | по понедельникам | горизонт до 3 месяцев |
| Месяцы | по первым числам | 3–18 месяцев, **по умолчанию** |
| Кварталы | Q1…Q4 | более 18 месяцев |

Выбор по умолчанию — по фактическому диапазону данных, а не фиксированный.

### 4.6 Чего не делать на клиенте

| | Почему |
|---|---|
| Перетаскивание полос | правка сроков делается в форме эпика; на шкале провоцирует случайные сдвиги на день-два, которые никто не заметит |
| Виртуализация | 200 строк рендерятся мгновенно, а предел всё равно на сервере |
| Свой пересчёт состояния | правило живёт на сервере, дублирование разъедется |
| Раскрытие эпика в задачи | это уже группированный список (`tasks_view.md`), не дорожная карта |

---

## 5. Порядок работ

**Вечер 1 — сервер.** `RoadmapService.build` одним запросом, вывод дат по задачам, `stateOf`, эндпоинт, предел в 200.

**Вечер 2 — клиент.** `useTimeScale`, строки с двухслойными полосами, линия «сегодня», блок «Без сроков», пустое состояние.

**Вечер 3 — отделка.** Переключатель масштаба, деления шкалы, пунктир у выведенных дат, тултип с деталями по наведению, вкладка на странице проекта.

---

## 6. Тесты

| Класс | Что проверяет |
|---|---|
| `RoadmapDatesTest` | даты эпика приоритетнее выведенных; при отсутствии своих берутся `MIN`/`MAX` по задачам; `datesInferred` выставляется |
| `RoadmapUndatedTest` | эпик без дат и без задач попадает в `undated`, а не исчезает |
| `RoadmapEmptyEpicTest` | эпик без задач присутствует в ответе (проверка `LEFT JOIN`) |
| `RoadmapStateTest` | `DONE` при всех закрытых; `OVERDUE` при истёкшем сроке; `AT_RISK` при разрыве более 0.25; `NOT_STARTED` при нуле выполненных |
| `RoadmapOverdueCountTest` | `childOverdue` считает только незакрытые задачи с истёкшим сроком |
| `RoadmapQueryCountTest` | построение дорожной карты делает фиксированное число запросов независимо от количества эпиков |
| `RoadmapLimitTest` | 201 эпик даёт `400` с понятным текстом |
| `RoadmapPermissionTest` | не участник проекта получает `403` |

Дополнить `OpenApiSpecTest`: `GET /api/projects/{id}/roadmap` под `bearerAuth`, не в `PUBLIC_OPERATIONS`.
