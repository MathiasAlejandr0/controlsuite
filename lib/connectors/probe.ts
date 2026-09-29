import type { HealthCheck, HealthStatus } from '../types'

export function probe(
  partial: Pick<HealthCheck, 'id' | 'label' | 'status' | 'detail' | 'source'> &
    Partial<Pick<HealthCheck, 'weight' | 'code' | 'href'>>,
): HealthCheck {
  return { weight: 10, ...partial }
}

export function unavailable(id: string, label: string, source: string, detail: string, code: string): HealthCheck {
  return probe({ id, label, source, detail, code, status: 'unknown', weight: 8 })
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12_000) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store',
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      })
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < 2) {
        await wait(200 * 2 ** attempt)
        continue
      }
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      return { ok: response.ok, status: response.status, body }
    } catch (error) {
      lastError = error
      if (attempt >= 2) break
      await wait(200 * 2 ** attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('El proveedor no respondió.')
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function planLimited(status: number) {
  return status === 401 || status === 402 || status === 403 || status === 404
}

export function statusFromHttp(status: number): HealthStatus {
  if (status === 401 || status === 403) return 'unknown'
  return 'down'
}
