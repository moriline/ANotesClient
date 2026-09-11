# ANotes — вехи (milestones)

Контрольные точки проекта: релизы, демо, договорные сроки. Даёт большую часть планировочной пользы диаграммы Ганта без зависимостей, критического пути и каскадного пересчёта дат.

Стек: Quarkus 3.14.4, Java 21, H2, Panache. Клиент — Vue 3 + TypeScript + Nuxt UI.

Дополняет `roadmap.md` (шкала эпиков) и модель EPIC/TASK из `parent_task.md`.

> **Статус (сессия 2026-09-10).** Серверная часть реализована — §7 «вечер 1» и
> «вечер 2»: таблица `milestones`, `tasks.milestoneId`, `MilestoneState`,
> `MilestoneService` (`progressFor` одним запросом, `stateOf`, close/reopen,
> delete с `?tasks=detach|move`), 9 ручек, `milestoneId`/`noMilestone` в
> `/api/find`, `milestoneReady` в ответе задачи. Тесты — 10 классов (§8).
> Отклонения: даты — epoch-ms `BIGINT`, а не `DATE`/`TIMESTAMP` (как везде в
> API); схема одним файлом, не Flyway; привязка задачи к вехе — отдельная ручка
> `PUT /api/tasks/{id}/milestone`, а не поле в PATCH. Подробности — `summary.md` §29.
>
> **Клиент (§5) реализован (сессия 2026-09-10).** `src/api/milestones.ts`,
> `dictionaries.milestonesByProject` + `loadMilestones`, маршруты
> `/projects/:id/milestones[/:milestoneId]` (вложены в проект, как вики и
> дорожная карта — вопреки §5.1, странице вехи нужен `projectId`).
> `MilestoneListView` (список + переключатель «Показать закрытые»),
> `MilestoneDetailView` (колонка эпика у задач, ⚠ на задачах со сроком позже
> вехи, close/reopen, 3-путёвое удаление detach/move), `MilestoneFormModal`,
> `MilestoneTaskList` (+ «Добавить» существующие задачи через `noMilestone`).
> Точка входа — иконка-ромб в строке `/projects`. Селектор «Веха» на странице
> задачи (`§5.4`) и в `TaskFormModal`. Ромбы вех на дорожной карте (`§5.5`).
> Фильтр «Веха» + режим «По вехам» в `/tasks` (`§5.6`,
> `useMilestoneGrouping` / `MilestoneGroupHeader`). Ключа у задач нет — `#id`;
> состояние READY на странице вехи показывается баннером «закрыть веху».

---

## 1. Что такое веха и чем она отличается от эпика

Веха — **точка на оси времени**, а не отрезок. Ключевое событие или дата, по которой удобно измерять прогресс: релиз 1.0, демо заказчику, окончание бета-теста.

| | Эпик | Веха |
|---|---|---|
| На шкале | отрезок | точка (ромб) |
| Отвечает на вопрос | «что делаем» | «к какому числу» |
| Состав | задачи одного направления | задачи из **разных** эпиков |
| Задача принадлежит | ровно одному эпику | ровно одной вехе |
| Имеет исполнителя | нет | нет |
| Пересекается с другими | эпики независимы | вехи идут по времени подряд |

Разница по смыслу: **эпик группирует по содержанию, веха — по сроку**. Задача «Web Push подписки» входит в эпик «Уведомления» и одновременно в веху «Релиз 1.2». Это две ортогональные оси, и объединять их в одну сущность нельзя.

Отсюда следует, что веха — **не эпик и не тип задачи**, а отдельная таблица.

### Чего у вехи нет намеренно

| | Почему |
|---|---|
| Иерархии вех | вехи линейны по времени; вложенность не имеет смысла |
| Своего статуса | вычисляется из состава, как у эпика |
| Исполнителя | это дата, а не работа |
| Зависимостей между вехами | порядок задаётся датами |
| Автоматического закрытия | закрытие вехи — решение человека (принцип из README проекта) |

---

