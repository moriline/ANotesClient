import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { Agent } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { THEME } from './src/theme.ts'

// Отдельный агент БЕЗ keep-alive для прокси на бэкенд. Node 19+ по
// умолчанию пулит keep-alive соединения; бэкенд закрывает простаивающие
// по своему idle-таймауту, Node про это не знает и переиспользует мёртвый
// сокет — запрос (особенно POST /api/find) зависает раз в 2–3 навигации.
// На loopback новое соединение стоит ~0.6 мс, пул тут не нужен.
const apiAgent = new Agent({ keepAlive: false, maxSockets: 24 })

export default defineConfig({
  plugins: [
    vue(),
    ui({
      ui: {
        colors: {
          primary: THEME.primary,
          secondary: THEME.secondary,
          neutral: THEME.neutral
        },
        // Поля ввода — subtle (из конфигуратора Nuxt UI Theme). Кнопки
        // оставляем на штатном дефолте Nuxt UI: color=primary, variant=solid —
        // фиолетовая заливка, белый текст.
        input: { defaultVariants: { variant: 'subtle' } },
        inputNumber: { defaultVariants: { variant: 'subtle' } },
        textarea: { defaultVariants: { variant: 'subtle' } },
        select: { defaultVariants: { variant: 'subtle' } },
        selectMenu: { defaultVariants: { variant: 'subtle' } },
        inputMenu: { defaultVariants: { variant: 'subtle' } },
        inputTags: { defaultVariants: { variant: 'subtle' } },
        pinInput: { defaultVariants: { variant: 'subtle' } }
      },
      colorMode: false
    })
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    proxy: {
      // 127.0.0.1, не localhost: на Windows localhost резолвится в ::1
      // первым, бэкенд слушает только IPv4, и попытка по IPv6 висит до
      // таймаута fallback-а (~200 мс) на каждом холодном соединении.
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        agent: apiAgent,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            console.warn(`[proxy] ${req.method} ${req.url} -> ${err.message}`)
          })
        }
      }
    }
  }
})
