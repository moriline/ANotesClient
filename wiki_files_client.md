# Вложения страниц вики — клиентская часть

Загрузка перетаскиванием, вставка в Markdown, отображение в просмотре.

Стек: Vue 3, TypeScript, Nuxt UI v4, vue-router, Pinia.

Парный документ: `wiki_files_server.md`.

---

## 1. Главный принцип: обычный Markdown, никаких своих схем

Вставляется стандартная разметка с обычным относительным URL:

```markdown
![Схема обмена манифестами](/api/wiki/files/a3f9c2e1-….png)
```

Не `task-file:456`, не `wiki-attachment://…`, не любой другой выдуманный протокол.

Почему это важнее, чем кажется:

| | Свой формат | Обычный URL |
|---|---|---|
| Работает в любом Markdown-редакторе | нет | да |
| Копирование страницы наружу | картинки пропадают | картинки едут с текстом |
| Экспорт, печать | пустые места | работает |
| «Открыть в новой вкладке» | нет | да |
| Нужен свой рендерер | да | нет |
| Миграция при отказе от формата | нужна | не нужна |

Существующие расширения `marked` для `[[Заголовок]]` и `#123` остаются как есть — **для изображений расширение не пишется вообще**. Стандартный `marked` уже умеет `![alt](url)`.

Единственное, что нужно от рендерера, — авторизация запроса. Об этом §4.

---

## 2. Модель и слой API

```ts
// src/types/domain.ts
export interface WikiFile {
  id: number
  pageId: number
  storedName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  isImage: boolean          // считает сервер, клиент не парсит mimeType
  url: string               // «/api/wiki/files/a3f9….png»
  uploadedBy: number
  uploadedByName: string
  uploadedAt: string
}
```

```ts
// src/api/wikiFiles.ts
export const listWikiFiles = (pageId: number) =>
  http<WikiFile[]>(`/wiki/${pageId}/files`)

export async function uploadWikiFile(
  pageId: number, file: File, onProgress?: (pct: number) => void
): Promise<WikiFile> {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<WikiFile>(`/wiki/${pageId}/files`, form, onProgress)
}

export const deleteWikiFile = (id: number, force = false) =>
  http<void>(`/wiki/files/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })
