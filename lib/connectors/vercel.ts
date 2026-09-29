import type { HealthCheck } from '../types'
import { asArray, asRecord, fetchJson, planLimited, probe, statusFromHttp, unavailable } from './probe'

type Deployment = {
  uid?: string
  id?: string
  readyState?: string
  state?: string
  url?: string
  name?: string
  createdAt?: number
  errorMessage?: string
  inspectorUrl?: string
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

function teamQuery(teamId?: string) {
  return teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''
}

function deployState(deploy: Deployment) {
  return deploy.readyState ?? deploy.state ?? 'UNKNOWN'
}

function eventText(event: unknown) {
  const row = asRecord(event)
  if (!row) return ''
  const payload = asRecord(row.payload)
  const text = row.text ?? payload?.text ?? payload?.message ?? row.message
  return typeof text === 'string' ? text : ''
}

export function summarizeDeployments(deployments: Deployment[]) {
  const latest = deployments[0]
  if (!latest) {
    return probe({
      id: 'chk-deploy',
      code: 'vercel.deploy',
      label: 'Deploy listo',
      weight: 25,
      status: 'unknown',
      detail: 'Sin deployments recientes.',
      source: 'Vercel',
    })
  }
  const state = deployState(latest)
  const status = state === 'READY' ? 'healthy' : state === 'ERROR' || state === 'CANCELED' ? 'down' : 'degraded'
  const failed = deployments.filter((item) => {
    const value = deployState(item)
    return value === 'ERROR' || value === 'CANCELED'
  }).length
  return probe({
    id: 'chk-deploy',
    code: 'vercel.deploy',
    label: 'Deploy listo',
    weight: 25,
    status,
    detail: `${state}${latest.url ? ` · ${latest.url}` : ''}${failed > 1 ? ` · ${failed} fallos recientes` : ''}`,
    source: 'Vercel',
    href: latest.inspectorUrl || (latest.url ? `https://${latest.url}` : undefined),
  })
}

export function summarizeBuildLog(lines: string[]) {
  const error = lines.find((line) => /error|failed|ELIFECYCLE|Module not found/i.test(line))
  if (!error) {
    return probe({
      id: 'chk-vercel-build',
      code: 'vercel.build',
      label: 'Log de build',
      weight: 12,
      status: 'unknown',
      detail: 'El deploy falló y el log de build no trajo una línea de error.',
      source: 'Vercel',
    })
  }
  return probe({
    id: 'chk-vercel-build',
    code: 'vercel.build',
    label: 'Log de build',
    weight: 18,
    status: 'down',
    detail: error.slice(0, 280),
    source: 'Vercel',
  })
}

export async function listVercelProjects(token: string, teamId?: string) {
  const response = await fetchJson(
    `https://api.vercel.com/v9/projects?limit=40${teamQuery(teamId)}`,
    { headers: auth(token) },
  )
  if (!response.ok) return []
  const projects = asArray(asRecord(response.body)?.projects)
  return projects.flatMap((item) => {
    const row = asRecord(item)
    const name = typeof row?.name === 'string' ? row.name : ''
    if (!name) return []
    const id = typeof row?.id === 'string' ? row.id : name
    return [{ id: name, label: name, hint: id }]
  })
}

export async function validateVercelToken(token: string) {
  const user = await fetchJson('https://api.vercel.com/v2/user', { headers: auth(token) })
  if (!user.ok) {
    return {
      ok: false as const,
      error:
        user.status === 401 || user.status === 403
          ? 'Vercel no aceptó el token. Creá uno nuevo en Account → Tokens, con permiso para ver proyectos.'
          : `Vercel respondió ${user.status}. Esperá un momento y probá otra vez.`,
    }
  }
  const account = asRecord(asRecord(user.body)?.user)
  const label =
    (typeof account?.username === 'string' && account.username) ||
    (typeof account?.email === 'string' && account.email) ||
    'cuenta Vercel'
  const teams = await fetchJson('https://api.vercel.com/v2/teams', { headers: auth(token) })
  const team = asRecord(asArray(asRecord(teams.body)?.teams)[0])
  const teamId = typeof team?.id === 'string' ? team.id : undefined
  const resources = await listVercelProjects(token, teamId)
  return { ok: true as const, account: label, resources, teamId }
}

export async function monitorVercel(project: string, token?: string, teamId?: string): Promise<HealthCheck[]> {
  if (!token) {
    return [
      unavailable('chk-deploy', 'Deploy listo', 'Vercel', 'Falta token de Vercel en la bóveda.', 'vercel.deploy'),
    ]
  }

  const params = new URLSearchParams({ limit: '6' })
  if (project) params.set('app', project)
  if (teamId) params.set('teamId', teamId)
  let deployments: Deployment[] = []
  try {
    const listed = await fetchJson(`https://api.vercel.com/v6/deployments?${params}`, { headers: auth(token) })
    if (!listed.ok) {
      return [
        probe({
          id: 'chk-deploy',
          code: 'vercel.deploy',
          label: 'Deploy listo',
          weight: 25,
          status: statusFromHttp(listed.status),
          detail:
            listed.status === 401 || listed.status === 403
              ? 'Token de Vercel inválido o sin permiso.'
              : `Vercel ${listed.status}. Revisá el token o el nombre del proyecto.`,
          source: 'Vercel',
        }),
      ]
    }
    deployments = asArray(asRecord(listed.body)?.deployments) as Deployment[]
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return [unavailable('chk-deploy', 'Deploy listo', 'Vercel', `Vercel no respondió · ${reason}`, 'vercel.deploy')]
  }

  const checks: HealthCheck[] = [summarizeDeployments(deployments)]
  const latest = deployments[0]
  const latestId = latest?.uid ?? latest?.id
  const state = latest ? deployState(latest) : ''

  if (latestId && (state === 'ERROR' || state === 'CANCELED')) {
    try {
      const events = await fetchJson(
        `https://api.vercel.com/v3/deployments/${encodeURIComponent(latestId)}/events?builds=1&limit=40&direction=backward${teamQuery(teamId)}`,
        { headers: auth(token) },
      )
      if (events.ok) {
        const rows = asArray(asRecord(events.body)?.events ?? events.body)
        const lines = rows.map(eventText).map((line) => line.trim()).filter(Boolean)
        checks.push(summarizeBuildLog(lines))
      } else if (!planLimited(events.status)) {
        checks.push(summarizeBuildLog([]))
      }
    } catch {
      checks.push(summarizeBuildLog([]))
    }
  }

  if (project) {
    try {
      const projectRes = await fetchJson(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`,
        { headers: auth(token) },
      )
      if (projectRes.ok) {
        const row = asRecord(projectRes.body)
        const targets = asRecord(row?.targets)
        const production = asRecord(targets?.production)
        const alias = asArray(production?.alias).filter((item): item is string => typeof item === 'string')
        const domain = alias[0]
        if (!domain) {
          checks.push(
            probe({
              id: 'chk-vercel-domain',
              code: 'vercel.domain',
              label: 'Dominio y SSL',
              weight: 8,
              status: 'unknown',
              detail: 'El proyecto no tiene alias de producción.',
              source: 'Vercel',
            }),
          )
        } else {
          const domainRes = await fetchJson(`https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`, {
            headers: auth(token),
          })
          const info = asRecord(domainRes.body)
          const verified = info?.verified === true
          checks.push(
            probe({
              id: 'chk-vercel-domain',
              code: 'vercel.domain',
              label: 'Dominio y SSL',
              weight: 10,
              status: domainRes.ok ? (verified ? 'healthy' : 'degraded') : 'unknown',
              detail: domainRes.ok
                ? `${domain} · ${verified ? 'verificado' : 'sin verificar'}`
                : `${domain} · dominio no legible (${domainRes.status})`,
              source: 'Vercel',
              href: `https://${domain}`,
            }),
          )
        }
        const projectId = typeof row?.id === 'string' ? row.id : ''
        if (projectId && latestId) {
          const logs = await fetchJson(
            `https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(latestId)}/runtime-logs?limit=20${teamQuery(teamId)}`,
            { headers: auth(token) },
          )
          if (!logs.ok && planLimited(logs.status)) {
            checks.push(
              unavailable(
                'chk-vercel-runtime',
                'Logs de runtime',
                'Vercel',
                'Runtime logs no están disponibles en este plan o con este token.',
                'vercel.runtime',
              ),
            )
          } else if (logs.ok) {
            const rows = asArray(asRecord(logs.body)?.logs ?? logs.body)
            const errors = rows.filter((item) => {
              const record = asRecord(item)
              const level = String(record?.level ?? record?.type ?? '')
              return /error|fatal/i.test(level)
            })
            checks.push(
              probe({
                id: 'chk-vercel-runtime',
                code: 'vercel.runtime',
                label: 'Logs de runtime',
                weight: 12,
                status: errors.length > 5 ? 'down' : errors.length > 0 ? 'degraded' : 'healthy',
                detail:
                  errors.length > 0
                    ? `${errors.length} errores de runtime en el muestreo`
                    : 'Sin errores de runtime en el muestreo',
                source: 'Vercel',
              }),
            )
          }
        }
      }
    } catch {
      checks.push(unavailable('chk-vercel-domain', 'Dominio y SSL', 'Vercel', 'No se pudo leer el proyecto.', 'vercel.domain'))
    }

    try {
      const firewall = await fetchJson(
        `https://api.vercel.com/v1/security/firewall/events?projectId=${encodeURIComponent(project)}&limit=20${teamQuery(teamId)}`,
        { headers: auth(token) },
      )
      if (!firewall.ok) {
        checks.push(
          unavailable(
            'chk-vercel-firewall',
            'Firewall',
            'Vercel',
            planLimited(firewall.status)
              ? 'Firewall y attack challenge no están en este plan.'
              : `Firewall respondió ${firewall.status}.`,
            'vercel.firewall',
          ),
        )
      } else if (firewall.ok) {
        const events = asArray(asRecord(firewall.body)?.events ?? firewall.body)
        const blocked = events.filter((item) => /deny|challenge|block/i.test(JSON.stringify(item))).length
        checks.push(
          probe({
            id: 'chk-vercel-firewall',
            code: 'vercel.firewall',
            label: 'Firewall',
            weight: 14,
            status: blocked > 30 ? 'down' : blocked > 8 ? 'degraded' : 'healthy',
            detail:
              blocked > 0
                ? `${blocked} eventos de challenge o bloqueo en el muestreo`
                : 'Sin eventos de firewall en el muestreo',
            source: 'Vercel',
          }),
        )
      }
    } catch {
      checks.push(
        unavailable('chk-vercel-firewall', 'Firewall', 'Vercel', 'Firewall no respondió.', 'vercel.firewall'),
      )
    }
  }

  return checks
}

export async function checkVercel(project: string, token?: string, teamId?: string): Promise<HealthCheck> {
  const checks = await monitorVercel(project, token, teamId)
  return checks[0]
}
