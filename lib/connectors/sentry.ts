import type { HealthCheck } from '../types'

export function parseSentrySlug(value?: string) {
  const raw = value?.trim()
  if (!raw) return undefined
  const fromUrl = raw.match(/organizations\/([^/]+)(?:\/projects\/([^/]+))?/i)
  if (fromUrl) {
    return fromUrl[2] ? `${fromUrl[1]}/${fromUrl[2]}` : fromUrl[1]
  }
  const cleaned = raw.replace(/^https?:\/\/sentry\.io\//i, '').replace(/\/+$/, '')
  const parts = cleaned.split('/').filter((part) => part && part !== 'issues' && part !== 'projects')
  if (parts.length === 0) return undefined
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]
}

function check(status: HealthCheck['status'], detail: string): HealthCheck {
  return {
    id: 'chk-sentry',
    label: 'Errores Sentry',
    weight: 12,
    status,
    detail,
    source: 'Sentry',
  }
}

export async function checkSentry(slug: string, token?: string): Promise<HealthCheck> {
  const parsed = parseSentrySlug(slug)
  if (!parsed) return check('unknown', 'Falta org o org/proyecto de Sentry.')
  if (!token) return check('unknown', 'Falta token de Sentry en Ajustes.')

  const [org, project] = parsed.split('/')
  const url = project
    ? `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=25`
    : `https://sentry.io/api/0/organizations/${org}/issues/?query=is:unresolved&limit=25`

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    })
    if (response.status === 401 || response.status === 403) {
      return check('unknown', 'Token de Sentry sin permiso o inválido.')
    }
    if (response.status === 404) return check('down', `${parsed} no existe o no es visible.`)
    if (!response.ok) return check('degraded', `Sentry respondió ${response.status}.`)
    const payload = (await response.json()) as Array<{ id?: string; title?: string }>
    const count = Array.isArray(payload) ? payload.length : 0
    if (count === 0) return check('healthy', `${parsed} · 0 issues abiertas`)
    if (count >= 15) return check('down', `${parsed} · ${count}+ issues sin resolver`)
    return check('degraded', `${parsed} · ${count} issues sin resolver`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return check('unknown', `Sentry no respondió · ${reason}`)
  }
}
