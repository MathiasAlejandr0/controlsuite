import {
  normalizeCloudflareZone,
  normalizeGithubRepo,
  normalizeSupabaseRef,
  normalizeVercelProject,
} from './connection-ids'
import { parseSentrySlug } from './connectors/sentry'
import type { ProjectPatch } from './schemas'
import type { Project, Service, ServiceKind } from './types'

function upsertExternal(project: Project, kind: ServiceKind, name: string, role: string, value?: string) {
  if (value === undefined) return
  const externalId = value.trim() || undefined
  const existing = project.services.find((service) => service.kind === kind)
  if (existing) {
    existing.externalId = externalId
    return
  }
  if (!externalId) return
  const created: Service = {
    id: `${project.id}-${kind}`,
    kind,
    name,
    role,
    status: 'unknown',
    externalId,
    secretRefs: [],
    checks: [],
  }
  project.services.push(created)
}

export function applyProjectPatch(project: Project, patch: ProjectPatch): Project {
  const next: Project = {
    ...project,
    services: project.services.map((service) => ({ ...service })),
  }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.kind !== undefined) next.kind = patch.kind
  if (patch.summary !== undefined) next.summary = patch.summary
  if (patch.localPath !== undefined) next.localPath = patch.localPath
  if (patch.branch !== undefined) next.branch = patch.branch
  if (patch.productionUrl !== undefined) next.productionUrl = patch.productionUrl.trim() || undefined
  if (patch.tag !== undefined) next.tag = patch.tag
  if (patch.autoCompose !== undefined) next.autoCompose = patch.autoCompose
  if (patch.autoPull !== undefined) next.autoPull = patch.autoPull
  upsertExternal(next, 'github', 'GitHub', 'Código y CI', normalizeGithubRepo(patch.githubRepo) ?? patch.githubRepo)
  upsertExternal(
    next,
    'vercel',
    'Vercel',
    'Despliegue production',
    normalizeVercelProject(patch.vercelProject) ?? patch.vercelProject,
  )
  upsertExternal(
    next,
    'cloudflare',
    'Cloudflare',
    'DNS y TLS',
    normalizeCloudflareZone(patch.cloudflareZone) ?? patch.cloudflareZone,
  )
  upsertExternal(
    next,
    'supabase',
    'Supabase',
    'Base de datos y auth',
    normalizeSupabaseRef(patch.supabaseRef) ?? patch.supabaseRef,
  )
  upsertExternal(next, 'insforge', 'InsForge', 'Base de datos y auth', patch.insforgeProject)
  upsertExternal(
    next,
    'sentry',
    'Sentry',
    'Errores de producción',
    parseSentrySlug(patch.sentryProject) ?? patch.sentryProject,
  )
  return next
}
