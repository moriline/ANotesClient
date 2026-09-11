<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const route = useRoute()
const showChrome = computed(() => route.meta.chrome !== false)
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-white">
      <AppHeader v-if="showChrome" />
      <RouterView />
    </div>
    <ConfirmDialog />
  </UApp>
</template>
