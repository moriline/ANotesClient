<script setup lang="ts">
// Поле пароля с глазком-переключателем видимости — общее для входа,
// регистрации и смены пароля в профиле, чтобы не размножать одну и ту же
// кнопку в trailing-слоте по всем формам.
import { ref } from 'vue'

defineProps<{ placeholder?: string; autocomplete?: string }>()
const model = defineModel<string>({ default: '' })

const visible = ref(false)
</script>

<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        variant="ghost"
        color="neutral"
        size="sm"
        :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
