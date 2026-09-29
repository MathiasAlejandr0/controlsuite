import { composeUp } from './compose-act'
import { syncProjectGit } from './git-sync'
import { projectStatus } from './health'
import { notifyWindows } from './notify'
import { loadOps, queueRemediations, queuedRemediations, saveOps } from './ops'
import { refreshWorkspace } from './refresh'
import { staleSecrets } from './secrets-hygiene'
import { loadWorkspace } from './store'
import { ensureWatchdogKey } from './watchdog-auth'
import type { HealthStatus } from './types'

const TICK_GAP_MS = 3 * 60 * 1000
const STALE_GAP_MS = 24 * 60 * 60 * 1000

export type WatchdogStatus = {
  skipped?: boolean
  lastTickAt?: string
  tone: HealthStatus
  down: number
  degraded: number
  queued: number
  actions: string[]
}

function overallTone(projects: ReturnType<typeof loadWorkspace>['projects']): HealthStatus {
  if (projects.some((project) => projectStatus(project) === 'down')) return 'down'
  if (projects.some((project) => projectStatus(project) === 'degraded')) return 'degraded'
  if (projects.length === 0) return 'unknown'
  if (projects.every((project) => projectStatus(project) === 'unknown')) return 'unknown'
  return 'healthy'
}

export function readWatchdogStatus(): WatchdogStatus {
  const data = loadWorkspace()
  const ops = loadOps()
  const tone = ops.tone ?? overallTone(data.projects)
  return {
    lastTickAt: ops.lastTickAt,
    tone,
    down: ops.down ?? data.projects.filter((project) => projectStatus(project) === 'down').length,
    degraded: ops.degraded ?? data.projects.filter((project) => projectStatus(project) === 'degraded').length,
    queued: queuedRemediations(ops).length,
    actions: [],
  }
}

export async function runWatchdogTick(): Promise<WatchdogStatus> {
  ensureWatchdogKey()
  const ops = loadOps()
  const now = Date.now()
  if (ops.lastTickAt && now - Date.parse(ops.lastTickAt) < TICK_GAP_MS) {
    return { skipped: true, ...readWatchdogStatus() }
  }

  const before = loadWorkspace()
  const data = await refreshWorkspace(undefined, { mode: 'public', reconcile: true })
  queueRemediations(data.incidents)
  const actions: string[] = []

  for (const project of data.projects) {
    const dockerDown = project.services.some(
      (service) => service.kind === 'docker' && (service.status === 'down' || service.status === 'degraded'),
    )
    if (project.autoCompose && dockerDown) {
      const result = await composeUp(project.localPath, data.profile.scanRoots)
      if (result.ok) actions.push(`compose ${project.name}`)
    }
    if (project.autoPull) {
      const result = await syncProjectGit(project, data.profile.scanRoots)
      if (result.ok) actions.push(`git ${project.name}`)
    }
  }

  const stale = staleSecrets(data.projects)
  if (stale.length > 0 && (!ops.lastStaleNotifyAt || now - Date.parse(ops.lastStaleNotifyAt) > STALE_GAP_MS)) {
    notifyWindows('Suite Control · secretos', `${stale.length} accesos sin rotar en 90 días.`)
    ops.lastStaleNotifyAt = new Date().toISOString()
  }

  const tone = overallTone(data.projects)
  const down = data.projects.filter((project) => projectStatus(project) === 'down').length
  const degraded = data.projects.filter((project) => projectStatus(project) === 'degraded').length
  const nextOps = loadOps()
  nextOps.lastTickAt = new Date().toISOString()
  nextOps.lastStaleNotifyAt = ops.lastStaleNotifyAt
  nextOps.tone = tone
  nextOps.down = down
  nextOps.degraded = degraded
  saveOps(nextOps)

  if (before.lastSyncedAt && tone === 'down') {
    // el balloon de incidentes nuevos ya corre en refresh
  }

  return {
    lastTickAt: nextOps.lastTickAt,
    tone,
    down,
    degraded,
    queued: queuedRemediations(nextOps).length,
    actions,
  }
}
