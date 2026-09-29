import type { HealthCheck, HealthStatus } from '../types'
import { asArray, asRecord, fetchJson, planLimited, probe, statusFromHttp, unavailable } from './probe'

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

function projectStatus(value: string): HealthStatus {
  const status = value.toUpperCase()
  if (status === 'ACTIVE_HEALTHY') return 'healthy'
  if (status.includes('UNHEALTHY') || status === 'INACTIVE' || status.includes('GOING_DOWN')) return 'down'
  if (status.includes('PAUSED') || status.includes('COMING') || status.includes('RESTART')) return 'degraded'
  if (!status) return 'unknown'
  return 'degraded'
}

export function summarizeAdvisors(lints: Array<{ title?: string; name?: string; level?: string; detail?: string }>, kind: 'security' | 'perf') {
  const errors = lints.filter((lint) => /error|critical/i.test(lint.level ?? ''))
  const warns = lints.filter((lint) => /warn/i.test(lint.level ?? ''))
  const top = errors[0] ?? warns[0]
  const code = kind === 'security' ? 'supabase.security' : 'supabase.perf'
  const id = kind === 'security' ? 'chk-sb-security' : 'chk-sb-perf'
  const label = kind === 'security' ? 'Advisors de seguridad' : 'Advisors de performance'
  if (lints.length === 0) {
    return probe({
      id,
      code,
      label,
      weight: kind === 'security' ? 16 : 8,
      status: 'healthy',
      detail: kind === 'security' ? 'Sin lints de seguridad' : 'Sin lints de performance',
      source: 'Supabase',
    })
  }
  const status: HealthStatus = errors.length ? 'down' : 'degraded'
  const head = top?.title || top?.name || 'lint'
  return probe({
    id,
    code,
    label,
    weight: kind === 'security' ? 16 : 8,
    status,
    detail: `${errors.length} error · ${warns.length} warn · ${head}${top?.detail ? ` · ${top.detail}` : ''}`.slice(0, 320),
    source: 'Supabase',
  })
}

export function summarizeBackups(body: unknown): HealthCheck {
  const row = asRecord(body)
  const backups = asArray(row?.backups ?? body)
  const pitr = row?.pitr_enabled === true || row?.walg_enabled === true
  const latest = asRecord(backups[0])
  const when = typeof latest?.inserted_at === 'string' ? latest.inserted_at : undefined
  const backupStatus = typeof latest?.status === 'string' ? latest.status : ''
  if (pitr) {
    return probe({
      id: 'chk-sb-backup',
      code: 'supabase.backup',
      label: 'Backups',
      weight: 10,
      status: 'healthy',
      detail: 'PITR activo',
      source: 'Supabase',
    })
  }
  if (!when) {
    return probe({
      id: 'chk-sb-backup',
      code: 'supabase.backup',
      label: 'Backups',
      weight: 10,
      status: 'degraded',
      detail: 'Sin backups recientes ni PITR',
      source: 'Supabase',
    })
  }
  const ageDays = Math.round((Date.now() - Date.parse(when)) / 86_400_000)
  const failed = /fail/i.test(backupStatus)
  return probe({
    id: 'chk-sb-backup',
    code: 'supabase.backup',
    label: 'Backups',
    weight: 10,
    status: failed || ageDays > 8 ? 'degraded' : 'healthy',
    detail: `${backupStatus || 'backup'} · hace ${Number.isNaN(ageDays) ? '?' : ageDays} días`,
    source: 'Supabase',
  })
}

function lintList(body: unknown) {
  const row = asRecord(body)
  return asArray(row?.lints ?? body).flatMap((item) => {
    const lint = asRecord(item)
    if (!lint) return []
    return [
      {
        title: typeof lint.title === 'string' ? lint.title : undefined,
        name: typeof lint.name === 'string' ? lint.name : undefined,
        level: typeof lint.level === 'string' ? lint.level : undefined,
        detail: typeof lint.detail === 'string' ? lint.detail : typeof lint.description === 'string' ? lint.description : undefined,
      },
    ]
  })
}

export async function listSupabaseProjects(token: string) {
  const response = await fetchJson('https://api.supabase.com/v1/projects', { headers: auth(token) })
  if (!response.ok) return []
  return asArray(response.body).flatMap((item) => {
    const row = asRecord(item)
    const ref = typeof row?.id === 'string' ? row.id : typeof row?.ref === 'string' ? row.ref : ''
    if (!ref) return []
    const name = typeof row?.name === 'string' ? row.name : ref
    const region = typeof row?.region === 'string' ? row.region : ''
    return [{ id: ref, label: name, hint: region }]
  })
}

export async function validateSupabaseToken(token: string) {
  const response = await fetchJson('https://api.supabase.com/v1/projects', { headers: auth(token) })
  if (!response.ok) return { ok: false as const, error: `Supabase rechazó el token (${response.status}).` }
  const resources = await listSupabaseProjects(token)
  return { ok: true as const, account: 'Management API', resources }
}

async function optionalCheck(
  url: string,
  token: string,
  onOk: (body: unknown) => HealthCheck,
  missing: HealthCheck,
) {
  try {
    const response = await fetchJson(url, { headers: auth(token) })
    if (!response.ok && planLimited(response.status)) return missing
    if (!response.ok) {
      return probe({
        ...missing,
        status: statusFromHttp(response.status),
        detail: `${missing.label} respondió ${response.status}`,
      })
    }
    return onOk(response.body)
  } catch {
    return missing
  }
}