## 2. Схема

```sql
-- V{N}__milestones.sql

CREATE TABLE milestone (
    id          INTEGER AUTO_INCREMENT PRIMARY KEY,
    project_id  INTEGER      NOT NULL,
    title       VARCHAR(200) NOT NULL,
    description CLOB         NULL,
    due_date    DATE         NOT NULL,      -- веха без даты бессмысленна
    state       VARCHAR(10)  NOT NULL DEFAULT 'OPEN',  -- OPEN | CLOSED
    closed_at   TIMESTAMP    NULL,
    closed_by   INTEGER      NULL,
    created_by  INTEGER      NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL,
    version     INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT fk_ms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT uq_ms_title   UNIQUE (project_id, title),
    CONSTRAINT chk_ms_state  CHECK (state IN ('OPEN', 'CLOSED'))
);

CREATE INDEX idx_ms_project ON milestone (project_id, due_date);

ALTER TABLE tasks ADD COLUMN milestone_id INTEGER NULL;

ALTER TABLE tasks ADD CONSTRAINT fk_task_milestone
    FOREIGN KEY (milestone_id) REFERENCES milestone(id);

-- эпик не привязывается к вехе: веха собирает конкретную работу
ALTER TABLE tasks ADD CONSTRAINT chk_epic_no_milestone
    CHECK (task_type = 'TASK' OR milestone_id IS NULL);

CREATE INDEX idx_task_milestone ON tasks (milestone_id);
```

Одна таблица, одна колонка в `tasks`, два индекса.

### Три решения в схеме

**`due_date NOT NULL`.** Веха без даты — это тег. Если дата неизвестна, ставьте примерную и правьте: пустая дата ломает и сортировку, и шкалу, и все отчёты.

**`UNIQUE (project_id, title)`.** Две вехи «Релиз 1.0» в одном проекте — гарантированная путаница. Уникальность в пределах проекта, а не глобально: у каждого проекта свои релизы.

**`chk_epic_no_milestone`.** К вехе привязываются задачи, не эпики. Эпик — это направление работы, оно тянется через несколько релизов; попытка привязать его к одной дате означает, что человек перепутал сущности.

**`ON DELETE` у `fk_task_milestone` не задан** — удаление вехи с задачами требует явного решения (§4.4).

---

## 3. Состояние вехи

Как у эпика, состояние вычисляется, а не хранится. Хранится только `OPEN`/`CLOSED` — факт ручного закрытия.

```java
public record MilestoneProgress(int total, int done, int overdue) {
    public int percent() { return total == 0 ? 0 : done * 100 / total; }
    public boolean complete() { return total > 0 && total == done; }
}

public enum MilestoneState { PLANNED, IN_PROGRESS, READY, AT_RISK, LATE, CLOSED }
```

```java
public MilestoneState stateOf(MilestoneRow m, MilestoneProgress p, LocalDate today) {
    if (m.state == CLOSED)                     return MilestoneState.CLOSED;
    if (p.complete())                          return MilestoneState.READY;   // всё готово, но не закрыта
    if (m.dueDate.isBefore(today))             return MilestoneState.LATE;
    if (p.done() == 0)                         return MilestoneState.PLANNED;

    long daysLeft = DAYS.between(today, m.dueDate);
    int  left     = p.total() - p.done();
    // грубая оценка: меньше дня на оставшуюся задачу
    if (daysLeft < left)                       return MilestoneState.AT_RISK;

    return MilestoneState.IN_PROGRESS;
}
```

`READY` отдельно от `CLOSED` — важное различие. Все задачи выполнены, но веха не закрыта: релиз собран, но не выпущен. Система показывает готовность и **предлагает** закрыть, не закрывая сама.

| Состояние | Цвет | Смысл |
|---|---|---|
| `PLANNED` | `neutral` | работа не начата |
| `IN_PROGRESS` | `secondary` | идёт по плану |
| `READY` | `primary` | всё готово, ждёт закрытия |
| `AT_RISK` | `warning` | не успеваем по темпу |
| `LATE` | `error` | срок прошёл, работа осталась |
| `CLOSED` | `neutral`, приглушённый | завершена |

