<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import HelpNav from '@/components/help/HelpNav.vue'
import HelpContent from '@/components/help/HelpContent.vue'
import {
  DEFAULT_HELP_TOPIC,
  HELP_TOPICS,
  helpTitle,
  isHelpTopic
} from '@/help/topics'
import { helpSource } from '@/help/content'

// props.topic — из /help/:topic? (optional). Пусто → «Обзор».
const props = defineProps<{ topic?: string }>()
const router = useRouter()

const current = computed(() => props.topic ?? DEFAULT_HELP_TOPIC)

// Неизвестный раздел в URL → назад в «Обзор».
watch(current, (t) => {
  if (!isHelpTopic(t)) router.replace({ name: 'help' })
}, { immediate: true })

const source = computed(
  () => helpSource(current.value) ?? helpSource(DEFAULT_HELP_TOPIC) ?? ''
)

const topicItems = HELP_TOPICS.map(t => ({ label: t.title, value: t.id }))

interface Heading { id: string, text: string, level: number }
const headings = ref<Heading[]>([])
</script>

<template>
  <div>
    <PageHeader title="Справка" :subtitle="helpTitle(current)" />

    <div class="mx-auto w-[95%] px-6 py-6">
      <!-- Узкий экран: выбор раздела списком сверху -->
      <USelectMenu
        :model-value="current"
        :items="topicItems"
        value-key="value"
        class="mb-5 w-full lg:hidden"
        @update:model-value="(v: string) => router.push(`/help/${v}`)"
      />

      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[210px_1fr]">
        <HelpNav
          :current="current"
          class="hidden lg:block lg:sticky lg:top-20 lg:self-start"
        />

        <div class="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_190px]">
          <article class="min-w-0">
            <HelpContent :source="source" @headings="headings = $event" />
          </article>

          <nav
            v-if="headings.length > 1"
            class="hidden xl:block xl:sticky xl:top-20 xl:self-start"
          >
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-dimmed">
              На этой странице
            </p>
            <ul class="flex flex-col">
              <li v-for="h in headings" :key="h.id">
                <RouterLink
                  :to="{ path: `/help/${current}`, hash: `#${h.id}` }"
                  class="block border-l border-default py-1 text-[13px] leading-snug text-muted transition-colors hover:border-primary hover:text-highlighted"
                  :class="h.level === 3 ? 'pl-5' : 'pl-3'"
                >
                  {{ h.text }}
                </RouterLink>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>
