# ANotes Wiki — спецификация модуля базы знаний

> **СТАТУС: бэкенд реализован** (заходы 1–3 и 5, см. §10). Клиент (заход 4) — вне
> этого репозитория. Отклонения от спецификации при реализации:
> - схема — в общий `src/main/resources/schema-h2-v4.sql` (раздел 11), **не**
>   отдельной Flyway-миграцией: Flyway в проекте нет, `database.generation=none`;
> - ссылка на задачу — `#123` по числовому id, **не** `TSK-123`: у задач нет
>   буквенного ключа (перешли на `INTEGER`);
> - `H2WikiRepository` — конкретный класс `@ApplicationScoped` без SPI (как
>   `H2TimeEntryRepository`), а не `domain.spi.WikiRepository`;
> - перемещение страницы по дереву через `PUT` не поддерживается (структура
>   задаётся при создании);
> - права — через существующие `Action.TASK_UPDATE` / `TASK_DELETE`, отдельные
>   `wiki:*` не заводились.
>
> Точное описание того, что вышло, — `summary.md` §17. Ниже — исходная
> спецификация как есть.

Документ собирает всё, что обсуждалось по вики-функциональности, и адаптирует под фактический стек ANotes: Quarkus 3.14.4, Java 21, H2, Panache, REST-ресурсы в `api.rest`, SPI в `domain.spi`.

Версия: 1.0 · Ориентировочный объём: несколько вечеров на бэкенд + столько же на клиент

---

## 1. Назначение и границы

Вики в ANotes — **не самостоятельный продукт и не замена Confluence**. Это слой знаний, связанный с задачами общей базой, общими правами и общим поиском. Всё, что уводит от этой связи, из объёма исключается.

Ключевое обоснование: тягаться с Confluence по функциям бессмысленно и не нужно. Единственное, что даёт встроенная вики и чего не даёт связка Jira + Confluence, — автоматическая связность с задачами без интеграций. Ради неё модуль и пишется. Каждая функция, добавленная «чтобы было как в Confluence», отнимает простоту и не приближает к паритету.

**Входит в объём:** страницы в Markdown, дерево на два уровня, история ревизий, автоссылки на задачи, обратные ссылки, поиск, права от проекта.

**Не входит:** совместное редактирование в реальном времени, шаблоны, макросы, права на отдельную страницу, блочный редактор, экспорт в PDF, доски, вложенные базы данных.

---

## 2. Модель данных

### 2.1 Миграция

Файл `src/main/resources/db/migration/V{N}__wiki.sql`. Отдельная миграция, не правка `schema-h2-v4.sql`.

```sql
CREATE TABLE wiki_page (
    id          INTEGER AUTO_INCREMENT PRIMARY KEY,
    project_id  INTEGER      NOT NULL,
    parent_id   INTEGER      NULL,
    title       VARCHAR(200) NOT NULL,
    content     CLOB         NOT NULL,
    position    INTEGER      NOT NULL DEFAULT 0,
    created_by  INTEGER      NOT NULL,
    updated_by  INTEGER      NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL,
    version     INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT fk_wiki_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_wiki_parent  FOREIGN KEY (parent_id)  REFERENCES wiki_page(id) ON DELETE CASCADE,
    CONSTRAINT uq_wiki_title   UNIQUE (project_id, title)
);

CREATE INDEX idx_wiki_project ON wiki_page (project_id);
CREATE INDEX idx_wiki_parent  ON wiki_page (parent_id);

CREATE TABLE wiki_revision (
    id         INTEGER AUTO_INCREMENT PRIMARY KEY,
    page_id    INTEGER      NOT NULL,
    title      VARCHAR(200) NOT NULL,
    content    CLOB         NOT NULL,
    author_id  INTEGER      NOT NULL,
    comment    VARCHAR(300) NULL,
    created_at TIMESTAMP    NOT NULL,
    CONSTRAINT fk_rev_page FOREIGN KEY (page_id) REFERENCES wiki_page(id) ON DELETE CASCADE
);

CREATE INDEX idx_rev_page ON wiki_revision (page_id, created_at DESC);

CREATE TABLE wiki_link (
    id           INTEGER AUTO_INCREMENT PRIMARY KEY,
    from_page_id INTEGER NOT NULL,
    to_page_id   INTEGER NULL,
    to_task_id   INTEGER NULL,
    CONSTRAINT fk_link_from FOREIGN KEY (from_page_id) REFERENCES wiki_page(id) ON DELETE CASCADE,
    CONSTRAINT chk_link_target CHECK (
        (to_page_id IS NOT NULL AND to_task_id IS NULL) OR
        (to_page_id IS NULL AND to_task_id IS NOT NULL)
    )
);

CREATE INDEX idx_link_to_page ON wiki_link (to_page_id);
CREATE INDEX idx_link_to_task ON wiki_link (to_task_id);
```

