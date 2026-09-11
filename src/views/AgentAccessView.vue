<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { requestAgentToken, fetchAgentOpenApi } from '@/api/auth'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'
import { jwtExpiresAt } from '@/utils/jwt'

// Раздел «варианта 1» из ai.md: всё, что нужно человеку, чтобы вручную
// подключить своего ИИ-агента к задачам — токен, адреса, промпт, примеры.
// MCP (вариант 2) сюда не входит — на бэкенде его пока нет.

const auth = useAuthStore()
const toast = useToast()

const apiBase = `${location.origin}/api`
const openApiUrl = `${location.origin}/api/agent/openapi.json`
const agentPageUrl = `${location.origin}/agent`

const tokenExpiresAt = computed(() => jwtExpiresAt(auth.agentToken))
const tokenExpired = computed(() => {
  const at = tokenExpiresAt.value
  return at != null && at <= Date.now()
})

// Правила агента — общие для промпта (Шаг 3) и для сводного блока внизу.
const agentRules = [
  '— Перед сменой статуса задачи узнай допустимые статусы: GET /api/project-statuses/project/{projectId}.',
  '— При изменении задачи (PATCH) передавай заголовок X-Expected-Version = version из только что прочитанной задачи.',
  '— id задачи глобальный; её projectId бери из ответа POST /api/find или GET задачи.',
  '— Нужна документация — посмотри дерево вики проекта (GET /api/projects/{projectId}/wiki), там у страниц есть краткие описания; затем открой нужную (GET /api/wiki/{pageId}) или найди по слову (POST /api/wiki/find). Править вики нельзя.',
  '— Ничего не удаляй и не меняй состав участников — это запрещено, придёт 403.',
  '— Делай только то, о чём попросил пользователь. О необратимом (закрыть задачу по своей инициативе, массовые правки) сначала спроси.'
]

const systemPrompt = computed(() =>
  [
    'Ты — ассистент в трекере задач ANotes, работаешь через его REST API.',
    `База: ${apiBase}`,
    'Авторизация: в каждый запрос добавляй заголовок "Authorization: Bearer <ТОКЕН_АГЕНТА>".',
    `Список доступных операций — OpenAPI по адресу ${openApiUrl} (тот же заголовок).`,
    '',
    'Правила:',
    ...agentRules
  ].join('\n')
)

const examplePrompts = [
  'Открой задачу #4, прочитай комментарии и обнови резюме.',
  'Переведи задачу #4 в статус «Готово».',
  'Найди мои незакрытые задачи и коротко суммируй, что осталось.',
  'Спиши 30 минут на задачу #4 с комментарием «код-ревью».',
  'Сверься с документацией по обмену манифестами и допиши в задачу #4, чего не хватает.'
]

// --- Сводный блок «всё одним куском» -----------------------------------
// Токен + адреса + правила вместе: одно копирование / один файл для агента.
const bundleRevealed = ref(false)

const bundle = computed(() => {
  const token = auth.agentToken ?? '<ВСТАВЬТЕ ТОКЕН>'
  const until = tokenExpiresAt.value ? formatDateTime(tokenExpiresAt.value) : '—'
  return [
    '# ANotes — доступ для ИИ-агента',
    '',
    'Ты — ассистент в трекере задач ANotes, работаешь через его REST API.',
    '',
    '## Доступ',
    `- База API: ${apiBase}`,
    `- Список операций (OpenAPI): ${openApiUrl}`,
    '- В каждый запрос добавляй заголовок:',
    `  Authorization: Bearer ${token}`,
    `- Токен действует до: ${until}. Позже попроси пользователя обновить его на ${agentPageUrl}`,
    '',
    '## Правила',
    ...agentRules,
    '',
    '## Что доступно',
    '- Находить и читать задачи, комментарии и обсуждение',
    '- Оставлять комментарии, писать и обновлять резюме задачи',
    '- Менять статус, исполнителя, сроки, оценку',
    '- Списывать время',
    '- Читать список проектов и их статусы',
    '- Читать базу знаний проекта (вики): дерево с описаниями, страницы, поиск — только чтение',
    '',
    '## Задача',
    '<ЗАМЕНИТЕ ЭТУ СТРОКУ НА ВАШ ЗАПРОС, например: открой задачу #4, прочитай комментарии и обнови резюме>'
  ].join('\n')
})

// В превью токен скрыт, пока не нажмут «показать»; в копии и файле — всегда полный.
const bundlePreview = computed(() => {
  const t = auth.agentToken
  if (!t || bundleRevealed.value) return bundle.value
  return bundle.value.replace(t, '•'.repeat(24))
})