---

## 4. Сервер

### 4.1 Эндпоинты

```
GET    /api/projects/{projectId}/milestones?state=open     список с прогрессом
POST   /api/projects/{projectId}/milestones                создать
GET    /api/milestones/{id}                                одна веха
PUT    /api/milestones/{id}                                правка; X-Expected-Version
DELETE /api/milestones/{id}?tasks=detach|move&to={id}      удалить
PUT    /api/milestones/{id}/close                          закрыть
PUT    /api/milestones/{id}/reopen                         открыть заново
GET    /api/milestones/{id}/tasks                          задачи вехи
```

Плюс изменения существующих:

| Операция | Что добавляется |
|---|---|
| `POST /api/tasks` | `milestoneId` |
| `PATCH /api/tasks/{id}` | `milestoneId` — привязать, перенести, отвязать (`null`) |
| `GET /api/tasks/{id}` | `milestoneId`, `milestoneTitle`, `milestoneDueDate` |
| `POST /api/find` | `milestoneId`, `noMilestone` |

### 4.2 Ответ

```java
public record MilestoneResponse(
    Integer id, Integer projectId,
    String title, String description,
    LocalDate dueDate,
    MilestoneState state,
    int taskTotal, int taskDone, int taskOverdue,
    Instant closedAt, String closedByName,
    Instant createdAt, Instant updatedAt, int version
) {}
```

`taskOverdue` — задачи вехи с истёкшим собственным сроком. Веха может укладываться в дату и содержать просроченные задачи; это первое, на что смотрит планировщик.

### 4.3 Прогресс — один запрос на список

```java
public Map<Integer, MilestoneProgress> progressFor(Collection<Integer> ids) {
    if (ids.isEmpty()) return Map.of();

    var rows = em.createQuery("""
        SELECT t.milestoneId,
               COUNT(t),
               SUM(CASE WHEN s.isClosed = TRUE THEN 1 ELSE 0 END),
               SUM(CASE WHEN s.isClosed = FALSE
                         AND t.dueDate < :today THEN 1 ELSE 0 END)
        FROM TaskEntity t
        JOIN ProjectStatusEntity s ON s.id = t.statusId
        WHERE t.milestoneId IN :ids
        GROUP BY t.milestoneId
        """, Object[].class)
        .setParameter("ids", ids)
        .setParameter("today", LocalDate.now())
        .getResultList();

    var result = new HashMap<Integer, MilestoneProgress>();
    for (var r : rows) {
        result.put((Integer) r[0], new MilestoneProgress(
            ((Long) r[1]).intValue(), ((Long) r[2]).intValue(), ((Long) r[3]).intValue()));
    }
    for (var id : ids) result.putIfAbsent(id, new MilestoneProgress(0, 0, 0));
    return result;
}
```

`putIfAbsent` обязателен: пустая веха не попадает в `GROUP BY` и иначе исчезла бы из списка. Только что созданная веха — как раз пустая.

Как и у эпиков, выполненность определяется флагом `isClosed` статуса проекта, а не названием статуса.

### 4.4 Удаление

```java
@DELETE
@Path("/{id}")
public Response delete(@PathParam("id") Integer id,
                       @QueryParam("tasks") String policy,
                       @QueryParam("to") Integer targetId) {

    int count = milestones.countTasks(id);
    if (count > 0 && policy == null) {
        return Response.status(409).entity(new ConflictResponse(
            "К вехе привязано %d задач. Укажите tasks=detach или tasks=move&to={id}"
                .formatted(count), count)).build();
    }
    milestones.delete(id, TaskPolicy.parse(policy), targetId);
    return Response.noContent().build();
}
```

| Параметр | Поведение |
|---|---|
| задач нет | удалить, `204` |
| задач есть, параметра нет | `409` с их числом |
| `tasks=detach` | задачам ставится `milestone_id = NULL` |
| `tasks=move&to=7` | задачи переносятся в веху 7 (проверка: тот же проект) |