`INTEGER` вместо `BIGINT` — для совместимости с уже проведённой миграцией UUID → Integer по всему проекту.

### 2.2 Три решения, принятых сознательно

**Полные снимки в ревизиях, а не разницы.** Соблазн экономить очевиден, но diff-хранилище — это цепочка, где повреждение одного звена ломает всю историю, а восстановление страницы требует проигрывания всех правок подряд. Страница вики весит килобайты. Сто ревизий одной страницы весят меньше одного скриншота из вашей же таблицы `files`. Разницу считайте на клиенте библиотекой `jsdiff` при показе истории.

**Уникальный заголовок в пределах проекта вместо slug.** Тогда ссылки `[[Архитектура обмена]]` резолвятся напрямую по названию. Не нужна транслитерация кириллицы, не нужна миграция ссылок при переименовании, не нужно поле, которое рассинхронизируется с заголовком. URL остаётся `/projects/{pid}/wiki/{pageId}`.

**`version` с первого дня.** У задач его добавили постфактум, отдельной сессией. Здесь он критичнее: вики по природе редактируется несколькими людьми, и молчаливая перезапись чужого текста — не досадная мелочь, а потерянная работа. Механика та же, что у задач: заголовок `X-Expected-Version`, несовпадение — `409`.

**Важное отличие от задач:** у задач проверка версии опциональна ради обратной совместимости (нет заголовка — last-write-wins). Для вики так делать не надо. Внешних потребителей API нет, клиент один и пишется сейчас. Отсутствие заголовка на `PUT` — **428 Precondition Required**. Опциональная защита от конфликтов — это защита, которую забудут включить именно там, где она понадобится.

---

## 3. Доменный слой

По правилам архитектуры проекта: неизменяемые записи в `domain.model`, чистые интерфейсы в `domain.spi`, без импортов фреймворка.

```java
package com.taskmind.domain.model;

public record WikiPage(
    Integer id,
    Integer projectId,
    Integer parentId,
    String  title,
    String  content,
    int     position,
    Integer createdBy,
    Integer updatedBy,
    Instant createdAt,
    Instant updatedAt,
    int     version
) {}

public record WikiPageNode(          // для дерева, без content
    Integer id, Integer parentId, String title, int position
) {}

public record WikiRevision(
    Integer id, Integer pageId, String title, String content,
    Integer authorId, String comment, Instant createdAt
) {}

public record WikiBacklink(
    Integer pageId, String title, Integer taskId, String taskKey
) {}
```

```java
package com.taskmind.domain.spi;

public interface WikiRepository {
    List<WikiPageNode> findTree(Integer projectId);
    Optional<WikiPage> findById(Integer id);
    Optional<WikiPage> findByTitle(Integer projectId, String title);
    WikiPage save(WikiPage page);
    void delete(Integer id);

    List<WikiRevision> findRevisions(Integer pageId);
    Optional<WikiRevision> findRevision(Integer revisionId);
    void addRevision(WikiRevision revision);

    void replaceLinks(Integer fromPageId, List<Integer> toPages, List<Integer> toTasks);
    List<WikiBacklink> findBacklinksToPage(Integer pageId);
    List<WikiBacklink> findBacklinksToTask(Integer taskId);

    List<WikiPage> search(Integer projectId, String query, int limit, int offset);
}
```

