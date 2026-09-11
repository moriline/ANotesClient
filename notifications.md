# ANotes — уведомления без почты

Документ описывает, как реализовать уведомления в менеджере задач, не поднимая почтовый сервер. Адаптировано под стек проекта: Quarkus 3.14.4, Java 21, H2, Panache, клиент на Vue 3 + Nuxt UI.

> **Статус.** §1 «Колокольчик» + серверная часть §2 (`GET /api/notifications/count`)
> реализованы: таблицы `notifications` / `notificationSettings`, `NotificationService`,
> шесть ручек `/api/notifications`, правила §6 (не о своих действиях / схлопывание /
> настройки по типу), типы `MENTION | ASSIGNED | COMMENT | STATUS_CHANGED`.
> Не сделано: Web Push (§3), Telegram (§4), SSE (§2), `DUE_SOON` по расписанию (§7 —
> нужен часовой пояс в `User`), клиентский опрос (фронтенда в репозитории нет).

---

## Основной тезис

**Почта — не первый выбор, а последний.**

Она нужна ровно для одного: достать человека, который **не открыт в вашем приложении**. Всё остальное решается внутри, дешевле и лучше — без SMTP, без настройки SPF/DKIM/DMARC, без разбирательств со спам-фильтрами и без внешних сервисов доставки.

Ниже — механизмы доставки от простого к сложному.

---

## 1. Колокольчик в шапке — с этого начинать

Одна таблица, четыре эндпоинта, ноль инфраструктуры.

### Схема

```sql
-- V{N}__notifications.sql
CREATE TABLE notification (
    id         INTEGER AUTO_INCREMENT PRIMARY KEY,
    user_id    INTEGER      NOT NULL,
    type       VARCHAR(30)  NOT NULL,   -- MENTION, ASSIGNED, STATUS_CHANGED, DUE_SOON, COMMENT
    task_id    INTEGER      NULL,
    comment_id INTEGER      NULL,
    actor_id   INTEGER      NULL,       -- кто вызвал событие; NULL для системных
    payload    VARCHAR(500) NULL,       -- готовый текст, чтобы не собирать при чтении
    read_at    TIMESTAMP    NULL,
    created_at TIMESTAMP    NOT NULL,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notif_unread ON notification (user_id, read_at, created_at DESC);
```

### Эндпоинты

```
GET  /api/notifications?unread=true&limit=20    список
GET  /api/notifications/count                    → { "unread": 3 }
PUT  /api/notifications/{id}/read                отметить прочитанным
PUT  /api/notifications/read-all                 отметить все
```

### Почему `payload` с готовым текстом

Если собирать строку «Анна упомянула вас в TSK-104» при каждом чтении, понадобится три `JOIN` на каждое уведомление: пользователь, задача, комментарий. Собирайте текст **при создании**: уведомление описывает событие прошлого, и меняться оно не должно.

Побочный плюс: если задачу переименуют или удалят, уведомление останется читаемым.

### Клиент

В шапке — `UChip` с числом на иконке колокольчика, по клику `UPopover` со списком.

```vue
<UPopover>
  <UChip :text="unread" :show="unread > 0" size="lg">
    <UButton icon="i-lucide-bell" variant="ghost" />
  </UChip>

  <template #content>
    <div class="w-80 p-2">
      <div class="flex items-center justify-between px-2 py-1">
        <span class="text-sm font-medium">Уведомления</span>
        <UButton variant="link" size="xs" @click="readAll">Прочитать все</UButton>
      </div>
      <UEmpty v-if="!items.length" title="Пока пусто" />
      <NotificationItem v-for="n in items" :key="n.id" :notification="n" />
    </div>
  </template>
</UPopover>
```

Этого достаточно, если человек держит вкладку открытой. А он держит — это рабочий инструмент.

---

## 2. Как обновлять счётчик

Три варианта. Рекомендуется первый.

### Опрос (polling) — выбор по умолчанию

`GET /api/notifications/count` — один индексированный запрос, отдаёт число.

```ts
const unread = ref(0)

async function refresh() {
  unread.value = (await http<{ unread: number }>('/notifications/count')).unread
}

useIntervalFn(refresh, 45_000, { immediate: true })
useEventListener(document, 'visibilitychange', () => {
  if (!document.hidden) refresh()      // вернулись во вкладку — обновить сразу
})
```

