# ANotes — эпики и задачи

Иерархия работы через **тип сущности**, а не через свободное родительство. Заменяет предыдущую редакцию документа (`parent_id` на однородных задачах) и вариант с таблицей связей.

Стек: Quarkus 3.14.4, Java 21, H2, Panache, Flyway. Клиент — Vue 3 + TypeScript + Nuxt UI.

> **Статус (сессия 2026-09-07).** Серверная часть реализована — §8 «вечер 1» и
> «вечер 2»: колонки `taskType`/`parentId` + 4 CHECK, `TaskType`, `EpicProgress`,
> `EpicProgressService`, запреты в `TaskService`, `setParent`, `convert`,
> удаление с `?children=`, поля в `TaskResponse`, `taskType`/`parentId` в
> `POST /api/find`, ручки `GET /api/epics/{id}/tasks` и `GET /api/projects/{id}/epics`.
> Тесты — 11 классов (§9 минус `ProjectCountTest`). Отклонения от документа:
> схема одним файлом (не Flyway); у эпика `statusId = NULL`, а не «формальный»
> статус (колонка тут и так nullable); привязка к эпику — отдельная ручка
> `PUT /api/tasks/{id}/parent`, а не поле в PATCH (`TaskUpdateRequest` не отличает
> присланный `null` от отсутствующего); у задач нет буквенного `key`, поэтому в
> `TaskResponse` только `parentTitle`; `spentSeconds` в `TaskResponse` не добавлял
> — время задачи отдаёт `GET /api/tasks/{id}/time` (у эпика — сумма по детям);
> §3.9 (`openTaskCount`) пропущен — такого счётчика в проекте нет.
> **Клиент (§5, «вечер 3-4») — вне этого репозитория.** Подробности — `summary.md` §23.

---

## 1. Проблема, которую решает модель

Если родителем может стать любая задача, то «достойна ли эта задача быть родителем» решается на глаз. На десяти людях это незаметно, на сотне — у одной команды родитель означает эпик, у другой спринт, у третьей просто крупную задачу. Соглашение, записанное в вики, не помогает: его не читают.

Решает не документ, а невозможность сделать неправильно.

**Родительство — это вид сущности, а не решение пользователя.**

| | EPIC | TASK |
|---|---|---|
| Может иметь родителя | никогда | только EPIC |
| Может иметь детей | да | никогда |
| Исполнитель | **нет** | да |
| Собственный статус | **нет**, выводится из детей | да |
| Списание времени | **нельзя** | можно |
| Попадает в «Мои задачи» | нет | да |
| Срок | да, справочный | да |

Ключевое здесь не запрет вложенности, а то, что **эпик нельзя выполнять**. Нет исполнителя, нет своего статуса, нельзя списать время. Это контейнер, а не работа.

Поэтому соглашение становится единым само собой: никто не заведёт эпик, имея в виду «просто крупную задачу», — крупную задачу нужно кому-то назначить, а эпик не назначается. Различие видно в интерфейсе с первой секунды.

### Что снимается по построению

| Проблема прежней модели | Судьба |
|---|---|
| Деревья глубиной в четыре уровня | исчезает: EPIC не вкладывается, TASK не имеет детей |
| Циклы `A → B → A` | исчезает: обход графа не нужен |
| Разные соглашения о родителе | исчезает: эпик один и очевиден |
| `openTaskCount` завышен вдвое | исчезает: фильтр `task_type = 'TASK'`, без логики «только листья» |
| Нужен `spentSecondsTotal` | исчезает: на эпик нельзя списать время, сумма детей и есть вся сумма |
| Рассинхрон статуса родителя и ребёнка | исчезает: у эпика нет своего статуса |
| «Закрыть родителя?» | исчезает как вопрос: эпик закрыт тогда и только тогда, когда закрыты все дети |
| Прогресс `0/1` | остаётся, но безобиден (см. §7) |

