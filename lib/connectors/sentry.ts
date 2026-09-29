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

function check(status: HealthCheck['status'], detail: string, href?: string): HealthCheck {
  return {
    id: 'chk-sentry',
    code: 'sentry.issues',
    label: 'Errores Sentry',
    weight: 12,
    status,
    detail,
    source: 'Sentry',
    href,
  }
}

export function summarizeSentrySpike(counts: number[]): HealthCheck {
  const recent = counts.at(-1) ?? 0
  const previous = counts.slice(0, -1)
  const baseline = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : 0
  const spiked = recent >= 12 && recent > baseline * 3
  return {
    id: 'chk-sentry-spike',
    code: 'sentry.spike',
    label: 'Pico de errores',
    weight: 12,
    status: spiked ? 'down' : recent > baseline * 2 && recent >= 8 ? 'degraded' : 'healthy',
    detail: spiked
      ? `Pico: ${recent} eventos en la última hora (base ${Math.round(baseline)})`
      : `Última hora: ${recent} eventos`,
    source: 'Sentry',
  }
}

export async function listSentryProjects(token: string) {
  const response = await fetch('https://sentry.io/api/0/projects/', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return []
  const rows = (await response.json()) as Array<{ organization?: { slug?: string }; slug?: string; name?: string }>
  return rows.flatMap((row) => {
    const org = row.organization?.slug
    const slug = row.slug
    if (!org || !slug) return []
    return [{ id: `${org}/${slug}`, label: row.name || slug, hint: org }]
  })
}

export async function validateSentryToken(token: string) {
  const response = await fetch('https://sentry.io/api/0/projects/', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, error: 'Sentry rechazó el token. Hace falta project:read y event:read.' }
  }
  if (!response.ok) return { ok: false as const, error: `Sentry respondió ${response.status}.` }
  const resources = await listSentryProjects(token)
  return { ok: true as const, account: 'Sentry', resources }
}

async function issueCheck(parsed: string, token: string): Promise<HealthCheck> {
  const [org, project] = parsed.split('/')
  const href = project
    ? `https://sentry.io/organizations/${org}/issues/?project=${project}`
    : `https://sentry.io/organizations/${org}/issues/`
  const url = project
    ? `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=25`
    : `https://sentry.io/api/0/organizations/${org}/issues/?query=is:unresolved&limit=25`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 401 || response.status === 403) {
    return check('unknown', 'Token de Sentry sin permiso o inválido.')
  }
  if (response.status === 404) return check('down', `${parsed} no existe o no es visible.`, href)
  if (!response.ok) return check('degraded', `Sentry respondió ${response.status}.`, href)
  const payload = (await response.json()) as Array<{ id?: string; title?: string }>
  const count = Array.isArray(payload) ? payload.length : 0
  if (count === 0) return check('healthy', `${parsed} · 0 issues abiertas`, href)
  if (count >= 15) return check('down', `${parsed} · ${count}+ issues sin resolver`, href)
  return check('degraded', `${parsed} · ${count} issues sin resolver`, href)
}

async function spikeCheck(parsed: string, token: string): Promise<HealthCheck> {
  const [org, project] = parsed.split('/')
  if (!project) {
    return {
      id: 'chk-sentry-spike',
      code: 'sentry.spike',
      label: 'Pico de errores',
      weight: 8,
      status: 'unknown',
      detail: 'Elegí un proyecto (org/proyecto) para medir picos.',
      source: 'Sentry',
    }
  }
  const url = `https://sentry.io/api/0/projects/${org}/${project}/stats/?stat=received&resolution=1h`
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    })
    if (response.status === 402 || response.status === 403 || response.status === 404) {
      return {
        id: 'chk-sentry-spike',
        code: 'sentry.spike',
        label: 'Pico de errores',
        weight: 8,
        status: 'unknown',
        detail: 'Stats de Sentry no disponibles con este token o plan.',
        source: 'Sentry',
      }
    }
    if (!response.ok) {
      return summarizeSentrySpike([])
    }
    const payload = (await response.json()) as Array<[number, number]>
    const counts = Array.isArray(payload) ? payload.slice(-6).map((row) => Number(row?.[1] ?? 0)) : []
    return summarizeSentrySpike(counts)
  } catch {
    return {
      id: 'chk-sentry-spike',
      code: 'sentry.spike',
      label: 'Pico de errores',
      weight: 8,
      status: 'unknown',
      detail: 'Sentry no entregó la serie de stats.',
      source: 'Sentry',
    }
  }
}

export async function monitorSentry(slug: string, token?: string): Promise<HealthCheck[]> {
  const parsed = parseSentrySlug(slug)
  if (!parsed) return [check('unknown', 'Falta org o org/proyecto de Sentry.')]
  if (!token) return [check('unknown', 'Falta token de Sentry en la bóveda.')]
  try {
    const issues = await issueCheck(parsed, token)
    const spike = await spikeCheck(parsed, token)
    return [issues, spike]
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return [check('unknown', `Sentry no respondió · ${reason}`)]
  }
}

export async function checkSentry(slug: string, token?: string): Promise<HealthCheck> {
  const checks = await monitorSentry(slug, token)
  return checks[0]
}
