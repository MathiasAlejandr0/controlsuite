import { resolvePublicHttpUrl } from '../public-url'
import type { HealthCheck } from '../types'

const MAX_REDIRECTS = 5

function check(status: HealthCheck['status'], detail: string): HealthCheck {
  return {
    id: 'chk-uptime',
    label: 'Uptime HTTP',
    weight: 15,
    status,
    detail,
    source: 'HTTP',
  }
}

async function fetchPublic(url: string) {
  let current = url
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const allowed = await resolvePublicHttpUrl(current)
    if (!allowed.ok) throw new Error(allowed.error)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    const response = await fetch(allowed.url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'suite-control/0.1' },
    })
    clearTimeout(timeout)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return response
      current = new URL(location, allowed.url).toString()
      continue
    }
    return response
  }
  throw new Error('Demasiados redirects.')
}

export async function checkHttp(url: string): Promise<HealthCheck> {
  const allowed = await resolvePublicHttpUrl(url)
  if (!allowed.ok) return check('unknown', `${url} · ${allowed.error}`)

  const started = Date.now()
  try {
    const response = await fetchPublic(allowed.url.toString())
    const ms = Date.now() - started
    const ok = response.ok
    return check(ok ? (ms > 2500 ? 'degraded' : 'healthy') : 'down', `${url} → ${response.status} en ${ms}ms`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return check('down', `${url} no responde · ${reason}`)
  }
}
