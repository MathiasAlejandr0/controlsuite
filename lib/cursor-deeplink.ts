const DEEPLINK_BASE = 'cursor://anysphere.cursor-deeplink/prompt'
export const CURSOR_DEEPLINK_MAX = 8000

export function buildPromptDeeplink(promptText: string): string | null {
  const text = promptText.trim()
  if (!text) return null
  const href = `${DEEPLINK_BASE}?text=${encodeURIComponent(text)}`
  if (href.length > CURSOR_DEEPLINK_MAX) return null
  return href
}

export function fitPromptForDeeplink(full: string, compact: string) {
  return buildPromptDeeplink(full) ? full : compact
}