Реализация — `infrastructure.db.H2WikiRepository`, `@ApplicationScoped`, Panache.

---

## 4. REST API

Восемь операций, в стиле существующих ресурсов проекта. Все под `bearerAuth`, ни одной публичной — не забыть добавить в `OpenApiSpecTest`.

```
GET    /api/projects/{projectId}/wiki          дерево страниц (без content)
POST   /api/projects/{projectId}/wiki          создать страницу
GET    /api/wiki/{id}                          страница + version
PUT    /api/wiki/{id}                          правка; X-Expected-Version обязателен
DELETE /api/wiki/{id}                          удалить (см. §4.3)
GET    /api/wiki/{id}/revisions                список ревизий без content
GET    /api/wiki/revisions/{revisionId}        один снимок целиком
POST   /api/wiki/find                          поиск, по образцу /api/find
```

Плюс две ручки обратных ссылок:

```
GET    /api/wiki/{id}/backlinks                кто ссылается на страницу
GET    /api/tasks/{taskId}/wiki                страницы, упоминающие задачу
```

### 4.1 DTO

```java
public record WikiPageResponse(
    Integer id, Integer projectId, Integer parentId,
    String title, String content, int position,
    Integer createdBy, Integer updatedBy,
    Instant createdAt, Instant updatedAt, int version
) {}

public record WikiTreeNodeResponse(
    Integer id, Integer parentId, String title, int position
) {}

public record WikiPageRequest(
    Integer parentId, String title, String content, String comment
) {}

public record WikiRevisionResponse(
    Integer id, Integer pageId, String title,
    Integer authorId, String authorName, String comment, Instant createdAt
) {}

public record WikiFindRequest(
    Integer projectId, String titleSearch, String contentSearch,
    Integer limit, Integer offset
) {}
```

### 4.2 Дерево отдаётся одним плоским списком

`GET /api/projects/{projectId}/wiki` возвращает **все узлы проекта разом, без `content`**. Панель навигации собирает иерархию на клиенте. Отдельный запрос на каждый узел убьёт отзывчивость уже на сотне страниц.

### 4.3 Удаление

Три варианта поведения, выбрать один и придерживаться:

| Ситуация | Ответ |
|---|---|
| Страница без детей | удалить, `204` |
| Есть дочерние страницы | `409` с числом детей; клиент показывает подтверждение и повторяет с `?cascade=true` |
| Есть входящие ссылки | удалить всё равно, ссылки становятся «красными» — так работает любая вики |

Каскадное удаление в БД уже настроено через `ON DELETE CASCADE`, но решение принимает сервис, а не схема: пользователь должен видеть, что удаляет пять страниц, а не одну.

### 4.4 Права

Отдельной модели прав у вики **нет**. Всё наследуется от проекта через существующий `PermissionService` и `POST /api/permissions/check`:

| Операция | Требуемое право |
|---|---|
| Чтение дерева и страниц | участник проекта |
| Создание, правка | `task:update` (или новое `wiki:update`, если хотите разделить) |
| Удаление | `task:delete` / `wiki:delete` |

Гранулярные права на отдельные страницы — путь к тому, что люди перестают понимать, кто что видит. Не делать.

---

## 5. Связь с задачами

Это то, ради чего модуль пишется, и обе функции дёшевы.

### 5.1 Автоссылки на задачи

В тексте встретилось `TSK-104` — при рендере превращается в ссылку с подтянутым заголовком и цветом статуса.

```java
private static final Pattern TASK_REF = Pattern.compile("\\b([A-Z]{2,10})-(\\d+)\\b");
private static final Pattern PAGE_REF = Pattern.compile("\\[\\[([^\\]]{1,200})\\]\\]");
```

