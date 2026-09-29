import { NextResponse } from 'next/server'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import { denyIfLocked } from '@/lib/guard'
import { providerMocksEnabled } from '@/lib/service-link'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import type { HealthCheck, Service } from '@/lib/types'

export const runtime = 'nodejs'

function check(id: string, status: HealthCheck['status'], detail: string): HealthCheck {
  return { id, label: id, weight: 1, status, detail, source: 'demo', code: id }
}

function service(projectId: string, kind: Service['kind'], name: string, externalId: string | undefined, checks: HealthCheck[]): Service {
  return {
    id: `${projectId}-${kind}`,
    kind,
    name,
    role: externalId ?? 'Sin recurso',
    status: checks.some((item) => item.status === 'down') ? 'down' : checks.length ? 'healthy' : 'unknown',
    externalId,
    secretRefs: [],
    checks,
  }
}

export async function POST(request: Request) {
  if (!providerMocksEnabled()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const denied = denyIfLocked(request)
  if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { projectId?: string }
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === body.projectId) ?? data.projects[0]
  if (!project) return NextResponse.json({ error: 'No hay proyecto.' }, { status: 404 })

  const long = 'MathiasAlejandr0/MyWorksAppProject-nombre-largo'
  project.services = [
    service(project.id, 'github', 'GitHub', long, [check('github', 'healthy', 'ok')]),
    service(project.id, 'vercel', 'Vercel', undefined, []),
    service(project.id, 'supabase', 'Supabase', 'abcdefghijklmnop', [check('supabase', 'down', '401 sin permiso de lectura')]),
    service(project.id, 'cloudflare', 'Cloudflare', undefined, []),
    service(project.id, 'sentry', 'Sentry', 'acme/web', [check('sentry', 'healthy', 'ok')]),
  ]
  project.summary = 'Estados de conexión de prueba'
  const incidentId = `${project.id}-demo`
  if (!data.incidents.some((item) => item.id === incidentId)) {
    data.incidents.unshift({
      id: incidentId,
      projectId: project.id,
      title: 'Supabase rechazó el token',
      detail: '401 sin permiso de lectura',
      environment: 'production',
      status: 'open',
      severity: 'high',
      detectedAt: new Date().toISOString(),
      source: 'Supabase',
      code: 'supabase',
    })
  }
  saveWorkspace(data)

  const creds = loadCredentials()
  creds.integrations.github = 'suite-mock-ok'
  creds.integrations.supabase = 'suite-mock-ok'
  creds.integrations.sentry = 'suite-mock-ok'
  delete creds.integrations.vercel
  delete creds.integrations.cloudflare
  saveCredentials(creds)
  return NextResponse.json({ ok: true, projectId: project.id })
}
