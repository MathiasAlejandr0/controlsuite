const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|about):/i

export function safeHttpUrl(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed || BLOCKED_SCHEMES.test(trimmed)) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
