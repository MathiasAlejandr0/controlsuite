import { monitorCloudflare } from './connectors/cloudflare'
import { checkDocker, composeFileFor } from './connectors/docker'
import { checkGithub } from './connectors/github'
import { checkHttp } from './connectors/http'
import { monitorSentry } from './connectors/sentry'
import { checkInsforge } from './connectors/insforge'
import { monitorSupabase } from './connectors/supabase'
import { checkTls } from './connectors/tls'
import { monitorVercel } from './connectors/vercel'
import { ensureNeedServices } from './project-factory'
import { reconcileProjectFromDisk } from './reconcile'
import { appendHistory } from './history'
import { notifyNewIncidents } from './notify'
import { loadCredentials } from './credentials'
import { githubAccessToken } from './github-access'
import { serviceStatus } from './health'
import { detectedIncidents, mergeIncidents } from './incidents'
import { loadWorkspace, saveWorkspace } from './store'
import { withLock } from './lock'
import type { ActivityItem, Credentials, HealthCheck, Project, Service, WorkspaceData } from './types'

function upsertCheck(service: Service, check: HealthCheck) {
  const index = service.checks.findIndex((item) => item.id === check.id)
  if (index >= 0) service.checks[index] = check
  else service.checks.push(check)
}

function ensureUptimeService(project: Project): Service {
  const existing = project.services.find((service) => service.kind === 'uptime')
  if (existing) return existing
  const created: Service = {
    id: `${project.id}-uptime`,
    kind: 'uptime',
    name: 'Producción HTTP',
    role: 'Uptime público',
    status: 'unknown',
    secretRefs: [],
    checks: [],
  }
  project.services.unshift(created)
  return created
}

function ensureDockerService(project: Project): Service | undefined {
  const existing = project.services.find((service) => service.kind === 'docker')
  if (existing) return existing
  const hasCompose = Boolean(project.localPath && !project.localPath.startsWith('github://') && composeFileFor(project.localPath))
  if (!hasCompose) return undefined
  const next = ensureNeedServices(project, ['docker'])
  project.services = next.services
  return project.services.find((service) => service.kind === 'docker')
}

function stripUptimeFromOthers(project: Project) {
  for (const service of project.services) {
    if (service.kind === 'uptime') continue
    service.checks = service.checks.filter((check) => check.id !== 'chk-uptime')
  }
}

export type RefreshMode = 'public' | 'full'

async function refreshProject(project: Project, mode: RefreshMode) {
  const creds: Credentials =
    mode === 'full' ? loadCredentials() : { integrations: {}, secrets: {} }
  const githubToken = mode === 'full' ? await githubAccessToken() : undefined
  const next: Project = {
    ...project,
    services: project.services.map((service) => ({
      ...service,
      checks: [...service.checks],
      secretRefs: [...service.secretRefs],
    })),
  }
  stripUptimeFromOthers(next)
  ensureDockerService(next)

  const jobs: Array<Promise<void>> = []

  if (next.productionUrl) {
    const uptime = ensureUptimeService(next)
    jobs.push(
      checkHttp(next.productionUrl).then((check) => {
        upsertCheck(uptime, check)
        next.uptime = check.status === 'healthy' ? 'online' : check.status === 'down' ? 'down' : next.uptime
      }),
    )
    jobs.push(
      checkTls(next.productionUrl).then((check) => {
        const cloudflare = next.services.find((service) => service.kind === 'cloudflare')
        if (cloudflare && creds.integrations.cloudflare) return
        upsertCheck(cloudflare ?? uptime, check)
      }),
    )
  }

  for (const service of next.services) {
    if (service.accessOnly) continue
    if (mode !== 'full') {
      if (service.kind === 'docker') {
        jobs.push(
          checkDocker(next.localPath, next.name).then((checks) => {
            checks.forEach((check) => upsertCheck(service, check))
          }),
        )
      }
      continue
    }
    if (service.kind === 'github') {
      jobs.push(
        checkGithub(service.externalId?.trim() ?? '', githubToken).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
    if (service.kind === 'vercel') {
      jobs.push(
        monitorVercel(service.externalId ?? '', creds.integrations.vercel, creds.vercelTeamId).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
    if (service.kind === 'cloudflare' && service.externalId && creds.integrations.cloudflare) {
      jobs.push(
        monitorCloudflare(service.externalId, creds.integrations.cloudflare).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
    if (service.kind === 'supabase') {
      jobs.push(
        monitorSupabase(service.externalId ?? '', creds.integrations.supabase).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
    if (service.kind === 'insforge') {
      jobs.push(
        checkInsforge(service.externalId ?? '', creds.integrations.insforge).then((check) =>
          upsertCheck(service, check),
        ),
      )
    }
    if (service.kind === 'docker') {
      jobs.push(
        checkDocker(next.localPath, next.name).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
    if (service.kind === 'sentry') {
      jobs.push(
        monitorSentry(service.externalId ?? '', creds.integrations.sentry).then((checks) => {
          checks.forEach((check) => upsertCheck(service, check))
        }),
      )
    }
  }

  await Promise.allSettled(jobs)
  next.services = next.services.map((service) => ({
    ...service,
    status: serviceStatus(service),
  }))
  next.lastSyncedAt = new Date().toISOString()
  next.lastActivity = next.lastSyncedAt
  return next
}

function activitiesFrom(projects: Project[], previous: ActivityItem[]): ActivityItem[] {
  const fresh: ActivityItem[] = projects.slice(0, 8).map((project) => ({
    id: `sync-${project.id}-${project.lastSyncedAt ?? Date.now()}`,
    projectId: project.id,
    title: `Sync ${project.name}`,
    detail: `${project.services.filter((service) => !service.accessOnly).length} servicios chequeados`,
    tone: 'blue',
    at: project.lastSyncedAt ?? new Date().toISOString(),
  }))
  return [...fresh, ...previous].slice(0, 20)
}

export async function refreshWorkspace(
  projectIds?: string | string[],
  options?: { mode?: RefreshMode; reconcile?: boolean },
): Promise<WorkspaceData> {
  const mode = options?.mode ?? 'full'
  const snapshot = loadWorkspace()
  const wanted =
    projectIds === undefined
      ? undefined
      : new Set(typeof projectIds === 'string' ? [projectIds] : projectIds)
  const targets = wanted
    ? snapshot.projects.filter((project) => wanted.has(project.id))
    : snapshot.projects
  const prepared = options?.reconcile ? targets.map(reconcileProjectFromDisk) : targets

  const updated = await Promise.all(prepared.map((project) => refreshProject(project, mode)))
  const byId = new Map(updated.map((project) => [project.id, project]))

  return withLock(() => {
    const latest = loadWorkspace()
    const previousIncidents = latest.incidents
    latest.projects = latest.projects.map((project) => byId.get(project.id) ?? project)
    latest.incidents = mergeIncidents(latest.incidents, detectedIncidents(latest.projects))
    latest.activities = activitiesFrom(updated, latest.activities)
    latest.lastSyncedAt = new Date().toISOString()
    saveWorkspace(latest)
    appendHistory(updated)
    notifyNewIncidents(previousIncidents, latest.incidents)
    return latest
  })
}