```

`httpUpload` — отдельная функция: `fetch` не даёт прогресса отправки, нужен `XMLHttpRequest`. Для файла в 10 МБ на медленном канале полоса прогресса обязательна.

```ts
// src/api/http.ts — добавить рядом с http()
export function httpUpload<T>(
  path: string, form: FormData, onProgress?: (pct: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`)

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total * 100)
    }
    xhr.onload = () => xhr.status < 400
      ? resolve(JSON.parse(xhr.responseText))
      : reject(new ApiError(JSON.parse(xhr.responseText || '{}')))
    xhr.onerror = () => reject(new Error('Сеть недоступна'))
    xhr.send(form)
  })
}
```

**`Content-Type` не выставлять вручную.** Браузер сам добавит `multipart/form-data` с нужным `boundary`; заданный руками заголовок ломает разбор на сервере.

---

## 3. Загрузка в редакторе

Три способа положить файл, и все три должны работать: **перетаскивание**, **вставка из буфера**, **кнопка**.

Вставка из буфера — самый частый путь для скриншотов: `PrintScreen` → `Ctrl+V` прямо в текст. Если работает только кнопка «Выбрать файл», функцией пользоваться не будут.

```ts
// src/composables/useWikiFileDrop.ts
export function useWikiFileDrop(
  pageId: Ref<number>,
  textarea: Ref<HTMLTextAreaElement | undefined>,
  content: Ref<string>
) {
  const uploading = ref<{ name: string; pct: number }[]>([])
  const toast = useToast()

  async function insert(file: File) {
    const placeholder = `![загрузка ${file.name}…]()`
    insertAtCursor(placeholder)

    const entry = reactive({ name: file.name, pct: 0 })
    uploading.value.push(entry)

    try {
      const saved = await uploadWikiFile(pageId.value, file, p => entry.pct = p)
      const md = saved.isImage
        ? `![${saved.originalName}](${saved.url})`
        : `[${saved.originalName}](${saved.url})`
      content.value = content.value.replace(placeholder, md)
    } catch (e) {
      content.value = content.value.replace(placeholder, '')
      toast.add({ title: 'Не удалось загрузить файл', description: message(e), color: 'error' })
    } finally {
      uploading.value = uploading.value.filter(u => u !== entry)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    for (const f of Array.from(e.dataTransfer?.files ?? [])) insert(f)
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f)
    if (!files.length) return          // обычный текст — не мешаем
    e.preventDefault()
    files.forEach(insert)
  }

  return { onDrop, onPaste, uploading }
}
```

Четыре детали, каждая из которых всплывёт при реализации:

**Плейсхолдер на месте курсора сразу.** Человек видит, куда попадёт картинка, ещё до окончания загрузки. Без этого при медленной сети он успевает поставить курсор в другое место.

**Замена по подстроке, а не по позиции.** Пока файл грузится, текст правится, и запомненный индекс смещается. Поиск уникального плейсхолдера надёжнее.

**Плейсхолдер удаляется при ошибке.** Иначе в тексте навсегда останется `![загрузка screenshot.png…]()`.

**`onPaste` не перехватывает обычный текст.** Проверка `kind === 'file'` обязательна, иначе вставка скопированного абзаца перестанет работать.

### 3.1 Разметка редактора

```vue
<template>
  <div class="relative" @drop="onDrop" @dragover.prevent="dragging = true"
       @dragleave="dragging = false">
    <UTextarea
      ref="textarea"
      v-model="content"
      :rows="24"
      class="font-mono text-sm"
      @paste="onPaste" />

    <div v-if="dragging"
         class="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary
                rounded-lg flex items-center justify-center pointer-events-none">
      <span class="text-sm text-primary">Отпустите, чтобы загрузить</span>
    </div>

    <div v-for="u in uploading" :key="u.name" class="mt-2">
      <div class="flex items-center gap-2 text-xs text-muted mb-1">
        <UIcon name="i-lucide-upload" class="size-3.5" />
        <span class="truncate">{{ u.name }}</span>
        <span class="ml-auto font-mono">{{ Math.round(u.pct) }}%</span>
      </div>
      <UProgress :model-value="u.pct" size="xs" color="secondary" />
    </div>

    <p class="mt-2 text-xs text-muted">
      Перетащите файл сюда или вставьте скриншот из буфера. До 10 МБ.
    </p>
  </div>
</template>
```

`pointer-events-none` на подсветке зоны — иначе она перехватит событие `drop` у самого текстового поля.

---

## 4. Отображение: авторизация запроса

Единственная нетривиальная часть. `<img src="/api/wiki/files/…">` уйдёт **без заголовка `Authorization`** — браузер его не добавляет к подзапросам за ресурсами. Придёт `401`, картинка не отрисуется.

Три варианта, и выбирать надо осознанно.

| | Как | Плюсы | Минусы |
|---|---|---|---|
| **А. Подмена на blob** | перехватить `<img>` после рендера, дотянуть файл через `fetch` с токеном, подставить `blob:` | ничего не трогать на сервере | нет кэша между страницами, картинка не копируется наружу, память надо освобождать |
| **Б. Cookie-сессия для файлов** | сервер ставит `HttpOnly`-cookie при входе, отдача файлов принимает и её | `<img>` работает как обычно, кэш браузера, копирование наружу | нужна правка сервера, нужен `SameSite=Lax` |
| **В. Подписанный URL** | `?sig=…&exp=…` в ссылке | без cookie, без токена | подпись протухает — ссылка в тексте страницы становится временной, **не годится** |

**Рекомендуется Б.** Вариант В отпадает сразу: URL хранится в тексте страницы навсегда, а подпись живёт часы.

Вариант А — запасной, если сервер трогать нельзя:

```ts
// src/composables/useAuthorizedImages.ts
export function useAuthorizedImages(container: Ref<HTMLElement | undefined>) {
  const cache = new Map<string, string>()

  async function resolveAll() {
    const imgs = container.value?.querySelectorAll<HTMLImageElement>(
      'img[src^="/api/wiki/files/"]') ?? []

    for (const img of imgs) {
      const src = img.getAttribute('src')!
      if (cache.has(src)) { img.src = cache.get(src)!; continue }
      try {
        const blob = await fetchBlob(src)          // fetch с Authorization
        const url  = URL.createObjectURL(blob)
        cache.set(src, url)
        img.src = url
      } catch {
        img.replaceWith(brokenPlaceholder(img.alt))
      }
    }
  }

  onUnmounted(() => cache.forEach(URL.revokeObjectURL))   // обязательно
  watch(container, resolveAll, { flush: 'post' })
  return { resolveAll }
}
```

`revokeObjectURL` при размонтировании обязателен: без него открытые страницы вики за сессию накопят десятки мегабайт в памяти вкладки.

**Битая картинка не должна ломать абзац.** Вместо неё — рамка с текстом «Изображение недоступно: имя.png», чтобы читателю было понятно, что здесь что-то было.

---

## 5. Панель вложений

Под редактором и под просмотром — сворачиваемый список:

```
📎 Вложения (3)                                    [+ Загрузить]
  🖼  схема-обмена.png          412 КБ   Дмитрий К.   [Вставить] [✕]
  📄  спецификация.pdf          1,2 МБ   Анна И.      [Скачать]  [✕]
  🖼  скриншот-ошибки.png       88 КБ    Дмитрий К.   [Вставить] [✕]
```

Кнопка **«Вставить»** ставит разметку на место курсора — для случая, когда файл загрузили, потом убрали ссылку из текста, а теперь хотят вернуть.

Кнопка **✕** вызывает `deleteWikiFile`. При `409` («используется в тексте») — диалог:

> Файл используется в тексте страницы. Удалить всё равно? Изображение в тексте станет битым.
> **Отмена** · **Удалить**

Второе нажатие идёт с `force=true`.

```vue
<script setup lang="ts">
const { data: files, refresh } = useAsyncData(() => listWikiFiles(props.pageId))

async function remove(f: WikiFile) {
  try {
    await deleteWikiFile(f.id)
  } catch (e) {
    if (isConflict(e)) {
      const ok = await confirm({
        title: `Удалить «${f.originalName}»?`,
        body: 'Файл используется в тексте страницы. После удаления изображение станет битым.',
        confirmLabel: 'Удалить', color: 'error'
      })
      if (!ok) return
      await deleteWikiFile(f.id, true)
    } else throw e
  }
  await refresh()
}
</script>
```

Свёрнута по умолчанию, если вложений нет; развёрнута, если есть.

---

## 6. Что не делать

| | Почему |
|---|---|
| Свой протокол `wiki-file:` | ломает копирование, экспорт и печать ради ничего |
| Расширение `marked` для изображений | `![alt](url)` уже работает |
| `base64` прямо в тексте страницы | раздувает `content`, ломает поиск и диффы истории, убивает производительность |
| Версионирование вложений | старая ревизия с битой картинкой допустима; хранить все версии всех файлов несоразмерно |
| Кадрирование, сжатие, редактор изображений | отдельный продукт; браузер и так масштабирует по `max-width` |
| Загрузка файлов агентом | вики он читает, но не правит — вложения подчиняются тому же правилу |

---

## 7. Порядок работ

**Вечер 1.** `httpUpload` с прогрессом, `src/api/wikiFiles.ts`, `useWikiFileDrop`, перетаскивание и вставка из буфера в `WikiEditView`.

**Вечер 2.** Отображение: выбранный вариант авторизации, запасной `useAuthorizedImages`, заглушка для битых картинок.

**Вечер 3.** Панель вложений с «Вставить» и удалением через `409`, ограничения и подсказки, пустые состояния.

---

## 8. Проверка

- [ ] перетаскивание, `Ctrl+V` и кнопка дают одинаковый результат;
- [ ] вставка обычного текста через `Ctrl+V` по-прежнему работает;
- [ ] плейсхолдер встаёт на место курсора и заменяется на готовую разметку;
- [ ] ошибка загрузки убирает плейсхолдер, а не оставляет его в тексте;
- [ ] файл больше 10 МБ отклоняется с понятным сообщением, а не молча;
- [ ] изображение отображается в просмотре; не-изображение даёт ссылку на скачивание;
- [ ] битая ссылка показывает заглушку, а не пустое место;
- [ ] кириллица в имени файла сохраняется при скачивании;
- [ ] удаление используемого файла спрашивает подтверждение;
- [ ] после ухода со страницы blob-URL освобождены (проверить в Memory профайлере);
- [ ] текст страницы с картинками копируется в буфер и вставляется в другой Markdown-редактор осмысленно.

Последний пункт — проверка главного принципа §1. Если он не проходит, значит где-то остался нестандартный формат.