Восемь пунктов из девяти снимаются типом, а не проверками. Кода меньше, чем в обоих предыдущих вариантах.

---

## 2. Схема

```sql
-- V{N}__epics.sql

ALTER TABLE tasks ADD COLUMN task_type VARCHAR(10) NOT NULL DEFAULT 'TASK';
ALTER TABLE tasks ADD COLUMN parent_id INTEGER NULL;

ALTER TABLE tasks ADD CONSTRAINT fk_task_parent
    FOREIGN KEY (parent_id) REFERENCES tasks(id);

ALTER TABLE tasks ADD CONSTRAINT chk_task_type
    CHECK (task_type IN ('EPIC', 'TASK'));

-- Эпик не может иметь родителя; проверка уровня БД, дублирует сервисную
ALTER TABLE tasks ADD CONSTRAINT chk_epic_no_parent
    CHECK (task_type = 'TASK' OR parent_id IS NULL);

-- У эпика нет исполнителя и нет статуса
ALTER TABLE tasks ADD CONSTRAINT chk_epic_no_assignee
    CHECK (task_type = 'TASK' OR assignee_id IS NULL);

CREATE INDEX idx_task_parent ON tasks (parent_id);
CREATE INDEX idx_task_type   ON tasks (project_id, task_type);
```

Две колонки, три CHECK-ограничения, два индекса. Ни одной новой таблицы.

`DEFAULT 'TASK'` закрывает вопрос с существующими строками: всё, что было создано до миграции, — обычные задачи.

**Про `status_id` у эпика.** Колонка остаётся `NOT NULL` (её нельзя ослабить без переписывания существующих данных), но значение игнорируется: сервер никогда его не читает для эпика и не даёт менять. При создании эпика ставится статус проекта по умолчанию и больше не трогается. Если позже захотите чистоты — отдельная миграция, делающая колонку nullable.

**Без `ON DELETE CASCADE`** — намеренно. Удаление эпика с задачами внутри должно быть осознанным выбором (см. §4.5).

---

## 3. Логика сервера

### 3.1 Модель

```java
public enum TaskType { EPIC, TASK }
```

```java
// domain/model/EpicProgress.java
public record EpicProgress(int total, int done, boolean closed) {
    public int percent() { return total == 0 ? 0 : done * 100 / total; }

    public static EpicProgress of(int total, int done) {
        return new EpicProgress(total, done, total > 0 && total == done);
    }
}
```

`closed` намеренно `false` у пустого эпика: эпик без задач не считается выполненным, иначе только что созданное направление работы сразу показывалось бы закрытым.

### 3.2 Ответы API

```java
public record TaskResponse(
    Integer id, String key, String title, String description,
    TaskType taskType,                 // EPIC | TASK

    // только у TASK — у эпика null
    Integer  statusId, String statusName, String statusColor,
    Integer  assigneeId, String assigneeName,
    Integer  spentSeconds,

    // только у TASK
    Integer  parentId, String parentKey, String parentTitle,

    // только у EPIC
    Integer  childTotal, Integer childDone, Boolean epicClosed,

    // общее
    Integer  priority, LocalDate startDate, LocalDate dueDate,
    List<String> tags, String summary,
    Instant createdAt, Instant updatedAt, int version
) {}
```

`parentKey` и `parentTitle` подтягиваются одним `LEFT JOIN` — иначе клиент делает второй запрос ради хлебной крошки на каждой задаче.

Поля разных типов — `null` у неподходящего вида. Альтернатива в виде двух отдельных схем (`EpicResponse` и `TaskResponse`) чище на бумаге, но заставляет клиента разветвлять код в каждом списке, где встречаются оба вида. Один тип с nullable-полями практичнее.

### 3.3 Прогресс эпика — один запрос на страницу

Наивная реализация делает `SELECT` на каждый эпик в списке. Правильно — один запрос на всю страницу:

