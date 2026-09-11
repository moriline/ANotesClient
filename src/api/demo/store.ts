import { reactive } from 'vue'
import { buildSeed, type DemoDb } from './seed'

// Состояние демо в памяти вкладки (client_pages.md §3.4). `reactive`, чтобы
// правки сразу отражались там, где компоненты держат ссылки на объекты.
// Никакого localStorage — перезагрузка должна возвращать исходные данные,
// это и есть защита демо от замусоривания посетителями.
export const db = reactive(buildSeed()) as DemoDb

export function resetDemo(): void {
  Object.assign(db, buildSeed())
}
