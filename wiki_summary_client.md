# Вики: краткое описание страницы + доступ ИИ-агента — гайд для клиента

Что изменилось на сервере (коммит `feat(wiki): краткое описание страницы + доступ ИИ-агента`, ветка влита в `master`) и что с этим делать на клиенте (Vue 3 + TS + Nuxt UI).

Полная спецификация модуля — `wiki.md`. Здесь только новое: поле `summary` и то, что агент теперь читает вики.

---

## 1. Коротко

| | |
|---|---|
| **`summary`** | Одно предложение «о чём страница». **Обязательно при создании**, необязательно при правке. До 500 символов. |
| **В дереве** | `WikiTreeNodeResponse` получил `summary` и `summaryInferred`. У страниц без своего описания `summary` — автопревью из начала текста, `summaryInferred: true`. |
| **В странице** | `WikiPageResponse` получил `summary` (после `title`). У страниц, созданных до этой правки, — `null`. |
| **Поиск** | `POST /api/wiki/find` с `contentSearch` теперь матчит и по `summary`. |
| **ИИ-агент** | В набор инструментов агента добавлены **чтение** дерева, страницы и поиск по вики. Правка вики агенту не выдаётся. |
| **Схема** | `wikiPages.summary VARCHAR(500)` nullable. Ревизии (`wikiRevisions`) описание не хранят. |

---

## 2. Контракт поля `summary`

### 2.1 Создание — `POST /api/projects/{projectId}/wiki`

Тело `WikiPageRequest`:

```jsonc
{
  "parentId": null,                 // null = страница верхнего уровня; иначе id родителя (родитель обязан быть верхнего уровня)
  "title": "Обмен манифестами",     // обязателен, ≤ 200
  "summary": "Как узлы синхронизируют состояние через манифест: формат, порядок сообщений, обработка ошибок.",
                                    // ОБЯЗАТЕЛЕН, 1..500 символов, не пробелы
  "content": "# Обмен манифестами\n\nМанифест — это JSON...",   // обязателен
  "comment": "первый черновик"      // необязателен, ≤ 300, попадает в первую ревизию
}
```

- `summary` пустой / из пробелов / отсутствует → **400** (Bean Validation, стандартное тело Quarkus с `violations[]`).
- Ответ **201** — `WikiPageResponse` (см. §2.3).

### 2.2 Правка — `PUT /api/wiki/{pageId}`

Заголовок `X-Expected-Version` **обязателен** (без него **428**, с устаревшим значением **409** `{message}`).

Тело `WikiPageUpdateRequest` — `null` в поле = «не трогать»:

```jsonc
{
  "title": null,                    // null = прежнее; иначе 1..200
  "summary": "Уточнённое описание.", // null = прежнее; строка 1..500; ПУСТОЙ СТРОКОЙ ОЧИСТИТЬ НЕЛЬЗЯ (400)
  "content": null,                  // null = прежнее
  "comment": "уточнил описание"     // ≤ 300
}
```

- `summary: ""` → **400** (`@Size(min=1)`).
- `summary` длиннее 500 → **400**.
- Поле `summary` не прислано или `null` → описание не меняется, **200**.
- Ответ **200** — `WikiPageResponse` с `version + 1`.

> **Клиенту:** если поле «Описание» в форме правки не редактировали (или очистили) — **не отправляйте ключ `summary` вовсе** (или `null`). Отправляйте строку, только когда пользователь что-то в ней написал.

### 2.3 `WikiPageResponse` — ответ create / get / update

```jsonc
{
  "id": 15,
  "projectId": 7,
  "parentId": 12,
  "title": "Обмен манифестами",
  "summary": "Как узлы синхронизируют состояние через манифест...",  // NEW; null у страниц до этой правки
  "content": "# Обмен манифестами\n\n...",
  "position": 0,
  "createdBy": 2,
  "updatedBy": 3,
  "createdAt": 1757000000000,   // epoch-ms
  "updatedAt": 1757500000000,
  "version": 4
}
```

`GET /api/wiki/{pageId}` **не** подставляет автопревью — если описание не задано, `summary` здесь буквально `null`. Автопревью есть только в дереве (§2.4).

### 2.4 `WikiTreeNodeResponse` — узел дерева (`GET /api/projects/{projectId}/wiki`)

Плоский список, иерархию (2 уровня) собирает клиент по `parentId` + `position`.