```java
@ApplicationScoped
public class EpicProgressService {

    @Inject EntityManager em;

    public Map<Integer, EpicProgress> forEpics(Collection<Integer> epicIds) {
        if (epicIds.isEmpty()) return Map.of();

        var rows = em.createQuery("""
            SELECT t.parentId,
                   COUNT(t),
                   SUM(CASE WHEN s.isClosed = TRUE THEN 1 ELSE 0 END)
            FROM TaskEntity t
            JOIN ProjectStatusEntity s ON s.id = t.statusId
            WHERE t.parentId IN :ids
            GROUP BY t.parentId
            """, Object[].class)
            .setParameter("ids", epicIds)
            .getResultList();

        var result = new HashMap<Integer, EpicProgress>();
        for (var r : rows) {
            result.put((Integer) r[0],
                EpicProgress.of(((Long) r[1]).intValue(), ((Long) r[2]).intValue()));
        }
        // эпики без задач в GROUP BY не попадут — дополняем нулями
        for (var id : epicIds) result.putIfAbsent(id, EpicProgress.of(0, 0));
        return result;
    }
}
```

Два момента, которые легко упустить:

- **`isClosed` статуса — единственный источник истины** о выполненности. Не название статуса, не жёсткий список. Именно ради этого флаг и заводился при настраиваемых статусах.
- **Эпики без задач не попадают в `GROUP BY`** и без `putIfAbsent` просто исчезли бы из карты, а клиент получил бы `null` вместо `0/0`.

Индекс `idx_task_parent` покрывает `WHERE parent_id IN (...)`, `JOIN` идёт по первичному ключу статуса. На тысячах задач — единицы миллисекунд.

### 3.4 Создание

```java
@Transactional
public TaskResponse create(TaskRequest req) {
    var type = req.taskType() == null ? TaskType.TASK : req.taskType();

    if (type == TaskType.EPIC) {
        reject(req.parentId()   != null, "Эпик не может быть вложен в другой эпик");
        reject(req.assigneeId() != null, "У эпика нет исполнителя — назначайте задачи внутри");
        reject(req.statusId()   != null, "Статус эпика вычисляется по его задачам");
    } else if (req.parentId() != null) {
        validateParent(req.projectId(), req.parentId());
    }

    var entity = mapper.toEntity(req, type);
    if (type == TaskType.EPIC) {
        entity.assigneeId = null;
        entity.statusId   = statuses.defaultOf(req.projectId()).id;  // формально, не используется
    }
    entity.persist();

    activity.record(entity.id, type == TaskType.EPIC ? "EPIC_CREATED" : "TASK_CREATED", Map.of());
    return mapper.toResponse(entity);
}
```

### 3.5 Назначение родителя

```java
private void validateParent(Integer childProjectId, Integer parentId) {
    var parent = tasks.require(parentId);

    reject(parent.taskType != TaskType.EPIC,
           "Родителем может быть только эпик");
    reject(!Objects.equals(parent.projectId, childProjectId),
           "Эпик должен быть в том же проекте");
}

@Transactional
public TaskResponse setParent(Integer taskId, Integer parentId) {
    var child = tasks.require(taskId);

    reject(child.taskType != TaskType.TASK,
           "Эпик нельзя вложить в другой эпик");

    if (parentId == null) {
        child.parentId = null;
        activity.record(taskId, "EPIC_UNLINKED", Map.of());
        return mapper.toResponse(child);
    }

    validateParent(child.projectId, parentId);
    child.parentId = parentId;
    activity.record(taskId, "EPIC_LINKED", Map.of("epicId", parentId));
    return mapper.toResponse(child);
}
```

**Две проверки вместо четырёх** из прежней редакции. Ушли проверка на самоссылку (эпик и задача — разные виды, задача не может быть своим родителем через тип), проверка глубины (гарантируется типом) и проверка «у задачи есть дети» (у TASK детей не бывает).

