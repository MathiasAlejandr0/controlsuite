import type { HealthCheck } from '../types'

export async function checkInsforge(projectId: string, token?: string): Promise<HealthCheck> {
  if (!token) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: 'unknown',
      detail: 'Falta autorizar InsForge.',
      source: 'InsForge',
    }
  }
  if (!projectId.trim()) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: 'healthy',
      detail: 'Sesión InsForge en la bóveda. Falta el project id para chequear la API.',
      source: 'InsForge',
    }
  }
  const response = await fetch(`https://insforge.dev/dashboard/project/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'suite-control' },
    cache: 'no-store',
    redirect: 'manual',
  })
  if (response.status === 401 || response.status === 403) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: 'unknown',
      detail: 'InsForge 401. El acceso no es válido.',
      source: 'InsForge',
    }
  }
  return {
    id: 'chk-db',
    label: 'Base de datos',
    weight: 15,
    status: response.status >= 400 ? 'degraded' : 'healthy',
    detail: `Proyecto ${projectId} · sesión en la bóveda`,
    source: 'InsForge',
  }
}
