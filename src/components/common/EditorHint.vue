<script setup lang="ts">
// Значок «?» рядом с полем ввода. При наведении — подсказка по упоминаниям
// и горячим клавишам редактора (MentionTextarea).

withDefaults(defineProps<{
  /** Что делает ⌘/Ctrl+Enter в этом поле. */
  submitLabel?: string
}>(), {
  submitLabel: 'отправить'
})
</script>

<template>
  <UPopover
    mode="hover"
    :open-delay="120"
    :close-delay="80"
    :content="{ side: 'top', align: 'start' }"
    :ui="{ content: 'max-w-xs' }"
  >
    <button
      type="button"
      tabindex="-1"
      aria-label="Подсказка по вводу"
      class="inline-flex size-4 items-center justify-center rounded-full text-muted transition-colors hover:text-highlighted"
      @click.prevent
    >
      <UIcon name="i-lucide-info" class="size-3.5" />
    </button>

    <template #content>
      <div class="flex max-w-xs flex-col gap-1.5 p-3 text-xs leading-5 text-default">
        <p class="font-medium text-highlighted">Упоминания и клавиши</p>
        <p>
          <UKbd>@</UKbd> — открыть список участников. Фильтр по мере набора,
          загружается сразу, без задержки.
        </p>
        <p>
          В списке: <UKbd>↑</UKbd> <UKbd>↓</UKbd> — выбрать,
          <UKbd>Enter</UKbd> или <UKbd>Tab</UKbd> — вставить,
          <UKbd>Esc</UKbd> — закрыть.
        </p>
        <p>
          В текст попадает <code class="rounded bg-elevated px-1 font-mono">@username</code>,
          показывается «@Имя». Упомянутому придёт уведомление в колокольчик.
        </p>
        <p>
          <UKbd>⌘</UKbd>/<UKbd>Ctrl</UKbd> + <UKbd>Enter</UKbd> — {{ submitLabel }}.
        </p>
        <p class="mt-0.5 border-t border-default pt-2">
          <RouterLink to="/help/markdown" class="text-primary hover:underline">
            Разметка Markdown
          </RouterLink>
          <span class="text-dimmed"> · </span>
          <RouterLink to="/help/comments-mentions" class="text-primary hover:underline">
            про упоминания
          </RouterLink>
        </p>
      </div>
    </template>
  </UPopover>
</template>
