import type { HealthCheck } from '../types'
import { asArray, asRecord, fetchJson, planLimited, probe, unavailable } from './probe'

type Zone = { id: string; name: string; status: string }

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

export function summarizeFirewall(total: number) {
  return probe({
    id: 'chk-cf-attack',
    code: 'cloudflare.attack',
    label: 'Eventos de firewall',
    weight: 16,
    status: total >= 200 ? 'down' : total >= 40 ? 'degraded' : 'healthy',
    detail:
      total >= 40
        ? `${total} eventos de firewall en la última hora`
        : `${total} eventos de firewall en la última hora`,
    source: 'Cloudflare',
  })
}

export async function listCloudflareZones(token: string) {
  const response = await fetchJson('https://api.cloudflare.com/client/v4/zones?per_page=50', {
    headers: auth(token),
  })
  if (!response.ok) return []
  return asArray(asRecord(response.body)?.result).flatMap((item) => {
    const row = asRecord(item)
    const name = typeof row?.name === 'string' ? row.name : ''
    if (!name) return []
    const status = typeof row?.status === 'string' ? row.status : ''
    return [{ id: name, label: name, hint: status }]
  })
}

export async function validateCloudflareToken(token: string) {
  const verify = await fetchJson('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: auth(token) })
  if (!verify.ok) {
    return {
      ok: false as const,
      error:
        verify.status === 401 || verify.status === 403
          ? 'Cloudflare no aceptó el token. Creá uno con Zone:Read, SSL:Read, Zone Settings:Read y Analytics:Read.'
          : `Cloudflare respondió ${verify.status}. Esperá un momento y probá otra vez.`,
    }
  }
  const resources = await listCloudflareZones(token)
  const result = asRecord(asRecord(verify.body)?.result)
  const account = typeof result?.status === 'string' ? `token ${result.status}` : 'token activo'
  return { ok: true as const, account, resources }
}

async function setting(zoneId: string, name: string, token: string) {
  const response = await fetchJson(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${name}`, {
    headers: auth(token),
  })
  if (!response.ok) return undefined
  const value = asRecord(asRecord(response.body)?.result)?.value
  return typeof value === 'string' ? value : undefined
}

export async function monitorCloudflare(zoneName: string, token?: string): Promise<HealthCheck[]> {
  if (!token) {
    return [unavailable('chk-tls', 'TLS y dominio', 'Cloudflare', 'Falta token de Cloudflare en la bóveda.', 'cloudflare.ssl')]
  }
  if (!zoneName.trim()) {
    return [unavailable('chk-tls', 'TLS y dominio', 'Cloudflare', 'Falta el nombre de la zona.', 'cloudflare.zone')]
  }

  let zone: Zone | undefined
  try {
    const zoneRes = await fetchJson(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
      { headers: auth(token) },
    )
    if (!zoneRes.ok) {
      return [
        probe({
          id: 'chk-tls',
          code: 'cloudflare.zone',
          label: 'TLS y dominio',
          weight: 10,
          status: zoneRes.status === 401 || zoneRes.status === 403 ? 'unknown' : 'down',
          detail:
            zoneRes.status === 401 || zoneRes.status === 403
              ? 'Token de Cloudflare inválido o sin permiso.'
              : `Cloudflare ${zoneRes.status} al buscar ${zoneName}`,
          source: 'Cloudflare',
        }),
      ]
    }
    const found = asRecord(asArray(asRecord(zoneRes.body)?.result)[0])
    if (found?.id && found.name) {
      zone = { id: String(found.id), name: String(found.name), status: String(found.status ?? '') }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red'
    return [unavailable('chk-tls', 'TLS y dominio', 'Cloudflare', `Cloudflare no respondió · ${reason}`, 'cloudflare.zone')]
  }

  if (!zone) {
    return [
      probe({
        id: 'chk-tls',
        code: 'cloudflare.zone',
        label: 'TLS y dominio',
        weight: 10,
        status: 'down',
        detail: `Zona ${zoneName} no encontrada con este token.`,
        source: 'Cloudflare',
      }),
    ]
  }

  const checks: HealthCheck[] = []
  const sslMode = await setting(zone.id, 'ssl', token).catch(() => undefined)
  const securityLevel = await setting(zone.id, 'security_level', token).catch(() => undefined)
  const weakSsl = sslMode === 'off' || sslMode === 'flexible'
  checks.push(
    probe({
      id: 'chk-tls',
      code: weakSsl ? 'cloudflare.ssl' : 'cloudflare.zone',
      label: 'TLS y dominio',
      weight: 10,
      status: zone.status !== 'active' ? 'degraded' : weakSsl ? 'degraded' : 'healthy',
      detail: `zona ${zone.status}${sslMode ? ` · SSL ${sslMode}` : ''}${securityLevel ? ` · security ${securityLevel}` : ''}`,
      source: 'Cloudflare',
      href: `https://dash.cloudflare.com/?to=/:account/${zone.name}`,
    }),
  )

  if (securityLevel) {
    const exposed = securityLevel === 'essentially_off' || securityLevel === 'off'
    checks.push(
      probe({
        id: 'chk-cf-under-attack',
        code: exposed ? 'cloudflare.ssl' : 'cloudflare.under_attack',
        label: 'Under Attack mode',
        weight: 6,
        status: exposed ? 'degraded' : 'healthy',
        detail:
          securityLevel === 'under_attack'
            ? 'I’m Under Attack está activo'
            : `Security level: ${securityLevel}`,
        source: 'Cloudflare',
      }),
    )
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  try {
    const graphql = await fetchJson('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query Attack($zone: String!, $since: Time!) {
          viewer {
            zones(filter: { zoneTag: $zone }) {
              firewallEventsAdaptiveGroups(limit: 20, filter: { datetime_geq: $since }) {
                count
              }
            }
          }
        }`,
        variables: { zone: zone.id, since },
      }),
    })
    if (!graphql.ok && planLimited(graphql.status)) {
      checks.push(
        unavailable(
          'chk-cf-attack',
          'Eventos de firewall',
          'Cloudflare',
          'Analytics de firewall no está en este plan o el token no tiene Analytics:Read.',
          'cloudflare.attack',
        ),
      )
    } else if (graphql.ok) {
      const errors = asArray(asRecord(graphql.body)?.errors)
      if (errors.length > 0) {
        checks.push(
          unavailable(
            'chk-cf-attack',
            'Eventos de firewall',
            'Cloudflare',
            'GraphQL de firewall no disponible para esta zona.',
            'cloudflare.attack',
          ),
        )
      } else {
        const viewer = asRecord(asRecord(asRecord(graphql.body)?.data)?.viewer)
        const zones = asArray(viewer?.zones)
        const groups = asArray(asRecord(zones[0])?.firewallEventsAdaptiveGroups)
        const total = groups.reduce<number>((sum, item) => sum + Number(asRecord(item)?.count ?? 0), 0)
        checks.push(summarizeFirewall(Number.isFinite(total) ? total : 0))
      }
    }
  } catch {
    checks.push(
      unavailable('chk-cf-attack', 'Eventos de firewall', 'Cloudflare', 'No se pudieron leer eventos de firewall.', 'cloudflare.attack'),
    )
  }

  return checks
}

export async function checkCloudflare(zoneName: string, token?: string): Promise<HealthCheck> {
  const checks = await monitorCloudflare(zoneName, token)
  return checks[0]
}