```jsonc
[
  {
    "id": 12, "parentId": null, "title": "Архитектура", "position": 0,
    "summary": "Обзор компонентов бэкенда и как они взаимодействуют.",
    "summaryInferred": false          // false = это своё описание страницы
  },
  {
    "id": 15, "parentId": 12, "title": "Обмен манифестами", "position": 0,
    "summary": "Как узлы синхронизируют состояние через манифест...",
    "summaryInferred": false
  },
  {
    "id": 20, "parentId": null, "title": "Онбординг", "position": 1,
    "summary": "1. Клонировать репозиторий 2. Настроить окружение 3. mvn quarkus:dev…",
    "summaryInferred": true            // true = это ОБРЕЗКА начала content, а не описание
  },
  {
    "id": 21, "parentId": null, "title": "Черновик", "position": 2,
    "summary": null,                   // редкий случай: содержимое — только разметка/пробелы
    "summaryInferred": true
  }
]
```

Правила формирования `summary` в узле:
- есть своё описание → оно (полностью, до 500 символов), `summaryInferred: false`;
- нет → превью из первых ~400 символов `content`: markdown-символы (`# > * _ \` [ ] | ~`) заменены на пробел, переводы строк схлопнуты, обрезано до 200 символов + `…`, `summaryInferred: true`;
- превью пустое (контент — одна разметка) → `summary: null`.

---

## 3. Все эндпоинты вики (сводка)

| Метод | Путь | Тело / параметры | Ответ | Изменилось |
|---|---|---|---|---|
| `GET` | `/api/projects/{projectId}/wiki` | — | `WikiTreeNodeResponse[]` | **+`summary`, +`summaryInferred`** |
| `POST` | `/api/projects/{projectId}/wiki` | `WikiPageRequest` | `201` `WikiPageResponse` | **`summary` обязателен** |
| `GET` | `/api/wiki/{pageId}` | — | `WikiPageResponse` | **+`summary`** |
| `PUT` | `/api/wiki/{pageId}` | `WikiPageUpdateRequest`, `X-Expected-Version` | `200` `WikiPageResponse` | **+`summary` (опц.)** |
| `DELETE` | `/api/wiki/{pageId}?cascade=true` | — | `204` / `409 {message, children}` | — |
| `GET` | `/api/wiki/{pageId}/revisions` | — | `WikiRevisionResponse[]` | — (описание не версионируется) |
| `GET` | `/api/wiki/revisions/{revisionId}` | — | `WikiRevisionDetailResponse` | — |
| `POST` | `/api/wiki/find` | `WikiFindRequest` | `WikiFindResponse` | **`contentSearch` матчит и `summary`** |
| `GET` | `/api/wiki/{pageId}/backlinks` | — | `WikiBacklinkResponse[]` | — |
| `GET` | `/api/tasks/{taskId}/wiki` | — | `WikiBacklinkResponse[]` | — |

Всё под `@RolesAllowed("USER")`, доступ — участник проекта (иначе `403`), нет проекта/страницы → `404`.

### `POST /api/wiki/find`

```jsonc
// WikiFindRequest
{ "projectId": 7, "titleSearch": null, "contentSearch": "манифест", "limit": 50, "offset": 0 }
```

- `projectId` обязателен (иначе `400`).
- `titleSearch` → `LIKE` по `title`.
- `contentSearch` → `LIKE` по `content` **ИЛИ** `summary` (регистронезависимо, кириллица без настройки).
- оба заданы → И.

```jsonc
// WikiFindResponse — страницы ЦЕЛИКОМ (с content и summary)
{
  "pages": [ { /* WikiPageResponse */ } ],
  "total": 1,      // сколько подходит всего, помимо страницы выдачи
  "limit": 50,
  "offset": 0
}
```

---

## 4. Клиент: форма создания страницы

Новое обязательное поле **«Краткое описание»** — сразу под «Заголовком», перед редактором содержимого.

```vue
<UFormField label="Краткое описание" required
            help="Одно предложение: о чём эта страница. Видно в дереве навигации и помогает ИИ-агенту найти нужную страницу.">
  <UTextarea v-model="form.summary" :rows="2" :maxrows="3"
             placeholder="Как узлы синхронизируют состояние через манифест: формат, порядок, ошибки."
             :maxlength="500" />
  <template #hint>{{ form.summary.length }}/500</template>
</UFormField>
```

Валидация перед отправкой: `summary.trim().length >= 1 && <= 500`. Сервер отвергнет пустое `400`, но лучше не давать нажать «Создать».

---

## 5. Клиент: форма правки страницы

