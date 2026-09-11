<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { initials } from '@/utils/format'
import type { MentionUser } from '@/utils/mentions'

// UTextarea + всплывающий список участников по «@». Список фильтруется в памяти
// (участники проекта загружены заранее) — нулевая задержка, без debounce и гонок
// запросов. При выборе в текст вставляется @username (по нему сервер создаёт
// уведомление MENTION, notifications.md §7); показывается при этом «@Имя».

const props = withDefaults(defineProps<{
  modelValue: string
  members: MentionUser[]
  rows?: number
  placeholder?: string
  autofocus?: boolean
}>(), {
  rows: 3,
  placeholder: '',
  autofocus: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** Ctrl/Cmd+Enter при закрытом списке. */
  submit: []
}>()

const taComp = ref<{ textareaRef: HTMLTextAreaElement | null } | null>(null)
function el(): HTMLTextAreaElement | null {
  return taComp.value?.textareaRef ?? null
}

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
// Позиция символа «@» в строке — начало заменяемого фрагмента.
let anchorStart = 0

const matches = computed<MentionUser[]>(() => {
  if (!open.value) return []
  const q = query.value.toLowerCase()
  const list = q
    ? props.members.filter(m =>
        m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
    : props.members
  return list.slice(0, 8)
})

function closePopup() {
  open.value = false
  query.value = ''
  activeIndex.value = 0
}

// «@» в начале строки или после пробела, за ним — до 30 букв/цифр/._- (так
// запрос обрывается на пробеле и на знаках препинания). Буквы любые, включая
// кириллицу, — фильтровать можно и по отображаемому имени. Адрес почты (text@…)
// не триггерит: перед «@» непробельный символ.
function syncFromCaret() {
  const node = el()
  if (!node || !props.members.length) return closePopup()
  const caret = node.selectionStart ?? 0
  const before = node.value.slice(0, caret)
  const m = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(before)
  if (!m) return closePopup()
  anchorStart = caret - m[1]!.length - 1
  query.value = m[1]!
  if (!open.value) activeIndex.value = 0
  open.value = true
}

function onKeydown(e: KeyboardEvent) {
  if (open.value && matches.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation()
      activeIndex.value = (activeIndex.value + 1) % matches.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation()
      activeIndex.value = (activeIndex.value - 1 + matches.value.length) % matches.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation()
      choose(matches.value[activeIndex.value]!)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      closePopup()
      return
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    // preventDefault, но не stopPropagation: InlineEdit ловит эту же комбинацию
    // на обёртке, чтобы сохранить поле.
    e.preventDefault()
    emit('submit')
  }
}

function onKeyup(e: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) syncFromCaret()
}

function choose(user: MentionUser) {
  const node = el()
  const full = node?.value ?? props.modelValue
  const caret = node?.selectionStart ?? full.length
  const token = `@${user.username} `
  emit('update:modelValue', full.slice(0, anchorStart) + token + full.slice(caret))
  closePopup()
  nextTick(() => {
    const pos = anchorStart + token.length
    if (node) {
      node.focus()
      node.setSelectionRange(pos, pos)
    }
  })
}

// Клик мимо списка. Клик по пункту гасит blur через @mousedown.prevent, так что
// сюда попадает только уход фокуса наружу.
function onBlur() {
  window.setTimeout(closePopup, 120)
}
</script>

<template>
  <div class="relative">
    <UTextarea
      ref="taComp"
      :model-value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :autofocus="autofocus"
      class="w-full"
      @update:model-value="(v: string) => emit('update:modelValue', v)"
      @input="syncFromCaret"
      @keydown="onKeydown"
      @keyup="onKeyup"
      @click="syncFromCaret"
      @blur="onBlur"
    />
    <ul
      v-if="open && matches.length"
      class="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-default bg-default p-1 shadow-lg"
    >
      <li v-for="(u, i) in matches" :key="u.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
          :class="i === activeIndex ? 'bg-elevated' : 'hover:bg-elevated/60'"
          @mousedown.prevent="choose(u)"
          @mouseenter="activeIndex = i"
        >
          <UAvatar :src="u.avatarUrl || undefined" :text="initials(u.name)" size="2xs" />
          <span class="min-w-0 truncate">{{ u.name }}</span>
          <span class="ml-auto shrink-0 text-xs text-muted">@{{ u.username }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