Разбор происходит **при сохранении**, не при чтении: результат складывается в `wiki_link`, и рендер страницы не требует парсинга.

### 5.2 Обратные ссылки

При каждом `PUT`/`POST`:

1. распарсить `content`, собрать множества `toPages` (по заголовкам, через `findByTitle`) и `toTasks` (по ключу задачи);
2. `replaceLinks(pageId, toPages, toTasks)` — удалить старые записи, вставить новые, одной транзакцией.

Дальше:

- внизу страницы блок **«Упоминается в»** — `findBacklinksToPage`;
- на странице задачи вкладка **«Документация»** — `findBacklinksToTask`.

Оба — один `SELECT` с `JOIN`. Ощущается как главная функция продукта, стоит полдня работы.

### 5.3 Несуществующие ссылки

`[[Название]]`, для которого нет страницы, рендерится приглушённым красным с подсказкой «Создать страницу». Клик открывает создание с уже подставленным заголовком. Классическое вики-поведение, стимулирует наполнение.

---

## 6. Поиск

**Первая версия:** `LIKE '%...%'` по `title` и `content` с фильтром по проекту. На корпусе до нескольких сотен страниц этого достаточно, и оно работает с кириллицей без настройки.

**Вторая версия:** нативный полнотекстовый поиск H2 (`FT_CREATE_INDEX`). Быстрее, но словарь и стемминг для русского там слабые — проверьте на своих текстах, прежде чем закладываться.

**Смысловой поиск через эмбеддинги — отдельным шагом и не раньше пятидесяти страниц.** У вас уже есть `AiOrchestrator.embed()` и `KnowledgeRepository.findSimilar()`, так что технически это подключается быстро. Но на малом корпусе эмбеддинги дают размытые результаты там, где точное совпадение слова нашло бы нужное сразу. Плюс `NoOpEmbeddingModel` сейчас приоритизирован через `@Alternative + @Priority`, то есть AI по умолчанию выключен — переключение потребует правки кода, а не конфига.

---

## 7. Клиент

### 7.1 Маршруты

```ts
{ path: '/projects/:pid/wiki',       component: WikiIndexView },
{ path: '/wiki/:id',                 component: WikiPageView },
{ path: '/wiki/:id/edit',            component: WikiEditView },
{ path: '/wiki/:id/history',         component: WikiHistoryView },
```

Редактирование — **отдельный маршрут, не инлайн-правка**. Обоснование отличается от задач: там описание короткое и правится за секунды, здесь текст длинный, работа долгая, и терять её при случайном переходе нельзя. Черновик автосохраняется в `sessionStorage` каждые 30 секунд.

### 7.2 Разрешение конфликта с макетом

В спецификации «Sprout» правило жёсткое: **меню только сверху, боковой панели нет нигде**. Вики без дерева неудобна.

Разрешается так: панель дерева живёт **внутри страницы** `/projects/{pid}/wiki`, а не в каркасе приложения. Двухколоночный экран — `UTree` шириной 260px слева, содержимое справа. Глобальное правило не нарушено, на остальных экранах панели по-прежнему нет.

```
┌────────────────────────────────────────────────────┐
│ ◗ Sprout   Задачи  Проекты  Теги  Люди      (АИ)▾  │
├──────────────┬─────────────────────────────────────┤
│ 🔍 Поиск     │  Архитектура обмена                 │
│              │  Изменена 2 ч назад · Дмитрий К.    │
│ ▾ Архитект.  │                                     │
│   • Обмен    │  Markdown-содержимое…               │
│   • Формат   │                                     │
│ ▸ Процессы   │  ───────────────────────────────    │
│ ▸ Онбординг  │  Упоминается в: Формат манифеста,   │
│              │  TSK-104                            │
│ [+ Страница] │                                     │
└──────────────┴─────────────────────────────────────┘
   260px
```

### 7.3 Два уровня вложенности

Ограничение непопулярное, но обоснованное: глубокие иерархии в вики — известная ловушка. Через год никто не помнит, где что лежит, и все пользуются поиском. Два уровня плюс работающий поиск обслуживают людей лучше, чем шесть уровней без него.