function downloadBundle() {
  const url = URL.createObjectURL(new Blob([bundle.value], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'taskmind-agent.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// --- Токен ---------------------------------------------------------------
const creating = ref(false)
const revealed = ref(false)

async function createToken() {
  creating.value = true
  try {
    const res = await requestAgentToken()
    auth.setAgentToken(res.token)
    revealed.value = true
    toast.add({ title: 'Токен для ИИ-агента создан', color: 'primary' })
  } catch (e) {
    toast.add({
      title: 'Не удалось создать токен',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

function removeToken() {
  auth.clearAgentToken()
  revealed.value = false
  toast.add({ title: 'Токен удалён с этого устройства' })
}

async function copy(text: string | null | undefined, label = 'Скопировано') {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: label, color: 'primary' })
  } catch {
    toast.add({ title: 'Не удалось скопировать', color: 'error' })
  }
}

const downloading = ref(false)
async function downloadSpec() {
  const token = auth.agentToken
  if (!token) return
  downloading.value = true
  try {
    const text = await fetchAgentOpenApi(token)
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'agent-openapi.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.add({
      title: 'Не удалось скачать спецификацию',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Доступ для ИИ-агента" :bordered="false" />

    <div class="mx-auto flex max-w-[720px] flex-col gap-6 px-6 pb-12">
      <p class="text-sm text-muted">
        Подключите своего ИИ-помощника (Claude, Cursor и т.п.) к задачам: он сможет искать,
        читать и изменять задачи в ваших проектах через API. Работает он <b>от вашего имени</b> —
        в журнале и комментариях остаётесь вы, с пометкой «через агента». Удалять и управлять
        участниками агент не может.
      </p>

      <!-- Шаг 1 -->
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Шаг 1. Токен</p>
        </template>

        <div class="flex flex-col gap-4">
          <template v-if="auth.agentToken">
            <div class="flex items-center gap-2 text-sm">
              <template v-if="tokenExpired">
                <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 text-error" />
                <span class="text-error">Срок действия истёк — создайте новый</span>
              </template>
              <template v-else>
                <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-primary" />
                <span class="text-muted">Активен до {{ formatDateTime(tokenExpiresAt) }}</span>
              </template>
            </div>

            <div class="flex items-stretch gap-2">
              <input
                :value="auth.agentToken"
                :type="revealed ? 'text' : 'password'"
                readonly
                aria-label="Токен ИИ-агента"
                class="min-w-0 flex-1 rounded-md border border-default bg-elevated px-3 py-1.5 font-mono text-xs text-default"
                @focus="($event.target as HTMLInputElement).select()"
              >
              <UButton
                :icon="revealed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="primary"
                variant="outline"
                :aria-label="revealed ? 'Скрыть токен' : 'Показать токен'"
                @click="revealed = !revealed"
              />
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton icon="i-lucide-copy" color="primary" @click="copy(auth.agentToken, 'Токен скопирован')">
                Скопировать
              </UButton>
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="creating" @click="createToken">
                Создать новый
              </UButton>
              <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" @click="removeToken">
                Удалить
              </UButton>
            </div>

            <p class="text-xs text-muted">
              Токен действует 48&nbsp;часов, автопродления нет — по истечении вернитесь сюда и создайте новый.
              Здесь он хранится только в этом браузере; «Удалить» забывает его локально, на сервере он
              доработает свой срок.
            </p>
          </template>

          <template v-else>
            <p class="text-sm text-muted">Токен ещё не создан.</p>
            <div>
              <UButton icon="i-lucide-key-round" color="primary" :loading="creating" @click="createToken">
                Создать токен на 48 часов
              </UButton>
            </div>
          </template>
        </div>
      </UCard>

      <!-- Шаг 2 -->
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Шаг 2. Адреса для агента</p>
        </template>

        <div class="flex flex-col gap-4">
          <div>
            <p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">База API</p>
            <div class="flex items-stretch gap-2">
              <code class="min-w-0 flex-1 truncate rounded-md border border-default bg-elevated px-3 py-1.5 font-mono text-xs text-default">{{ apiBase }}</code>
              <UButton icon="i-lucide-copy" color="primary" variant="outline" aria-label="Копировать" @click="copy(apiBase)" />
            </div>
          </div>

          <div>
            <p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted">OpenAPI — список инструментов</p>
            <div class="flex items-stretch gap-2">
              <code class="min-w-0 flex-1 truncate rounded-md border border-default bg-elevated px-3 py-1.5 font-mono text-xs text-default">{{ openApiUrl }}</code>
              <UButton icon="i-lucide-copy" color="primary" variant="outline" aria-label="Копировать" @click="copy(openApiUrl)" />
              <UButton
                icon="i-lucide-download"
                color="primary"
                variant="outline"
                :loading="downloading"
                :disabled="!auth.agentToken"
                @click="downloadSpec"
              >
                Скачать
              </UButton>
            </div>
            <p class="mt-1 text-xs text-muted">
              Этот адрес требует заголовок <code class="font-mono">Authorization: Bearer &lt;токен&gt;</code> —
              открыть его ссылкой в браузере нельзя. Если клиент не может авторизовать загрузку спецификации,
              скачайте файл кнопкой и подключите его локально.
            </p>
          </div>
        </div>
      </UCard>

      <!-- Шаг 3 -->
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Шаг 3. Подключение</p>
        </template>

        <div class="flex flex-col gap-4">
          <p class="text-sm text-muted">
            Любой ИИ-клиент с поддержкой инструментов по OpenAPI: укажите спецификацию (URL или скачанный
            файл) и задайте токен как <code class="font-mono">Authorization: Bearer …</code>. Настройка
            кастомных инструментов в Claude и Cursor описана в их документации. Если клиент не понимает
            OpenAPI — вставьте системный промпт ниже и разрешите модели делать HTTP-запросы.
          </p>

          <div>
            <div class="mb-1 flex items-center justify-between">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">Системный промпт</p>
              <UButton size="xs" icon="i-lucide-copy" color="primary" variant="outline" @click="copy(systemPrompt, 'Промпт скопирован')">
                Копировать
              </UButton>
            </div>
            <pre class="max-h-72 overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs leading-5 text-default whitespace-pre-wrap">{{ systemPrompt }}</pre>
          </div>
        </div>
      </UCard>

      <!-- Шаг 4 -->
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Шаг 4. Дайте задачу</p>
        </template>

        <div class="flex flex-col gap-4">
          <p class="text-sm text-muted">Примеры того, что можно попросить:</p>
          <ul class="flex flex-col gap-2">
            <li v-for="p in examplePrompts" :key="p" class="flex items-start gap-2">
              <button
                type="button"
                class="mt-0.5 shrink-0 text-muted hover:text-primary"
                :aria-label="`Скопировать: ${p}`"
                @click="copy(p)"
              >
                <UIcon name="i-lucide-copy" class="size-3.5" />
              </button>
              <span class="text-sm">«{{ p }}»</span>
            </li>
          </ul>
        </div>
      </UCard>

      <!-- Возможности / ограничения -->
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Что агент может и что нет</p>
        </template>

        <div class="grid gap-6 sm:grid-cols-2">
          <div>
            <p class="mb-2 flex items-center gap-1.5 text-sm font-medium text-primary">
              <UIcon name="i-lucide-check" class="size-4" /> Может
            </p>
            <ul class="flex flex-col gap-1.5 text-sm text-muted">
              <li>Находить задачи и открывать их целиком</li>
              <li>Читать комментарии и обсуждение</li>
              <li>Оставлять комментарии</li>
              <li>Писать и обновлять резюме задачи</li>
              <li>Менять статус, исполнителя, сроки, оценку</li>
              <li>Списывать время</li>
              <li>Смотреть список проектов и их статусы</li>
              <li>Читать базу знаний (вики): дерево, страницы, поиск</li>
            </ul>
          </div>
          <div>
            <p class="mb-2 flex items-center gap-1.5 text-sm font-medium text-error">
              <UIcon name="i-lucide-x" class="size-4" /> Не может
            </p>
            <ul class="flex flex-col gap-1.5 text-sm text-muted">
              <li>Удалять задачи, проекты, комментарии</li>
              <li>Создавать и править страницы вики</li>
              <li>Добавлять и убирать участников, менять роли</li>
              <li>Админку и системные настройки — токен без прав администратора</li>
            </ul>
          </div>
        </div>
      </UCard>

      <!-- Всё одним куском -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <p class="text-lg font-semibold">Всё одним куском</p>
            <UButton
              v-if="auth.agentToken"
              :icon="bundleRevealed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              size="xs"
              color="primary"
              variant="outline"
              :aria-label="bundleRevealed ? 'Скрыть токен' : 'Показать токен'"
              @click="bundleRevealed = !bundleRevealed"
            />
          </div>
        </template>

        <div class="flex flex-col gap-3">
          <p class="text-sm text-muted">
            Токен, адреса и инструкции вместе. Скопируйте текст или скачайте файл и передайте
            агенту одним куском — без десятка отдельных копирований. Промпт заканчивается
            разделом «## Задача» — впишите туда в консоли, что нужно сделать.
          </p>

          <template v-if="auth.agentToken">
            <pre class="max-h-96 overflow-auto rounded-md border border-default bg-elevated p-3 font-mono text-xs leading-5 text-default whitespace-pre-wrap">{{ bundlePreview }}</pre>

            <div class="flex flex-wrap gap-2">
              <UButton icon="i-lucide-copy" color="primary" @click="copy(bundle, 'Скопировано целиком')">
                Скопировать всё
              </UButton>
              <UButton icon="i-lucide-download" color="neutral" variant="soft" @click="downloadBundle">
                Скачать .md
              </UButton>
            </div>

            <p class="text-xs text-muted">
              В скопированном тексте и в файле — полный рабочий токен. Не публикуйте их и не
              коммитьте в репозиторий.
            </p>
          </template>

          <p v-else class="text-sm text-muted">Сначала создайте токен в Шаге 1.</p>
        </div>
      </UCard>
    </div>
  </div>
</template>