Задачи **не удаляются никогда**: веха — это ярлык срока, а не контейнер работы. Перенос сроков не должен уничтожать задачи.

### 4.5 Закрытие

```java
@Transactional
public MilestoneResponse close(Integer id) {
    var m = milestones.require(id);
    reject(m.state == CLOSED, "Веха уже закрыта");

    var p = progressFor(List.of(id)).get(id);
    m.state    = CLOSED;
    m.closedAt = Instant.now();
    m.closedBy = currentUserId();

    // незавершённые задачи не теряются: они остаются привязанными,
    // но помечаются как перенесённые — решение о переносе принимает человек
    if (!p.complete()) {
        activity.recordProject(m.projectId, "MILESTONE_CLOSED_INCOMPLETE",
            Map.of("milestoneId", id, "remaining", p.total() - p.done()));
    }
    return mapper.toResponse(m, p);
}
```

Закрытие вехи с незакрытыми задачами **разрешено**: релиз выпускают и с недоделанными пунктами. Но событие пишется в журнал отдельным типом, а интерфейс просит подтверждения с указанием числа оставшихся задач и предлагает перенести их в следующую веху.

### 4.6 Подсказка о готовности

При закрытии последней задачи вехи — тот же механизм `hint`, что и у эпиков:

```java
if (task.milestoneId != null) {
    var p = progressFor(List.of(task.milestoneId)).get(task.milestoneId);
    if (p.complete()) {
        response = response.withHint(new Hint("MILESTONE_READY",
            "Все задачи вехи выполнены. Закрыть веху?", task.milestoneId));
    }
}
```

Клиент показывает `UAlert` с кнопкой. Агент через API увидит `hint` в ответе и передаст вопрос человеку, не закрывая веху сам.

### 4.7 Валидация

| Условие | Ответ |
|---|---|
| Задача и веха из разных проектов | `400` «Веха должна быть в том же проекте» |
| Привязка вехи к эпику | `400` «К вехе привязываются задачи, а не эпики» |
| Дубль названия в проекте | `409` «Веха с таким названием уже есть» |
| Перенос в закрытую веху | `400` «Нельзя добавлять задачи в закрытую веху» |

---

## 5. Клиент

### 5.1 Маршруты

```ts
{ path: '/projects/:id/milestones',    component: MilestoneListView },
{ path: '/milestones/:id',             component: MilestoneDetailView }
```

Вкладка «Вехи» на странице проекта — четвёртая, после «Роадмап».

### 5.2 Список вех

```
Вехи                              [ ] Показать закрытые   [+ Веха]
───────────────────────────────────────────────────────────────────
◆ Релиз 1.2                                    осталось 12 дней
  ████████████████░░░░░░  8/12 · 1 просрочена       20.09.2026
◆ Демо заказчику                               осталось 34 дня
  ████░░░░░░░░░░░░░░░░░░  2/9                       12.10.2026
◇ Релиз 2.0                                    осталось 89 дней
  ░░░░░░░░░░░░░░░░░░░░░░  0/15                      06.12.2026
```

