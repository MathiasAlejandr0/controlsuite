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

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return { ok: response.ok, status: response.status, body }
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