Обхода графа нет нигде: цикл невозможен по построению, потому что рёбра идут только EPIC → TASK.

### 3.6 Запреты на действия с эпиком

Три места, где эпик должен отказывать. Все три — в сервисах, а не в ресурсах, иначе агент через API обойдёт их.

```java
// TaskService.changeStatus
reject(task.taskType == TaskType.EPIC,
       "Статус эпика вычисляется по его задачам. Меняйте статусы задач внутри.");

// TaskService.assign
reject(task.taskType == TaskType.EPIC,
       "У эпика нет исполнителя. Назначьте исполнителей задачам внутри.");

// TimeEntryService.log
reject(task.taskType == TaskType.EPIC,
       "Время списывается на задачи, не на эпик.");
```

Тексты важны: они уходят и человеку в тост, и модели в ответ на неправильный вызов. Формулировка «Меняйте статусы задач внутри» подсказывает следующее действие, а голое `400 Bad Request` — нет.

### 3.7 Удаление эпика

```java
@DELETE
@Path("/{taskId}")
public Response delete(@PathParam("taskId") Integer taskId,
                       @QueryParam("children") String children) {

    var task = tasks.require(taskId);
    if (task.taskType == TaskType.TASK) {
        tasks.delete(taskId);
        return Response.noContent().build();
    }

    int count = tasks.countChildren(taskId);
    if (count > 0 && children == null) {
        return Response.status(409).entity(new ConflictResponse(
            "В эпике %d задач. Укажите children=detach или children=delete".formatted(count),
            count)).build();
    }
    epics.delete(taskId, ChildPolicy.parse(children));
    return Response.noContent().build();
}
```

| Параметр | Поведение |
|---|---|
| нет, задач нет | удалить эпик, `204` |
| нет, задачи есть | `409` с их числом |
| `children=detach` | задачам ставится `parent_id = NULL`, эпик удаляется |
| `children=delete` | удаляется всё |

`detach` безопаснее, но выбор делает человек — интерфейс показывает оба варианта с явным числом затронутых задач.

### 3.8 Конвертация

Единственная операция, которой в прежней модели не было, и цена выбранного подхода.

```
PUT /api/tasks/{taskId}/convert   { "to": "EPIC" }
```

```java
@Transactional
public TaskResponse convert(Integer taskId, TaskType to) {
    var task = tasks.require(taskId);
    if (task.taskType == to) return mapper.toResponse(task);

    if (to == TaskType.EPIC) {
        reject(task.parentId != null,
               "Задача входит в эпик. Сначала отвяжите её.");
        reject(timeEntries.secondsOf(taskId) > 0,
               "На задачу списано время — её нельзя превратить в эпик.");
        task.assigneeId = null;                       // исполнитель снимается
    } else {
        reject(tasks.countChildren(taskId) > 0,
               "В эпике есть задачи. Перенесите или отвяжите их.");
        task.statusId = statuses.defaultOf(task.projectId).id;
    }

    task.taskType = to;
    activity.record(taskId, "TYPE_CONVERTED", Map.of("to", to.name()));
    return mapper.toResponse(task);
}
```

Отказ при списанном времени — не формальность: списанное время принадлежит исполнителю задачи, а у эпика исполнителя нет, и запись повиснет без владельца.

Практически конвертация нужна редко: человек либо сразу планирует направление работы, либо ведёт одну задачу.

### 3.9 Счётчики проекта

Одно правило вместо прежней конструкции с `NOT EXISTS`:

```sql
SELECT COUNT(*) FROM tasks t
JOIN project_status s ON s.id = t.status_id
WHERE t.project_id = ?
  AND t.task_type = 'TASK'          -- эпики не считаются работой
  AND s.is_closed = FALSE;
```

Эпик — контейнер, а не единица работы, поэтому в `openTaskCount` он не входит никогда. Никакой логики «только листья», никаких подзапросов.

### 3.10 Учёт времени

