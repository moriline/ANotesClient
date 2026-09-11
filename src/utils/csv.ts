// Экспорт отчётов в CSV — единственный формат, который не требует новой
// зависимости (XLSX/PDF нужна библиотека). Три locale-ловушки на двойной клик
// по файлу, и как они закрыты здесь:
//   - разделитель: ';' — но локаль Excel всё равно определяет разделитель по
//     системным настройкам при обычном двойном клике, поэтому первой строкой
//     идёт директива `sep=;` — Excel её понимает буквально, а не гадает;
//   - кодировка: BOM в начале файла — без него кириллица превращается в
//     кракозябры;
//   - дробные числа: НЕ используем вообще. "10,50" верно только в локали с
//     запятой как десятичным знаком — в любой другой Excel сочтёт это текстом
//     и молча не просуммирует (=СУММ промолчит). Секунды — всегда целое
//     число, оно не ломается ни в одной локали; длительность для чтения
//     глазами — отдельной текстовой колонкой.

function escapeCsvField(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsvRow(cells: (string | number)[]): string {
  return cells.map(c => escapeCsvField(String(c))).join(';')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

const BOM = String.fromCharCode(0xfeff)

export function downloadCsv(filename: string, rows: string[]): void {
  const content = `${BOM}sep=;\r\n${rows.join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
