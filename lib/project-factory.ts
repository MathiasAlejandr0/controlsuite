import { parseSentrySlug } from './connectors/sentry'
import { inferProjectTag } from './tag'
import { slugify } from './store'
import {
  normalizeCloudflareZone,
  normalizeGithubRepo,
  normalizeSupabaseRef,
  normalizeVercelProject,
} from './connection-ids'
import type { DetectedNeed, Project, ProjectDraft, SecretRef, Service } from './types'

function accountLogin(serviceId: string, loginUrl: string): SecretRef {
  return {
    id: `${serviceId}-login`,
    label: 'Usuario y contraseña',
    vaultUri: `local://${serviceId}-login`,
    field: 'password',
    loginUrl,
  }
}

function service(
  partial: Omit<Service, 'secretRefs' | 'checks' | 'status'> &
    Partial<Pick<Service, 'secretRefs' | 'checks' | 'status'>>,
): Service {
  return {
    ...partial,
    secretRefs: partial.secretRefs ?? [],
    checks: partial.checks ?? [],
    status: partial.status ?? 'unknown',
  }
}

export function uniqueProjectId(name: string, existingIds: Iterable<string> = []) {
  const taken = new Set(existingIds)
  const base = slugify(name) || `proyecto-${Date.now()}`
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function createProjectFromDraft(draft: ProjectDraft, existingIds: Iterable<string> = []): Project {
  const id = uniqueProjectId(draft.name, existingIds)
  const githubRepo = normalizeGithubRepo(draft.githubRepo)
  const vercelProject = normalizeVercelProject(draft.vercelProject)
  const cloudflareZone = normalizeCloudflareZone(draft.cloudflareZone)
  const supabaseRef = normalizeSupabaseRef(draft.supabaseRef)
  const sentryProject = parseSentrySlug(draft.sentryProject)
  const wants = new Set(draft.needs ?? [])
  const services: Service[] = []

  if (vercelProject || wants.has('vercel')) {
    services.push(
      service({
        id: `${id}-vercel`,
        kind: 'vercel',
        name: 'Vercel',
        role: 'Despliegue production',
        status: 'unknown',
        externalId: vercelProject,
        dashboardUrl: 'https://vercel.com',
        secretRefs: [
          accountLogin(`${id}-vercel`, 'https://vercel.com/login'),
          {
            id: `${id}-sec-vercel`,
            label: 'Token de equipo',
            vaultUri: `local://${id}-sec-vercel`,
            field: 'token',
            loginUrl: 'https://vercel.com/login',
          },
        ],
        checks: [],
      }),
    )
  }

  if (githubRepo || wants.has('github')) {
    services.push(
      service({
        id: `${id}-github`,
        kind: 'github',
        name: 'GitHub',
        role: 'Código y CI',
        status: 'unknown',
        externalId: githubRepo,
        dashboardUrl: githubRepo ? `https://github.com/${githubRepo}` : 'https://github.com',
        secretRefs: [
          accountLogin(`${id}-github`, 'https://github.com/login'),
          {
            id: `${id}-sec-github`,
            label: 'PAT',
            vaultUri: `local://${id}-sec-github`,
            field: 'token',
            loginUrl: 'https://github.com/login',
          },
        ],
        checks: [],
      }),
    )
  }

  if (draft.hasDocker || wants.has('docker')) {
    services.push(
      service({
        id: `${id}-docker`,
        kind: 'docker',
        name: 'Docker',
        role: 'Compose y contenedores locales',
        status: 'unknown',
        dashboardUrl: undefined,
        checks: [],
      }),
    )
  }

  if (cloudflareZone || wants.has('cloudflare')) {
    services.push(
      service({
        id: `${id}-cf`,
        kind: 'cloudflare',
        name: 'Cloudflare',
        role: 'DNS y TLS',
        status: 'unknown',
        externalId: cloudflareZone,
        dashboardUrl: 'https://dash.cloudflare.com',
        secretRefs: [
          accountLogin(`${id}-cf`, 'https://dash.cloudflare.com/login'),
          {
            id: `${id}-sec-cf`,
            label: 'API token',
            vaultUri: `local://${id}-sec-cf`,
            field: 'token',
            loginUrl: 'https://dash.cloudflare.com/login',
          },
        ],
        checks: [],
      }),
    )
  }

  if (draft.insforgeProject || wants.has('insforge')) {
    services.push(
      service({
        id: `${id}-insforge`,
        kind: 'insforge',
        name: 'InsForge',
        role: 'Base de datos y auth',
        status: 'unknown',
        externalId: draft.insforgeProject,
        dashboardUrl: draft.insforgeProject
          ? `https://insforge.dev/dashboard/project/${draft.insforgeProject}`
          : 'https://insforge.dev/dashboard',
        secretRefs: [accountLogin(`${id}-insforge`, 'https://insforge.dev/dashboard')],
        checks: [],
      }),
    )
  }

  if (wants.has('email')) {
    services.push(
      service({
        id: `${id}-email`,
        kind: 'email',
        name: 'Correo del proyecto',
        role: 'Buzón y SMTP',
        status: 'unknown',
        accessOnly: true,
        dashboardUrl: undefined,
        secretRefs: [accountLogin(`${id}-email`, '')],
        checks: [],
      }),
    )
  }

  if ((supabaseRef || wants.has('supabase') || wants.has('database')) && !wants.has('insforge') && !draft.insforgeProject) {
    services.push(
      service({
        id: `${id}-supabase`,
        kind: 'supabase',
        name: 'Supabase',
        role: 'Base de datos y auth',
        status: 'unknown',
        externalId: supabaseRef,
        dashboardUrl: `https://supabase.com/dashboard/project/${supabaseRef}`,
        secretRefs: [accountLogin(`${id}-supabase`, 'https://supabase.com/dashboard')],
        checks: [],
      }),
    )
  }

  if (sentryProject || wants.has('sentry')) {
    services.push(
      service({
        id: `${id}-sentry`,
        kind: 'sentry',
        name: 'Sentry',
        role: 'Errores de producción',
        status: 'unknown',
        externalId: sentryProject,
        dashboardUrl: `https://sentry.io/organizations/${sentryProject.split('/')[0]}/`,
        secretRefs: [accountLogin(`${id}-sentry`, 'https://sentry.io/auth/login/')],
        checks: [],
      }),
    )
  }

  const localPath = draft.localPath.trim()
  return {
    id,
    name: draft.name.trim(),
    kind: draft.kind,
    tag: draft.tag ?? inferProjectTag(localPath),
    summary: draft.summary?.trim() || 'Sin descripción.',
    localPath,
    branch: draft.branch?.trim() || 'main',
    productionUrl: draft.productionUrl?.trim() || undefined,
    uptime: '—',
    lastActivity: new Date().toISOString(),
    services,
  }
}

const NEED_KIND: Record<Exclude<DetectedNeed, 'database'>, { kind: Service['kind']; name: string; role: string }> = {
  github: { kind: 'github', name: 'GitHub', role: 'Código y CI' },
  vercel: { kind: 'vercel', name: 'Vercel', role: 'Despliegue production' },
  cloudflare: { kind: 'cloudflare', name: 'Cloudflare', role: 'DNS y TLS' },
  supabase: { kind: 'supabase', name: 'Supabase', role: 'Base de datos y auth' },
  insforge: { kind: 'insforge', name: 'InsForge', role: 'Base de datos y auth' },
  email: { kind: 'email', name: 'Correo del proyecto', role: 'Buzón y SMTP' },
  sentry: { kind: 'sentry', name: 'Sentry', role: 'Errores de producción' },
  docker: { kind: 'docker', name: 'Docker', role: 'Compose y contenedores locales' },
}

const DROPPABLE = new Set(['vercel', 'cloudflare', 'supabase', 'insforge', 'sentry', 'email'])

export function dropCloudServicesNotInNeeds(project: Project, needs: DetectedNeed[]): Project {
  const wanted = new Set(needs.map((need) => (need === 'database' ? 'supabase' : need)))
  return {
    ...project,
    services: project.services.filter((service) => {
      if (!DROPPABLE.has(service.kind)) return true
      return wanted.has(service.kind as DetectedNeed)
    }),
  }
}

export function ensureNeedServices(project: Project, needs: DetectedNeed[]): Project {
  const next: Project = { ...project, services: project.services.map((item) => ({ ...item })) }
  for (const need of needs) {
    const key = need === 'database' ? 'supabase' : need
    const meta = NEED_KIND[key]
    if (!meta) continue
    if (next.services.some((item) => item.kind === meta.kind)) continue
    next.services.push(
      service({
        id: `${next.id}-${meta.kind}`,
        kind: meta.kind,
        name: meta.name,
        role: meta.role,
        status: 'unknown',
        dashboardUrl:
          meta.kind === 'github'
            ? 'https://github.com'
            : meta.kind === 'vercel'
              ? 'https://vercel.com'
              : meta.kind === 'cloudflare'
                ? 'https://dash.cloudflare.com'
                : meta.kind === 'supabase'
                  ? 'https://supabase.com/dashboard'
                  : meta.kind === 'insforge'
                    ? 'https://insforge.dev/dashboard'
                    : meta.kind === 'sentry'
                    ? 'https://sentry.io'
                    : undefined,
        checks: [],
      }),
    )
  }
  return next
}