`spentSecondsTotal` из прежней редакции **не нужен**. На эпик списать время нельзя, значит вся его трудоёмкость — это сумма по детям, и она однозначна:

```java
public int epicSpentSeconds(Integer epicId) {
    return em.createQuery("""
        SELECT COALESCE(SUM(e.seconds), 0) FROM TimeEntryEntity e
        JOIN TaskEntity t ON t.id = e.taskId
        WHERE t.parentId = :epicId
        """, Long.class)
        .setParameter("epicId", epicId)
        .getSingleResult().intValue();
}
```

Одно число, никакой двусмысленности «своё время или с детьми».

### 3.11 Поиск

В `FindTasksRequest` добавляются два поля:

```java
public record FindTasksRequest(
    /* … существующие … */
    TaskType taskType,      // EPIC | TASK | null = оба
    Integer  parentId       // задачи конкретного эпика
) {}
```

`assignedToMe` при этом автоматически исключает эпики, потому что у них нет исполнителя — отдельного условия не требуется.

---

## 4. API целиком

| Операция | Изменение |
|---|---|
| `POST /api/tasks` | `taskType` (по умолчанию `TASK`), `parentId` |
| `PATCH /api/tasks/{id}` | `parentId` — привязать, перенести, отвязать (`null`) |
| `GET /api/tasks/{id}` | `taskType`, `parentId`/`parentKey`/`parentTitle` либо `childTotal`/`childDone`/`epicClosed` |
| `DELETE /api/tasks/{id}` | `?children=detach\|delete` для эпиков |
| `PUT /api/tasks/{id}/convert` | **новая**: `{ "to": "EPIC" \| "TASK" }` |
| `GET /api/epics/{id}/tasks` | **новая**: задачи эпика |
| `GET /api/projects/{id}/epics` | **новая**: эпики проекта с прогрессом |
| `POST /api/find` | `taskType`, `parentId` |

Три новые операции. Все под `bearerAuth`, все — в `OpenApiSpecTest`.

Для агента (см. `ai.md`) в урезанную спеку добавляется `GET /api/projects/{id}/epics`: модель должна понимать структуру работы, прежде чем создавать задачи.

---

## 5. Логика клиента

### 5.1 Различение видов

Единственная развилка в коде клиента:

```ts
// composables/useTaskType.ts
export function isEpic(t: TaskResponse) { return t.taskType === 'EPIC' }
```

Всё остальное — условный рендер по этому признаку. Отдельных страниц для эпика и задачи **не заводится**: маршрут один, `/tasks/:id`, внутри разный набор блоков.

Обоснование: эпик и задача разделяют заголовок, описание, комментарии, файлы, теги, сроки и активность. Дублировать экран ради трёх различающихся блоков — лишняя поддержка.

### 5.2 Страница эпика

```
← Проекты / Веб-клиент
📦 EPIC-12 · Переработка обмена манифестами                      [⋯]

┌────────────────────────────────────┐  ┌──────────────────────┐
│ Описание (UEditor)                 │  │ Прогресс             │
│                                    │  │ ████████░░░░  3 из 5 │
│ ── Задачи ─────────── [+ Задача] ──│  │                      │
│ ☑ TSK-105 Интерфейс парсера    ДК  │  │ Срок      20.09.2026 │
│ ☑ TSK-106 Проверка подписи     ДК  │  │ Приоритет   Высокий  │
│ ☑ TSK-107 Тесты без schema     АИ  │  │ Теги      бэкенд     │
│ ☐ TSK-108 Миграция пакетов     АИ  │  │ ──────────────────── │
│ ☐ TSK-109 Документация          —  │  │ Списано       12ч 30м│
│                                    │  │ (сумма по задачам)   │
│ Комментарии · Активность           │  └──────────────────────┘
└────────────────────────────────────┘
```

Отличия от страницы задачи:

