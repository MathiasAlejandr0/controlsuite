import type { HealthCheck } from '../types'

type VercelDeployment = {
  readyState?: string
  state?: string
  url?: string
  createdAt?: number
}

export async function checkVercel(
  project: string,
  token?: string,
  teamId?: string,
): Promise<HealthCheck> {
  if (!token) {
    return {
      id: 'chk-deploy',
      label: 'Deploy listo',
      weight: 25,
      status: 'unknown',
      detail: 'Falta token de Vercel en Ajustes.',
      source: 'Vercel',
    }
  }

  const params = new URLSearchParams({ limit: '1' })
  if (project) params.set('app', project)
  if (teamId) params.set('teamId', teamId)

  const response = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    return {
      id: 'chk-deploy',
      label: 'Deploy listo',
      weight: 25,
      status: response.status === 403 || response.status === 401 ? 'unknown' : 'down',
      detail: `Vercel ${response.status}. Revisá el token o el nombre del proyecto.`,
      source: 'Vercel',
    }
  }

  const payload = (await response.json()) as { deployments?: VercelDeployment[] }
  const deploy = payload.deployments?.[0]
  if (!deploy) {
    return {
      id: 'chk-deploy',
      label: 'Deploy listo',
      weight: 25,
      status: 'unknown',
      detail: `Sin deployments para ${project || 'este token'}.`,
      source: 'Vercel',
    }
  }

  const state = deploy.readyState ?? deploy.state ?? 'UNKNOWN'
  const status =
    state === 'READY' ? 'healthy' : state === 'ERROR' || state === 'CANCELED' ? 'down' : 'degraded'

  return {
    id: 'chk-deploy',
    label: 'Deploy listo',
    weight: 25,
    status,
    detail: `${state}${deploy.url ? ` · ${deploy.url}` : ''}`,
    source: 'Vercel',
  }
}
