import type { HealthCheck } from '../types'

type SupabaseProject = {
  id?: string
  name?: string
  status?: string
  region?: string
}

export async function checkSupabase(ref: string, token?: string): Promise<HealthCheck> {
  if (!token) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: 'unknown',
      detail: 'Falta token de Supabase en Ajustes.',
      source: 'Supabase',
    }
  }
  if (!ref.trim()) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: 'unknown',
      detail: 'Falta ref del proyecto (externalId).',
      source: 'Supabase',
    }
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    return {
      id: 'chk-db',
      label: 'Base de datos',
      weight: 15,
      status: response.status === 401 || response.status === 403 ? 'unknown' : 'down',
      detail: `Supabase ${response.status} al leer ${ref}`,
      source: 'Supabase',
    }
  }

  const project = (await response.json()) as SupabaseProject
  const active = (project.status ?? '').toLowerCase() === 'active_healthy' || project.status === 'ACTIVE_HEALTHY'
  return {
    id: 'chk-db',
    label: 'Base de datos',
    weight: 15,
    status: active ? 'healthy' : 'degraded',
    detail: `${project.name ?? ref} · ${project.status ?? 'sin status'}${project.region ? ` · ${project.region}` : ''}`,
    source: 'Supabase',
  }
}
