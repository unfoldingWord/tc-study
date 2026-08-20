/** Trigger a browser download of a JSON-serializable value. */
export function downloadJson(data: unknown, filename: string): void {
  const dataStr = JSON.stringify(data, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function slugFilename(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase()
}

export function datedFilename(prefix: string, ext = 'json'): string {
  return `${prefix}-${new Date().toISOString().split('T')[0]}.${ext}`
}
