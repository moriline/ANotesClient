# Отчёты по затраченному времени

Отчёты есть на трёх уровнях: **по пользователю**, **по проекту** и **по задаче**.

---

## 1. Отчёт по пользователю — `GET /api/reports/time`

### Параметры

| параметр | по умолчанию |
|---|---|
| `userId` | сам вызывающий |
| `year` | текущий год (UTC) |
| `month` (1–12) | не задан → весь год |

Окно считается по `startTime` записи (**когда работа выполнялась**, а не когда её внесли), в UTC.

### Что в ответе (`TimeReportResponse`)

```json
{
  "userId": 2, "username": "dev_anna",
  "year": 2025, "month": 6,
  "from": 1748736000000, "to": 1751328000000,
  "totalSeconds": 12600, "totalHours": 3.5, "entryCount": 4,
  "byProject": [
    { "projectId": 1, "projectName": "Web Site Redesign",
      "totalSeconds": 9000, "totalHours": 2.5, "entryCount": 3 },
    { "projectId": 2, "projectName": "Mobile App API",
      "totalSeconds": 3600, "totalHours": 1.0, "entryCount": 1 }
  ]
}
```

- `byProject` — разбивка по проектам, по убыванию времени.
- Считается одним native SQL: `timeEntries → tasks → projects`, `GROUP BY projectId`.
- Часы округляются до 2 знаков.

### Кто чей отчёт видит (`TimeReportResource.resolveScope`)

| Кто смотрит | Что видит |
|---|---|
| **свой отчёт** (`userId` = сам или не задан) | **всё**, целиком — по всем проектам, включая те, которыми только владеет и где не числится участником |
| **глобальный админ** (`users.isAdmin`, группа `ADMIN` в токене) | отчёт по **любому** пользователю, целиком |
| **все остальные** | отчёт по пользователю — **только если есть хотя бы один общий проект**; и в разбивку попадает **только время на этих общих проектах** |
| нет ни одного общего проекта | **403** |

«Общий проект» = пересечение «доступных проектов» (`ProjectAccessService.accessibleProjectIds` = свои + где участник) вызывающего и цели.

### Коды ответа

| | |
|---|---|
| не залогинен | 401 (`@RolesAllowed("USER")`) |
| нет общего проекта с целью | 403 |
| `userId` не существует | 404 |
| `month` не 1–12 | 400 |
| `year` вне 1970–9999 | 400 |

### Примеры

- Ты и Аня оба в «Web Site Redesign». Аня ещё лила время в «Mobile App API» (тебе недоступен). Твой запрос `?userId=<Аня>` → видишь только её часы по «Web Site Redesign»; «Mobile App API» в `byProject` нет, `totalSeconds` — только общий проект.
- Тот же запрос от `admin` → видит обе строки.
- Посторонний без общих проектов с Аней → `403`.
- `?userId=<Аня>` без `year`/`month` → её время за текущий год по всем общим проектам.

---

## 2. Отчёт по проекту — `GET /api/reports/time/project/{projectId}`

Сводка по времени всей команды на один проект: кто сколько списал за период.

### Параметры

| параметр | по умолчанию |
|---|---|
| `year` | текущий год (UTC) |
| `month` (1–12) | не задан → весь год |

Окно — по `startTime` записи, UTC (как и в отчёте по пользователю).

### Что в ответе (`ProjectTimeReportResponse`)

```json
{
  "projectId": 1, "projectName": "Web Site Redesign",
  "year": 2025, "month": 6,
  "from": 1748736000000, "to": 1751328000000,
  "totalSeconds": 7200, "totalHours": 2.0, "entryCount": 4,
  "byUser": [
    { "userId": 1, "username": "admin", "displayName": "Alex Admin",
      "totalSeconds": 3600, "totalHours": 1.0, "entryCount": 1 },
    { "userId": 2, "username": "dev_anna", "displayName": "Anna Developer",
      "totalSeconds": 2400, "totalHours": 0.67, "entryCount": 2 },
    { "userId": 4, "username": "tester_olga", "displayName": "Olga Tester",
      "totalSeconds": 1200, "totalHours": 0.33, "entryCount": 1 }
  ]
}
```

- `byUser` — разбивка по пользователям, по убыванию времени. Только те, кто списывал время на задачи этого проекта в окне.
- Считается одним native SQL: `timeEntries → tasks → users`, `WHERE t.projectId = ?`, `GROUP BY userId`.
- Время на других проектах в отчёт не попадает.

### Кто видит

| | |
|---|---|
| **любой участник проекта** (владелец или member, **включая Guest/Client**) | отчёт целиком — как и суммарное время по задаче |
| **глобальный админ** (`ADMIN` в токене) | отчёт по любому проекту, даже не будучи участником |
| не участник и не админ | **403** |
| проекта нет | **404** |
| не залогинен | **401** |
| `month` не 1–12 / `year` вне 1970–9999 | **400** |

---

## 3. Отчёты по задаче — `/api/tasks/{taskId}/time…`

| эндпоинт | что | кто |
|---|---|---|
| `GET /api/tasks/{taskId}/time` | одно число — сумма секунд по задаче (всех авторов) | любой участник проекта (владелец или member) |
| `GET /api/tasks/{taskId}/time/entries` | список отдельных списаний: `{id, taskId, userId, seconds, description, startTime, createdAt}`, по возрастанию `startTime` | любой участник проекта |
| `POST /api/tasks/{taskId}/time` | списать время от своего имени (`{seconds, description?, startTime?}`) | право `task:update` — Admin/Manager/Developer; **не Guest, не Client** |
| `DELETE /api/tasks/{taskId}/time/entries/{entryId}` | удалить одно списание | автор записи **или** право `task:update` |

Не участник проекта → 404/403 на всех четырёх.