Технически `parent_id` допускает любую глубину — ограничение проверяется в сервисе при создании. Если через год выяснится, что двух мало, снять его дешевле, чем ввести обратно.

### 7.4 Компоненты

| Экран | Компоненты Nuxt UI |
|---|---|
| Индекс | `UTree`, `UInput` поиска, `UEmpty` при пустом дереве |
| Просмотр | рендер Markdown (`marked` + `dompurify`), `UBadge` для ссылок на задачи, блок обратных ссылок |
| Правка | `UEditor` + `UEditorToolbar`, `content-type="markdown"`, `UInput` для комментария к правке |
| История | `UTimeline` ревизий, две радиокнопки для выбора сравниваемых версий, `jsdiff` для разницы |
| Конфликт | `UModal` «Страницу изменили», кнопки «Перезагрузить» и «Перезаписать» |

`UEditor` появился в Nuxt UI 4.3, построен на TipTap и умеет отдавать markdown. Это снимает обычное возражение против WYSIWYG: пользователь получает нормальный редактор, а в базе лежит текст.

---

## 8. Что не делать и почему

| Не делать | Причина |
|---|---|
| **Блочный редактор в стиле Notion** | у вас уже есть блоки в `/api/tasks/{id}/discussion` со своей моделью (`MESSAGE`/`DECISION`/`QUESTION`/`PROPOSAL`). Второй блочный формат в одном продукте — путаница и двойная поддержка |
| **Совместное редактирование в реальном времени** | Yjs, CRDT, вебсокеты — отдельный проект по объёму. `version` + сообщение «Страницу изменили» закрывает подавляющее большинство реальных конфликтов |
| **Права на отдельные страницы** | наследование от проекта проще и понятнее; гранулярность ведёт к тому, что никто не знает, кто что видит |
| **Шаблоны и макросы** | так Confluence и стал тем, чем стал |
| **Хранение HTML** | ломает поиск, экспорт и диффы; Markdown — текст, а не разметка |
| **Slug-поля** | транслитерация кириллицы, миграция ссылок при переименовании, рассинхрон с заголовком |
| **Diff-хранилище ревизий** | экономия байтов ценой хрупкости |

---

## 9. Сравнение с Confluence

Сравнение неравное по определению: Confluence — продукт с двадцатилетней историей, ваша вики — три таблицы и десять эндпоинтов. Смысл таблицы в том, чтобы понимать, что теряется и что приобретается.

### Содержание и редактирование

| Возможность | ANotes Wiki | Confluence |
|---|---|---|
| Формат хранения | Markdown, текст | проприетарный формат Atlassian |
| Экспорт в Markdown | тривиален, это исходник | нативной кнопки нет; API конвертирует только между внутренними представлениями |
| Редактор | `UEditor` (TipTap) | полноценный WYSIWYG |
| Совместное редактирование в реальном времени | нет, блокировка по `version` | да |
| История версий | полные снимки, восстановление, diff на клиенте | да |
| Шаблоны | нет (намеренно) | да, готовые наборы |
| Макросы | нет (намеренно) | сотни + Marketplace |
| Доски | нет | 3 на пользователя на Free, безлимит на Premium |
| Базы данных в страницах | нет | есть, включая Free |

### Структура и поиск

| Возможность | ANotes Wiki | Confluence |
|---|---|---|
| Вложенность | 2 уровня (сознательно) | неограниченная |
| Пространства | нет; проект = пространство | spaces |
| Полнотекстовый поиск | свой, по `content` | встроенный |
| Смысловой поиск | свой Ollama, локально, без лимитов | Rovo, метрируется кредитами (~10 за запрос чата, ~100 за Deep Research при 25–70 кредитах на пользователя в месяц) |

### Связь с задачами — единственная категория вашего преимущества