```vue
<script setup lang="ts">
const props = defineProps<{ milestone: MilestoneResponse }>()

const STATE_META: Record<MilestoneState, { color: string; label: string }> = {
  PLANNED:     { color: 'neutral',   label: 'Запланирована' },
  IN_PROGRESS: { color: 'secondary', label: 'В работе' },
  READY:       { color: 'primary',   label: 'Готова к закрытию' },
  AT_RISK:     { color: 'warning',   label: 'Под риском' },
  LATE:        { color: 'error',     label: 'Просрочена' },
  CLOSED:      { color: 'neutral',   label: 'Закрыта' }
}

const daysLeft = computed(() =>
  differenceInDays(new Date(props.milestone.dueDate), new Date()))
</script>

<template>
  <RouterLink :to="`/milestones/${milestone.id}`"
              class="block py-3 border-b border-default hover:bg-elevated/50">
    <div class="flex items-center gap-2 mb-1.5">
      <UIcon
        :name="milestone.state === 'CLOSED' ? 'i-lucide-diamond' : 'i-lucide-diamond-plus'"
        class="size-4"
        :class="`text-${STATE_META[milestone.state].color}`" />
      <span class="text-sm font-medium">{{ milestone.title }}</span>
      <UBadge v-if="milestone.state === 'READY'" size="xs" variant="subtle" color="primary">
        Готова к закрытию
      </UBadge>
      <span class="flex-1" />
      <span class="text-xs" :class="daysLeft < 0 ? 'text-error' : 'text-muted'">
        {{ daysLeft < 0 ? `просрочена на ${-daysLeft} дн.` : `осталось ${daysLeft} дн.` }}
      </span>
    </div>

    <div class="flex items-center gap-3">
      <UProgress
        v-if="milestone.taskTotal > 1"
        :model-value="milestone.taskDone" :max="milestone.taskTotal"
        :color="STATE_META[milestone.state].color" size="xs" class="flex-1 max-w-64" />
      <span class="font-mono text-xs text-muted">
        {{ milestone.taskDone }}/{{ milestone.taskTotal }}
        <span v-if="milestone.taskOverdue" class="text-error">
          · {{ milestone.taskOverdue }} просроч.
        </span>
      </span>
      <span class="flex-1" />
      <span class="font-mono text-xs text-muted">
        {{ formatDate(milestone.dueDate) }}
      </span>
    </div>
  </RouterLink>
</template>
```

Закрытые вехи скрыты по умолчанию, переключатель над списком.

### 5.3 Страница вехи

```
← Веха-план / Веб-клиент
◆ Релиз 1.2                                      [Закрыть веху] [⋯]
Срок 20.09.2026 · осталось 12 дней · 8 из 12

████████████████░░░░░░

Описание вехи…

Задачи вехи (12)                                    [+ Добавить]
☑ TSK-105  Интерфейс парсера        📦 Обмен       ДК   Готово
☐ TSK-108  Миграция пакетов         📦 Обмен       АИ   В работе  18 сен
☐ TSK-310  Web Push подписки        📦 Уведомления АИ   В работе  25 сен ⚠
```

Ключевое отличие от страницы эпика: в списке задач показывается **эпик каждой задачи**. Веха собирает работу из разных направлений, и без этой колонки непонятно, откуда взялась задача.

Задачи со сроком позже срока вехи помечаются `⚠` — они не успеют по определению.

### 5.4 Селектор вехи на странице задачи

В правой панели, под селектором эпика:

```vue
<div>
  <div class="text-xs text-muted mb-1">Веха</div>
  <USelectMenu
    v-model="form.milestoneId"
    :items="openMilestones"
    value-key="id" label-key="title"
    placeholder="Без вехи">
    <template #item="{ item }">
      <div class="flex items-center gap-2 w-full">
        <UIcon name="i-lucide-diamond" class="size-3.5 text-muted" />
        <span class="truncate">{{ item.title }}</span>
        <span class="flex-1" />
        <span class="font-mono text-xs text-muted">{{ formatDate(item.dueDate) }}</span>
      </div>
    </template>
  </USelectMenu>
  <p v-if="dueAfterMilestone" class="text-xs text-warning mt-1">
    Срок задачи позже срока вехи
  </p>
</div>
```

В списке только открытые вехи, отсортированные по дате. Предупреждение о сроке — не запрет: иногда так и планируют.

Согласно `task_edit_2.md`, селектор сохраняется **сразу**, без общей кнопки.

### 5.5 Вехи на роадмапе

Вехи рисуются вертикальными линиями с ромбом поверх шкалы эпиков — это и есть их главная ценность на планировании.