- **нет селекторов статуса и исполнителя** — вместо них блок прогресса;
- **нет вкладки «Учёт времени»**, вместо неё справка «Списано» с суммой по задачам и пометкой, что это сумма;
- **есть список задач** с чекбоксами;
- **нет вкладки «Обсуждение блоками»** — решения принимаются на уровне задач.

```vue
<script setup lang="ts">
const props = defineProps<{ task: TaskResponse }>()
const epic = computed(() => props.task.taskType === 'EPIC')
</script>

<template>
  <aside class="w-[214px] space-y-4">
    <!-- ЭПИК: прогресс вместо статуса и исполнителя -->
    <div v-if="epic">
      <div class="text-xs text-muted mb-1">Прогресс</div>
      <UProgress
        v-if="task.childTotal > 1"
        :model-value="task.childDone" :max="task.childTotal"
        color="secondary" size="sm" class="mb-1" />
      <div class="text-sm font-mono">
        {{ task.childDone }} из {{ task.childTotal }}
      </div>
      <UBadge v-if="task.epicClosed" color="primary" variant="subtle" size="xs"
              class="mt-2">
        Все задачи выполнены
      </UBadge>
    </div>

    <!-- ЗАДАЧА: обычные селекторы -->
    <template v-else>
      <StatusSelect   v-model="task.statusId"   :project-id="task.projectId" />
      <AssigneeSelect v-model="task.assigneeId" :project-id="task.projectId" />
    </template>

    <!-- общее для обоих -->
    <DateRangeField v-model:start="task.startDate" v-model:due="task.dueDate" />
    <PrioritySelect v-model="task.priority" />
    <TagInput       v-model="task.tags" :project-id="task.projectId" />
  </aside>
</template>
```

### 5.3 Список задач эпика

Чекбокс переключает статус между стартовым и закрывающим **без открытия задачи**. Это главное удобство: если закрыть задачу можно только зайдя в неё, эпиками пользоваться не будут.

```vue
<script setup lang="ts">
const props = defineProps<{ child: TaskResponse; projectId: number }>()
const { statuses } = useProjectStatuses(props.projectId)

const closed = computed(() =>
  statuses.value.find(s => s.id === props.child.statusId)?.isClosed ?? false)

async function toggle() {
  const target = closed.value
    ? statuses.value.find(s => s.isDefault)          // вернуть в работу
    : statuses.value.find(s => s.isClosed)           // закрыть
  if (!target) return

  const prev = props.child.statusId
  props.child.statusId = target.id                    // оптимистично
  try {
    await http(`/tasks/${props.child.id}`, {
      method: 'PATCH',
      headers: { 'X-Expected-Version': String(props.child.version) },
      body: JSON.stringify({ statusId: target.id })
    })
    emit('changed')                                   // пересчитать прогресс эпика
  } catch {
    props.child.statusId = prev                       // откат
    toast.add({ title: 'Не удалось изменить статус', color: 'error' })
  }
}
</script>

<template>
  <div class="flex items-center gap-3 py-2">
    <UCheckbox :model-value="closed" @update:model-value="toggle" />
    <span class="font-mono text-xs text-muted w-20">{{ child.key }}</span>
    <RouterLink :to="`/tasks/${child.id}`"
                class="flex-1 text-sm truncate hover:underline"
                :class="closed && 'line-through text-muted'">
      {{ child.title }}
    </RouterLink>
    <UserCell :user-id="child.assigneeId" size="xs" />
  </div>
</template>
```

Три детали, без которых будет плохо:

- **`X-Expected-Version`** — статус меняется у задачи, а не у эпика, значит версия берётся у задачи. Из списка эпика легко забыть её передать.
- **Оптимистичное обновление с откатом** — чекбокс должен отзываться мгновенно, иначе кликают дважды.
- **`emit('changed')`** — прогресс эпика считается на сервере, после изменения его надо перезапросить. Пересчитывать на клиенте нельзя: `isClosed` зависит от настроек статусов проекта, а не от локального знания.

