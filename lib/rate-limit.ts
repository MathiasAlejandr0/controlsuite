const hits = new Map<string, number[]>()

export function allowRate(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const prev = (hits.get(key) ?? []).filter((at) => now - at < windowMs)
  if (prev.length >= max) {
    hits.set(key, prev)
    return false
  }
  prev.push(now)
  hits.set(key, prev)
  return true
}

export function resetRateLimit(key?: string) {
  if (key) hits.delete(key)
  else hits.clear()
}