| Возможность | ANotes Wiki | Confluence |
|---|---|---|
| Ссылки на задачи | автолинковка `TSK-104` из той же БД | макрос Jira, кросс-продуктовая интеграция |
| Обратные ссылки задача → документация | вкладка «Документация» на странице задачи | прямого эквивалента нет |
| Права | наследуются от проекта, тот же `PermissionService` | своя модель, отдельная от Jira |
| Единый поиск по задачам и страницам | один запрос | два продукта, объединяет только Rovo |
| Стоимость связки | ноль | Confluence + Jira, две подписки |

### Эксплуатация

| | ANotes Wiki | Confluence |
|---|---|---|
| Цена | 0 | Free до 10 пользователей и 2 ГБ; Standard $5.42, Premium $10.44 за пользователя в месяц |
| Где данные | ваш сервер, ваша H2 | облако Atlassian |
| Закрытый контур, офлайн | да | Data Center отдельно и дорого |
| Гостевой доступ | нет | на платных, 5 гостей на платного |
| Автоматизация | нет | 10 запусков в месяц на Free, 100 на Standard |
| Экспорт PDF/Word | нет | да |
| Потолок объёма | ваш диск | 30 ГБ контента + 800 ГБ вложений; импорт в облако ограничен 200 МБ несжатого XML |
| Объём разработки | несколько вечеров | ноль |

### Что не переживает выход из Confluence

Базы данных появляются в дереве бэкапа, но их содержимое и функциональность не сохраняются — каждую надо выгружать отдельно. HTML-экспорт не включает комментарии к страницам и блоги; командные календари тоже исключены. Доски в экспорте есть, но без содержимого.

Чем активнее команда пользуется функциями, которые Confluence выигрывает по таблице, тем сильнее к нему привязывается. Markdown бесплатно даёт то, что у Confluence не покупается ни за какие деньги.

### Как читать сравнение

По числу строк Confluence выигрывает разгромно, и так и должно быть. Но большинство выигранных строк — функции, которыми небольшая команда не пользуется: макросы, доски, автоматизация, шаблоны, гостевой доступ.

Ваш вариант оправдан ровно при одном условии: **вики должна быть частью трекера, а не соседним продуктом.**

---

## 10. Порядок работ

**Заход 1 — ядро (2–3 вечера бэкенд).**
Миграция, `WikiRepository` + реализация, четыре CRUD-эндпоинта, `X-Expected-Version`, права через `PermissionService`.

**Заход 2 — история (1 вечер).**
`wiki_revision`, снимок при каждом `PUT`, два эндпоинта чтения.

**Заход 3 — связность (1 вечер).**
Парсер `[[...]]` и `TSK-\d+`, `wiki_link`, две ручки обратных ссылок. Самая ценная часть.

**Заход 4 — клиент (3–4 вечера).**
Четыре экрана, дерево, редактор, история с diff.

**Заход 5 — поиск.**
`POST /api/wiki/find` на `LIKE`. Эмбеддинги — потом и по необходимости.

---

## 11. Тесты

В стиле существующих (`ProjectStatusUpdateTest`, `TaskUpdateTest`):

| Класс | Что проверяет |
|---|---|
| `WikiPageResourceTest` | CRUD, `409` на дубль заголовка в проекте, `404` на чужую страницу |
| `WikiVersionTest` | `PUT` без `X-Expected-Version` → `428`; с устаревшей версией → `409`; успешная правка → `version + 1` |
| `WikiTreeTest` | плоский список, ограничение в два уровня → `400` на третий, каскад при удалении родителя |
| `WikiRevisionTest` | снимок создаётся на каждый `PUT`, содержимое совпадает, порядок по дате |
| `WikiLinkTest` | разбор `[[Заголовок]]` и `TSK-104`, обратные ссылки, перезапись связей при повторном сохранении |
| `WikiPermissionTest` | не участник проекта → `403`, чтение доступно любому участнику |

И обязательно — добавить новые операции в `OpenApiSpecTest`, все под `bearerAuth`, ни одной в `PUBLIC_OPERATIONS`.