export async function monitorSupabase(ref: string, token?: string): Promise<HealthCheck[]> {
  if (!token) {
    return [unavailable('chk-db', 'Base de datos', 'Supabase', 'Falta token de Supabase en la bóveda.', 'supabase.status')]
  }
  if (!ref.trim()) {
    return [unavailable('chk-db', 'Base de datos', 'Supabase', 'Falta el ref del proyecto.', 'supabase.status')]
  }

  const root = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`
  let project: Record<string, unknown> | undefined
  try {
    const response = await fetchJson(root, { headers: auth(token) })
    if (!response.ok) {
      return [
        probe({
          id: 'chk-db',
          code: 'supabase.status',
          label: 'Base de datos',
          weight: 15,
          status: statusFromHttp(response.status),
          detail:
            response.status === 401 || response.status === 403
              ? 'Token de Supabase inválido o sin permiso.'
              : `Supabase ${response.status} al leer ${ref}`,
          source: 'Supabase',
        }),
      ]
    }
    project = asRecord(response.body)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return [unavailable('chk-db', 'Base de datos', 'Supabase', `Supabase no respondió · ${reason}`, 'supabase.status')]
  }

  const status = String(project?.status ?? '')
  const checks: HealthCheck[] = [
    probe({
      id: 'chk-db',
      code: 'supabase.status',
      label: 'Base de datos',
      weight: 15,
      status: projectStatus(status),
      detail: `${String(project?.name ?? ref)} · ${status || 'sin status'}${project?.region ? ` · ${project.region}` : ''}`,
      source: 'Supabase',
      href: `https://supabase.com/dashboard/project/${ref}`,
    }),
  ]

  checks.push(
    await optionalCheck(
      `${root}/health`,
      token,
      (body) => {
        const services = asArray(asRecord(body)?.services ?? body).flatMap((item) => {
          const row = asRecord(item)
          if (!row) return []
          return [{ name: String(row.name ?? row.service ?? 'servicio'), healthy: row.healthy !== false && !/unhealthy/i.test(String(row.status ?? '')) }]
        })
        const bad = services.filter((item) => !item.healthy)
        return probe({
          id: 'chk-sb-health',
          code: 'supabase.health',
          label: 'Salud de servicios',
          weight: 14,
          status: bad.length ? 'down' : services.length ? 'healthy' : 'unknown',
          detail: bad.length ? `Mal: ${bad.map((item) => item.name).join(', ')}` : 'Auth, DB, API y storage responden',
          source: 'Supabase',
        })
      },
      unavailable('chk-sb-health', 'Salud de servicios', 'Supabase', 'Health de servicios no disponible en este plan.', 'supabase.health'),
    ),
  )

  checks.push(
    await optionalCheck(
      `${root}/advisors/security`,
      token,
      (body) => summarizeAdvisors(lintList(body), 'security'),
      unavailable('chk-sb-security', 'Advisors de seguridad', 'Supabase', 'Advisors de seguridad no disponibles.', 'supabase.security'),
    ),
  )
  checks.push(
    await optionalCheck(
      `${root}/advisors/performance`,
      token,
      (body) => summarizeAdvisors(lintList(body), 'perf'),
      unavailable('chk-sb-perf', 'Advisors de performance', 'Supabase', 'Advisors de performance no disponibles.', 'supabase.perf'),
    ),
  )
  checks.push(
    await optionalCheck(
      `${root}/database/backups`,
      token,
      (body) => summarizeBackups(body),
      unavailable('chk-sb-backup', 'Backups', 'Supabase', 'Backups no disponibles en este plan.', 'supabase.backup'),
    ),
  )

  checks.push(
    await optionalCheck(
      `${root}/config/auth`,
      token,
      (body) => {
        const row = asRecord(body) ?? {}
        const flags: string[] = []
        if (row.MAILER_AUTOCONFIRM === true) flags.push('autoconfirm de email')
        if (row.EXTERNAL_ANONYMOUS_USERS_ENABLED === true) flags.push('usuarios anónimos')
        if (row.SECURITY_CAPTCHA_ENABLED === false) flags.push('captcha apagado')
        return probe({
          id: 'chk-sb-auth',
          code: 'supabase.auth',
          label: 'Auth',
          weight: 10,
          status: flags.length ? 'degraded' : 'healthy',
          detail: flags.length ? flags.join(' · ') : 'Auth sin anomalías obvias de configuración',
          source: 'Supabase',
        })
      },
      unavailable('chk-sb-auth', 'Auth', 'Supabase', 'Config de auth no disponible.', 'supabase.auth'),
    ),
  )

  checks.push(
    await optionalCheck(
      `${root}/database/usage`,
      token,
      (body) => {
        const row = asRecord(body) ?? {}
        const bytes = Number(row.db_size ?? row.database_size_bytes ?? row.disk_usage_bytes ?? NaN)
        const connections = Number(row.connections ?? row.db_connections ?? NaN)
        const parts: string[] = []
        if (Number.isFinite(bytes)) parts.push(`${Math.round(bytes / 1_048_576)} MB`)
        if (Number.isFinite(connections)) parts.push(`${connections} conexiones`)
        const high = (Number.isFinite(bytes) && bytes > 400 * 1_048_576) || (Number.isFinite(connections) && connections > 80)
        return probe({
          id: 'chk-sb-usage',
          code: 'supabase.usage',
          label: 'Uso de disco y conexiones',
          weight: 10,
          status: parts.length === 0 ? 'unknown' : high ? 'degraded' : 'healthy',
          detail: parts.length ? parts.join(' · ') : 'El endpoint no trajo tamaño ni conexiones',
          source: 'Supabase',
        })
      },
      unavailable('chk-sb-usage', 'Uso de disco y conexiones', 'Supabase', 'Uso de disco no disponible en este plan.', 'supabase.usage'),
    ),
  )

  return checks
}

export async function checkSupabase(ref: string, token?: string): Promise<HealthCheck> {
  const checks = await monitorSupabase(ref, token)
  return checks[0]
}