При десяти пользователях это примерно 20 запросов в минуту, то есть ничто. Некрасиво в теории, идеально на практике для вашего масштаба.

Сброс при возврате фокуса важен: без него после переключения окна счётчик обновится только через 45 секунд, и это заметно раздражает.

### SSE — если нужна мгновенность

У вас Quarkus, там это несколько строк:

```java
@GET
@Path("/stream")
@Authenticated
@Produces(MediaType.SERVER_SENT_EVENTS)
public Multi<NotificationResponse> stream() {
    return bus.<NotificationResponse>consumer("notifications." + currentUserId())
              .bodyStream()
              .toMulti();
}
```

Односторонний поток поверх обычного HTTP, браузер переподключается сам через `EventSource`. Цена — одно висящее соединение на пользователя, что с виртуальными потоками Java 21 дёшево.

Разумный второй шаг, но не первый.

### WebSocket — не нужен

Двусторонний канал ради уведомлений избыточен, а сложности с переподключением, состоянием и аутентификацией он добавляет реальные.

---

## 3. Web Push — вот это заменяет почту

Самый интересный вариант, и его обычно упускают.

Браузер умеет показывать системные уведомления, **даже когда вкладка закрыта**, — через Service Worker и Push API. Работает в Chrome, Firefox, Edge; в Safari на macOS и iOS — для сайтов, установленных как приложение (PWA).

### Что нужно

| Компонент | Объём |
|---|---|
| Пара VAPID-ключей | генерируется один раз |
| Service Worker на клиенте | ~30 строк |
| Таблица подписок | одна |
| Отправка из Java | библиотека `web-push` |

```sql
CREATE TABLE push_subscription (
    id         INTEGER AUTO_INCREMENT PRIMARY KEY,
    user_id    INTEGER      NOT NULL,
    endpoint   VARCHAR(500) NOT NULL,
    p256dh     VARCHAR(200) NOT NULL,
    auth       VARCHAR(100) NOT NULL,
    user_agent VARCHAR(200) NULL,        -- чтобы человек понимал, что за устройство
    created_at TIMESTAMP    NOT NULL,
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_push_endpoint UNIQUE (endpoint)
);
```