```vue
<!-- поверх строк роадмапа, в том же relative-контейнере -->
<div v-for="m in milestones" :key="m.id"
     class="absolute top-0 bottom-0 pointer-events-none z-20"
     :style="{ left: `${posOf(m.dueDate)}%` }">
  <div class="w-px h-full" :class="`bg-${STATE_META[m.state].color}/50`" />
  <UIcon name="i-lucide-diamond"
         class="absolute -top-1.5 -left-1.5 size-3"
         :class="`text-${STATE_META[m.state].color}`" />
</div>
```

Ромбы — в шапке шкалы, с подписями. Пересечение ромба с полосой эпика мгновенно показывает, попадает ли работа в релиз.

### 5.6 Фильтр в списке задач

В панель фильтров добавляется `USelectMenu` «Веха» со списком открытых вех и двумя особыми пунктами: «Без вехи» и «Любая». Плюс режим группировки `По вехам` рядом с `По эпикам` из `tasks_view.md` — механизм группировки тот же, ключ группы другой.

---

## 6. Тексты интерфейса

| Ситуация | Текст |
|---|---|
| Закрытие с незавершёнными | В вехе осталось 4 незакрытых задачи. Перенести их в следующую веху или оставить? |
| Все задачи готовы | Все задачи вехи выполнены. Закрыть веху? |
| Задача в закрытую веху | Нельзя добавлять задачи в закрытую веху |
| Привязка эпика | К вехе привязываются задачи, а не эпики |
| Удаление с задачами | К вехе привязано 12 задач. Открепить их или перенести в другую веху? |
| Срок задачи позже вехи | Срок задачи позже срока вехи |
| Пустая веха | В вехе пока нет задач. Добавьте задачи из списка или создайте новую. |

---

## 7. Порядок работ

**Вечер 1 — сервер, ядро.** Миграция, `MilestoneRepository`, `progressFor` одним запросом, `stateOf`, CRUD-эндпоинты, валидация проекта и типа задачи.

**Вечер 2 — сервер, завершение.** Закрытие и переоткрытие, удаление с `tasks=detach|move`, `hint` о готовности, `milestoneId` в `TaskResponse` и `FindTasksRequest`.

**Вечер 3 — клиент, вехи.** Список, страница вехи с колонкой эпика, модалка создания и правки, вкладка на странице проекта.

**Вечер 4 — клиент, интеграция.** Селектор на странице задачи с предупреждением о сроке, ромбы на роадмапе, фильтр и группировка по вехам в списке задач.

---

## 8. Тесты

| Класс | Что проверяет |
|---|---|
| `MilestoneCrudTest` | создание, `409` на дубль названия в проекте, `400` при отсутствии `dueDate` |
| `MilestoneTaskLinkTest` | `400` при задаче из другого проекта; `400` при попытке привязать эпик; `400` при закрытой вехе |
| `MilestoneProgressTest` | считает по `isClosed` статуса; пустая веха даёт `0/0` и присутствует в списке |
| `MilestoneStateTest` | `READY` при всех выполненных и открытой вехе; `LATE` при истёкшей дате; `AT_RISK` когда дней меньше, чем задач; `CLOSED` после закрытия |
| `MilestoneOverdueTest` | `taskOverdue` считает только незакрытые задачи с истёкшим собственным сроком |
| `MilestoneBatchTest` | список из 20 вех делает **один** запрос прогресса |
| `MilestoneCloseTest` | закрытие с незавершёнными разрешено, пишет `MILESTONE_CLOSED_INCOMPLETE` в журнал; повторное закрытие даёт `400` |
| `MilestoneDeleteTest` | `409` без параметра; `detach` обнуляет `milestone_id`; `move` переносит; **задачи не удаляются ни при каком варианте** |
| `MilestoneHintTest` | закрытие последней задачи возвращает `hint`, веха **не закрывается сама** |
| `MilestoneVersionTest` | `PUT` с устаревшим `X-Expected-Version` даёт `409` |

Дополнить `OpenApiSpecTest`: восемь новых операций под `bearerAuth`, ни одной в `PUBLIC_OPERATIONS`.