### 5.4 Создание задачи внутри эпика

Кнопка «+ Задача» открывает обычную модалку создания, но с предзаполненным `parentId` и заблокированным полем эпика:

```vue
<TaskFormModal
  :project-id="task.projectId"
  :parent-id="task.id"
  parent-locked
  @created="refresh" />
```

Обратный путь тоже нужен: на странице обычной задачи в правой панели — селектор «Эпик» со списком эпиков проекта и опцией «Без эпика».

### 5.5 Список задач проекта

Смешанный список, где эпики и задачи различаются визуально:

```
📦 EPIC-12  Переработка обмена манифестами         3/5    20 сен
   TSK-105  Интерфейс парсера              ДК    Готово   —
   TSK-108  Миграция старых пакетов        АИ    В работе 18 сен
📦 EPIC-13  Клиент на Vue                          0/8    —
   TSK-201  Каркас приложения              ДК    К работе —
   TSK-202  Страница задачи                 —    Бэклог   —
```

Правила отображения:

| | Эпик | Задача |
|---|---|---|
| Иконка | `i-lucide-package` | нет |
| Колонка «Статус» | бейдж `3/5` | обычный статус |
| Колонка «Исполнитель» | пусто | аватар и имя |
| Отступ | нет | 20px, если есть родитель |
| Клик | открывает эпик | открывает задачу |

Фильтр в панели: `Все · Только задачи · Только эпики`. По умолчанию **все**, потому что человек, которому назначена задача, должен видеть её независимо от того, входит ли она в эпик.

### 5.6 Группировка по эпикам

Переключатель вида над таблицей: `Список · По эпикам`.

Во втором режиме задачи собираются под своими эпиками через `UCollapsible`, задачи без эпика идут отдельной группой «Без эпика» внизу. Один запрос `POST /api/find` без фильтра, группировка на клиенте — данных для страницы уже достаточно.

### 5.7 Создание эпика

В модалке создания задачи — переключатель вида первым полем:

```
Вид:  ( • ) Задача    (   ) Эпик
```

При выборе «Эпик» поля «Исполнитель» и «Статус» **исчезают**, а не блокируются, и появляется подпись:

> Эпик объединяет задачи. Исполнители и статусы задаются у задач внутри.

Исчезновение полей, а не блокировка — сознательный выбор: заблокированное поле выглядит как ошибка и провоцирует искать способ его разблокировать, отсутствующее считывается как «этого здесь не бывает».

---

## 6. Тексты интерфейса

Формулировки важны: они попадают и человеку, и модели через API.

| Ситуация | Текст |
|---|---|
| Попытка сменить статус эпика | Статус эпика вычисляется по его задачам. Меняйте статусы задач внутри. |
| Попытка назначить эпик | У эпика нет исполнителя. Назначьте исполнителей задачам внутри. |
| Попытка списать время на эпик | Время списывается на задачи, не на эпик. |
| Попытка вложить эпик в эпик | Эпик нельзя вложить в другой эпик. |
| Удаление эпика с задачами | В эпике 5 задач. Удалить вместе с ними или открепить их? |
| Конвертация со списанным временем | На задачу списано время — её нельзя превратить в эпик. |
| Пустой эпик | В эпике пока нет задач. Добавьте первую. |

---

## 7. Эпик с одной задачей

Вырожденный случай из прежней редакции. В новой модели он остаётся, но становится безобидным.

**В базе не стоит ничего.** `GROUP BY` работает одинаково для одного ребёнка и для двадцати: тот же индекс, то же число обращений.

**Счётчики проекта больше не ломаются.** В прежней модели родитель с одной подзадачей завышал `openTaskCount` ровно вдвое. Теперь эпики не считаются работой вообще, поэтому `1` остаётся `1` независимо от структуры.

**Учёт времени больше не двусмыслен.** Раньше родитель показывал ноль, хотя работа велась. Теперь на эпик нельзя списать время по определению, и «Списано» у него всегда означает сумму по задачам.