- Поле «Краткое описание» предзаполнено из `page.summary`.
- **У страниц, созданных до этой правки, `page.summary === null`** — поле пустое.
  - Правку можно сохранить и без описания (сервер не требует его на `PUT`).
  - Рекомендуется: при открытии такой страницы показать мягкую подсказку «У страницы нет краткого описания — добавьте, чтобы её было легче найти», не блокируя сохранение.
- Пустую строку отправлять **нельзя** (`400`). Логика отправки:

```ts
const body: WikiPageUpdateRequest = {
  title:   dirtyTitle   ? form.title   : null,
  summary: form.summary.trim() ? form.summary.trim() : null,  // пусто → null (= не трогать)
  content: dirtyContent ? form.content : null,
  comment: form.comment || null,
}
await http(`/api/wiki/${pageId}`, {
  method: 'PUT',
  headers: { 'X-Expected-Version': String(page.version) },
  body: JSON.stringify(body),
})
```

`409` (устаревшая версия) и `428` (нет заголовка) — как и раньше для вики.

---

## 6. Клиент: рендер дерева навигации

Под каждым заголовком — строка описания приглушённым цветом. Своё описание и автопревью выглядят по-разному: автопревью — это не авторитетный текст, а «пока ничего не написали».

```vue
<script setup lang="ts">
interface WikiTreeNode {
  id: number; parentId: number | null; title: string; position: number
  summary: string | null; summaryInferred: boolean
}
const props = defineProps<{ node: WikiTreeNode }>()
</script>

<template>
  <RouterLink :to="`/projects/${projectId}/wiki/${node.id}`" class="block py-1.5">
    <div class="text-sm font-medium truncate">{{ node.title }}</div>

    <div v-if="node.summary"
         class="text-xs truncate"
         :class="node.summaryInferred ? 'text-dimmed italic' : 'text-muted'"
         :title="node.summaryInferred ? 'Автопревью — своё описание у страницы не задано' : node.summary">
      {{ node.summary }}
    </div>
    <div v-else class="text-xs text-dimmed italic">Без описания</div>
  </RouterLink>
</template>
```

- `summaryInferred === false` → обычный muted-текст, полный `title` в подсказке.
- `summaryInferred === true` → dimmed + italic + подсказка «Автопревью…». Можно добавить иконку `i-lucide-sparkles`-off или просто `?`.
- `summary === null` → «Без описания».

Строить дерево: сгруппировать по `parentId` (корни — `parentId === null`), внутри сортировать по `position`. Глубина всегда ≤ 2.

---

## 7. Поиск: описание тоже индексируется

`POST /api/wiki/find` с `contentSearch` теперь находит страницу, если искомое слово есть **в описании**, даже когда его нет в заголовке и тексте. Для клиента ничего менять не нужно — просто поиск стал точнее. Строка результата может показывать `page.summary` как сниппет (он всегда есть в `WikiPageResponse`, кроме старых страниц).

---

## 8. ИИ-агент и вики

### 8.1 Что появилось у агента

Агент получает свой набор инструментов из `GET /api/agent/openapi.json` (с агентским токеном). Раньше вики там не было вовсе. Теперь добавлены **три операции только на чтение**:

| Операция | Зачем агенту |
|---|---|
| `GET /api/projects/{projectId}/wiki` | дерево с краткими описаниями — сориентироваться, какие страницы вообще есть |
| `GET /api/wiki/{pageId}` | прочитать нужную страницу целиком |
| `POST /api/wiki/find` | найти страницу по слову (заголовок / текст / описание) |

**Правка вики агенту не выдаётся** — в его спеке нет `POST`/`PUT` для страниц. Создание и редактирование вики — только человеком.

### 8.2 Агентский токен

Человек один раз выпускает токен: `POST /api/auth/agent-token` (со своим обычным токеном) →

```json
{ "token": "eyJ0eXAiOiJKV1Q...", "username": "dev_anna", "roles": ["USER", "AGENT"] }
```

Токен на самого человека (`sub` — его `userId`), 48 часов, группы `USER`+`AGENT`. Доступ к проектам и вики — ровно как у человека.

### 8.3 Сценарий 1: «сориентируйся и прочитай нужное»

Человек: **«Обнови задачу 5 и сверься с документацией по обмену манифестами».**

**Шаг 1** — агент читает дерево вики проекта задачи, сканирует `summary`:

```http
GET /api/projects/7/wiki
Authorization: Bearer eyJ0eXAiOiJKV1Q...
```

