// Экспорт отчётов в CSV — единственный формат, который не требует новой
// зависимости (XLSX/PDF нужна библиотека). ';' как разделитель и запятая как
// десятичный знак — так Excel в русской локали распознаёт числа как числа;
// BOM в начале файла — чтобы кириллица не превращалась в кракозябры.

function escapeCsvField(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsvRow(cells: (string | number)[]): string {
  return cells.map(c => escapeCsvField(String(c))).join(';')
}

/** Часы десятичной дробью с запятой — чтобы Excel RU сразу считал это числом. */
export function hoursForCsv(totalSeconds: number): string {
  return (totalSeconds / 3600).toFixed(2).replace('.', ',')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

const BOM = String.fromCharCode(0xfeff)

export function downloadCsv(filename: string, rows: string[]): void {
  const content = BOM + rows.join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(filename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