```javascript
// public/sw.js
self.addEventListener('push', event => {
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      tag: data.tag,           // одинаковый tag схлопывает уведомления
      data: { url: data.url }
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

Работы — примерно день. Взамен человек получает уведомление на телефон и на рабочий стол **без мобильного приложения, без почтового сервера и без сторонних сервисов**.

### Когда просить разрешение

Не при первом визите. Запрос в лоб на пустом месте отклоняют почти все, а повторно спросить браузер уже не даст.

Просите в момент, когда ценность очевидна: человек впервые кого-то упомянул, или ему впервые назначили задачу. Лучше — кнопкой в профиле рядом с настройками уведомлений, чтобы решение принимал он сам.

### Отваливающиеся подписки

Push-сервис вернёт `404` или `410` на удалённую подписку — эту строку надо удалить из таблицы. Без очистки таблица за год забьётся мёртвыми записями, и каждая рассылка будет ходить в никуда.

---

## 4. Мессенджер как транспорт

Раз почта не нравится, а достучаться вне приложения надо — Telegram-бот.

Человек один раз привязывает `chat_id` через кнопку в профиле, дальше отправка — один HTTP-вызов:

```java
@RegisterRestClient(configKey = "telegram")
public interface TelegramClient {
    @POST @Path("/bot{token}/sendMessage")
    void sendMessage(@PathParam("token") String token, SendMessageRequest body);
}
```

Никакого SMTP, никаких настроек DNS, доставка мгновенная, и уведомление приходит туда, куда человек и так смотрит весь день.

То же со Slack или Mattermost, если команда сидит там: входящий вебхук, одна строка конфигурации.

Привязка делается просто: бот выдаёт человеку код, человек вводит код в профиле — или наоборот, профиль показывает ссылку `t.me/yourbot?start=<одноразовый-токен>`.

---

## 5. Порядок работ

| Шаг | Работы | Что закрывает |
|---|---|---|
| Колокольчик + опрос | вечер | человек в приложении — 90% случаев |
| Web Push | день | вкладка закрыта, телефон в кармане |
| Telegram | полдня | те, кто не даёт разрешение браузеру |
| SSE | полдня | мгновенность вместо 45 секунд |
| **Почта** | — | **не делать вовсе** |

Начните с первой строки. Она закрывает подавляющее большинство ситуаций, потому что упоминание в комментарии — обычно диалог в реальном времени: человек сидит в той же задаче и увидит колокольчик через полминуты.

---

## 6. Две вещи, которые важнее транспорта

### Настройки на уровне типа

В спецификации профиля уже заложены четыре переключателя: назначили задачу, упомянули в комментарии, приближается срок, еженедельная сводка.

Уведомление, которое нельзя выключить, через неделю начинают игнорировать целиком — **вместе с важными**. Настройки не роскошь, а условие того, что уведомления вообще будут читать.

```sql
CREATE TABLE notification_setting (
    user_id  INTEGER     NOT NULL,
    type     VARCHAR(30) NOT NULL,
    in_app   BOOLEAN     NOT NULL DEFAULT TRUE,
    push     BOOLEAN     NOT NULL DEFAULT FALSE,
    telegram BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, type)
);
```

Отсутствие строки = значения по умолчанию. Так не нужно создавать записи при регистрации.

### Схлопывание

Агент, обновляющий резюме после каждого комментария, за час нагенерирует двадцать уведомлений.

Правило: **не создавать новое уведомление того же типа по той же задаче, если предыдущее непрочитано.** Вместо этого обновить `created_at` и текст.

```java
@Transactional
public void push(Integer userId, NotificationType type, Integer taskId, String text) {
    var existing = repo.findUnread(userId, type, taskId);
    if (existing.isPresent()) {
        existing.get().createdAt = Instant.now();
        existing.get().payload   = text;        // «3 новых комментария»
        return;
    }
    repo.create(userId, type, taskId, text);
}
```

Разница в коде — десять строк, разница в ощущениях огромная.

### Не уведомлять о собственных действиях

Очевидное правило с неочевидным следствием: **действия вашего ИИ-агента сделаны под вашим токеном**, значит `actor_id` совпадёт с `user_id`, и вы получите уведомление о том, что сами же и попросили.

```java
if (Objects.equals(actorId, recipientId)) return;   // включая действия через агента
```

Проверка одна, но без неё после подключения агента поток уведомлений удвоится.

---

## 7. Типы уведомлений

| Тип | Когда | Кому |
|---|---|---|
| `MENTION` | `@username` в комментарии или описании | упомянутым, кроме автора |
| `ASSIGNED` | задачу назначили на человека | новому исполнителю |
| `COMMENT` | новый комментарий в задаче | исполнителю и автору задачи |
| `STATUS_CHANGED` | смена статуса | исполнителю и автору, кроме инициатора |
| `DUE_SOON` | срок наступает завтра | исполнителю |

`DUE_SOON` — единственный, который создаётся не по действию, а по расписанию:

```java
@Scheduled(cron = "0 0 9 * * ?")   // каждый день в 9 утра
void notifyDueSoon() { ... }
```

Учитывайте часовой пояс пользователя — поле `timezone` в `User` уже есть. Уведомление о дедлайне в три часа ночи по местному времени бесполезно.

---

## 8. Тесты

| Класс | Что проверяет |
|---|---|
| `NotificationCreateTest` | упоминание создаёт запись для упомянутого и не создаёт для автора |
| `NotificationCollapseTest` | два события одного типа по одной задаче дают одну непрочитанную запись с обновлённым текстом |
| `NotificationSelfTest` | действие под агентским токеном не уведомляет владельца токена |
| `NotificationSettingsTest` | выключенный тип не создаёт запись |
| `NotificationCountTest` | счётчик считает только непрочитанные и только свои |
| `DueSoonScheduleTest` | учитывается часовой пояс пользователя |
| `PushSubscriptionTest` | ответ `410` от push-сервиса удаляет подписку |

И не забыть добавить новые операции в `OpenApiSpecTest` — все под `bearerAuth`, ни одной в `PUBLIC_OPERATIONS`.