**Противоречивые состояния исчезли.** Раньше можно было закрыть родителя при открытой подзадаче. Теперь у эпика нет своего статуса, рассинхронизироваться нечему.

Остаётся одно: **прогресс `0/1` не несёт информации** — это булево значение, изображённое полосой, повторяющее статус единственной задачи. Отсюда правило в §5.2: `UProgress` рендерится только при `childTotal > 1`, при одной задаче остаётся текстовое «0 из 1».

И появляется новое, полезное свойство: эпик с одной задачей теперь **очевидно нелеп визуально**. Контейнер с одним предметом виден сразу, в отличие от прежней модели, где родитель и ребёнок выглядели одинаково. Дисциплина возникает сама, без подсказок и запретов.

Измерить масштаб при желании:

```sql
SELECT COUNT(*) AS epics,
       SUM(CASE WHEN c = 1 THEN 1 ELSE 0 END) AS with_one_task,
       SUM(CASE WHEN c = 0 THEN 1 ELSE 0 END) AS empty
FROM (
    SELECT e.id, COUNT(t.id) AS c
    FROM tasks e LEFT JOIN tasks t ON t.parent_id = e.id
    WHERE e.task_type = 'EPIC'
    GROUP BY e.id
);
```

Пустые эпики важнее одиночных: эпик без задач — это направление работы, которое завели и забросили.

---

## 8. Порядок работ

**Вечер 1 — сервер.** Миграция с тремя CHECK-ограничениями. `TaskType`, `EpicProgress`, `EpicProgressService.forEpics`. Три запрета в сервисах. Валидация родителя. Поля в `TaskResponse`.

**Вечер 2 — сервер, завершение.** `GET /api/epics/{id}/tasks`, `GET /api/projects/{id}/epics`, `PUT /convert`, удаление с `children`, `taskType` и `parentId` в `POST /api/find`, счётчики проекта с фильтром по типу.

**Вечер 3 — клиент, страница.** Условный рендер правой панели, список задач эпика с чекбоксами и оптимистичным обновлением, хлебная крошка, селектор эпика на странице задачи.

**Вечер 4 — клиент, списки.** Иконки и отступы в таблице, бейдж `3/5`, фильтр по виду, режим «По эпикам», переключатель вида в модалке создания.

---

## 9. Тесты

| Класс | Что проверяет |
|---|---|
| `EpicCreateTest` | эпик создаётся без исполнителя и статуса; передача `assigneeId` даёт `400` |
| `EpicNestingTest` | `400` при попытке вложить эпик в эпик и при родителе-задаче |
| `EpicCrossProjectTest` | `400` при эпике из другого проекта |
| `EpicForbiddenActionsTest` | смена статуса, назначение и списание времени на эпик дают `400` с понятным текстом |
| `EpicProgressTest` | считает по `isClosed` статуса; пустой эпик даёт `0/0` и `closed = false`; полный даёт `closed = true` |
| `EpicBatchTest` | список из 25 эпиков делает **один** запрос прогресса, а не 25 |
| `EpicDeleteTest` | `409` без параметра; `detach` обнуляет `parent_id`; `delete` удаляет всё |
| `ConvertTest` | `TASK → EPIC` снимает исполнителя; отказ при списанном времени и при наличии родителя; `EPIC → TASK` отказывает при наличии задач |
| `ProjectCountTest` | `openTaskCount` не считает эпики; эпик с одной открытой задачей даёт `1` |
| `EpicTimeTest` | «Списано» у эпика равно сумме по задачам; прямое списание отклоняется |
| `FindByTypeTest` | `taskType=TASK` не возвращает эпики; `assignedToMe` не возвращает эпики без отдельного условия |

Дополнить `OpenApiSpecTest`: три новые операции под `bearerAuth`, ни одной в `PUBLIC_OPERATIONS`.