```json
[
  { "id": 12, "parentId": null, "title": "Архитектура", "position": 0,
    "summary": "Обзор компонентов бэкенда и как они взаимодействуют.", "summaryInferred": false },
  { "id": 15, "parentId": 12, "title": "Обмен манифестами", "position": 0,
    "summary": "Как узлы синхронизируют состояние через манифест: формат, порядок сообщений, обработка ошибок.",
    "summaryInferred": false },
  { "id": 18, "parentId": 12, "title": "Формат манифеста", "position": 1,
    "summary": "JSON-схема манифеста: поля version, entries, checksum.", "summaryInferred": false },
  { "id": 20, "parentId": null, "title": "Онбординг", "position": 1,
    "summary": "1. Клонировать 2. Настроить окружение 3. mvn quarkus:dev…", "summaryInferred": true }
]
```

Из описаний агент выбирает страницу `15`.

**Шаг 2** — читает её целиком:

```http
GET /api/wiki/15
Authorization: Bearer eyJ0eXAiOiJKV1Q...
```

```json
{
  "id": 15, "projectId": 7, "parentId": 12,
  "title": "Обмен манифестами",
  "summary": "Как узлы синхронизируют состояние через манифест: формат, порядок сообщений, обработка ошибок.",
  "content": "# Обмен манифестами\n\nМанифест — это JSON с полями `version`, `entries`.\n\n## Порядок\n1. Узел A публикует манифест...\n\n## Ошибки\n- расхождение версии → 409...",
  "position": 0, "createdBy": 2, "updatedBy": 3,
  "createdAt": 1757000000000, "updatedAt": 1757500000000, "version": 4
}
```

Дальше агент применяет прочитанное к задаче 5 (через уже доступные ему `GET/PATCH /api/projects/{projectId}/tasks/{taskId}`, `PUT /api/tasks/{taskId}/summary` и т. п.).

### 8.4 Сценарий 2: поиск по ключевому слову

Человек: **«Что у нас написано про гринфилд-развёртывание?»**

```http
POST /api/wiki/find
Authorization: Bearer eyJ0eXAiOiJKV1Q...
Content-Type: application/json

{ "projectId": 7, "contentSearch": "гринфилд" }
```

```json
{
  "pages": [
    {
      "id": 31, "projectId": 7, "parentId": null,
      "title": "Регламент релизов",
      "summary": "Что делать при выкатке гринфилд-модуля: миграции, флаги, откат.",
      "content": "# Регламент релизов\n\n## Обычный релиз\n...\n\n## Гринфилд-модуль\n...",
      "position": 3, "createdBy": 1, "updatedBy": 1,
      "createdAt": 1756000000000, "updatedAt": 1756100000000, "version": 2
    }
  ],
  "total": 1, "limit": 50, "offset": 0
}
```

Здесь слово «гринфилд» было **только в описании** — до этой правки `find` бы не нашёл страницу. Ответ — сразу с `content`, второй запрос не нужен.

### 8.5 Чего агент по-прежнему не делает

- **не создаёт и не правит страницы вики** — этих операций нет в его наборе инструментов;
- **не видит `GET /api/tasks/{taskId}/wiki`** («страницы, упоминающие задачу») — в агентскую спеку не входит; агент ищет через дерево или `find`;
- не удаляет ничего в вики.

---

## 9. Коды ответов (вики, с учётом нового)

| Код | Когда |
|---|---|
| `400` | `summary` пустой/отсутствует при создании; `summary: ""` или > 500 при правке; кривой `parentId` (родитель не верхнего уровня / из другого проекта); `find` без `projectId` |
| `403` | не участник проекта |
| `404` | нет проекта / страницы / ревизии |
| `409` | дубль заголовка в проекте; правка с устаревшей версией; удаление страницы с детьми без `?cascade=true` (тело `{message, children}`) |
| `428` | `PUT /api/wiki/{pageId}` без заголовка `X-Expected-Version` |

---

## 10. Порядок работ на клиенте

1. **Типы.** Добавить `summary: string` в модель создания/правки, `summary: string | null` + `summaryInferred: boolean` в узел дерева, `summary: string | null` в `WikiPageResponse`.
2. **Форма создания.** Обязательное поле «Краткое описание» со счётчиком и валидацией.
3. **Форма правки.** Предзаполнение из `page.summary`; для старых страниц (`null`) — мягкая подсказка добавить; пустую строку не отправлять.
4. **Дерево.** Строка описания под заголовком; `summaryInferred` — визуально слабее + подсказка «Автопревью».
5. **Поиск.** Ничего менять не нужно; опционально — показывать `summary` как сниппет результата.
6. **UI агента** (если есть индикация действий агента): «Агент прочитал N страниц вики» — по тем же `GET /api/wiki/*`, что и остальные его действия, через ленту активности не проходит (чтение не логируется).
