import type { HealthCheck } from '../types'

type Zone = {
  id: string
  name: string
  status: string
}

export async function checkCloudflare(zoneName: string, token?: string): Promise<HealthCheck> {
  if (!token) {
    return {
      id: 'chk-tls',
      label: 'TLS y dominio',
      weight: 10,
      status: 'unknown',
      detail: 'Falta token de Cloudflare en Ajustes.',
      source: 'Cloudflare',
    }
  }

  const zoneRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  )
  if (!zoneRes.ok) {
    return {
      id: 'chk-tls',
      label: 'TLS y dominio',
      weight: 10,
      status: 'unknown',
      detail: `Cloudflare ${zoneRes.status} al buscar ${zoneName}`,
      source: 'Cloudflare',
    }
  }

  const zoneJson = (await zoneRes.json()) as { result?: Zone[] }
  const zone = zoneJson.result?.[0]
  if (!zone) {
    return {
      id: 'chk-tls',
      label: 'TLS y dominio',
      weight: 10,
      status: 'down',
      detail: `Zona ${zoneName} no encontrada con este token.`,
      source: 'Cloudflare',
    }
  }

  const sslRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/ssl/certificate_packs`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  let sslDetail = `zona ${zone.status}`
  if (sslRes.ok) {
    const sslJson = (await sslRes.json()) as {
      result?: Array<{ status?: string; expires_on?: string }>
    }
    const pack = sslJson.result?.[0]
    if (pack?.expires_on) {
      const days = Math.round(
        (new Date(pack.expires_on).getTime() - Date.now()) / 86_400_000,
      )
      sslDetail = `TLS ${pack.status ?? 'ok'} · vence en ${days} días`
      return {
        id: 'chk-tls',
        label: 'TLS y dominio',
        weight: 10,
        status: days < 14 ? 'degraded' : zone.status === 'active' ? 'healthy' : 'degraded',
        detail: sslDetail,
        source: 'Cloudflare',
      }
    }
  }

  return {
    id: 'chk-tls',
    label: 'TLS y dominio',
    weight: 10,
    status: zone.status === 'active' ? 'healthy' : 'degraded',
    detail: sslDetail,
    source: 'Cloudflare',
  }
}
