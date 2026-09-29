import { isLiveProject } from './health'
import type { Incident, Project } from './types'

export function detectedIncidents(projects: Project[]): Incident[] {
  const now = new Date().toISOString()
  const incidents: Incident[] = []
  for (const project of projects) {
    for (const service of project.services) {
      for (const check of service.checks) {
        if (check.status === 'healthy' || check.status === 'unknown') continue
        incidents.push({
          id: `${project.id}-${check.id}`,
          projectId: project.id,
          title: `${check.label} · ${project.name}`,
          detail: check.detail,
          environment: isLiveProject(project) ? 'production' : 'local',
          status: 'open',
          severity: check.status === 'down' ? 'critical' : 'high',
          detectedAt: project.lastSyncedAt ?? now,
          lastSeenAt: now,
        })
      }
    }
  }
  return incidents
}

export function mergeIncidents(previous: Incident[], detected: Incident[]): Incident[] {
  const prev = new Map(previous.map((item) => [item.id, item]))
  const next: Incident[] = []

  for (const item of detected) {
    const old = prev.get(item.id)
    if (old) {
      next.push({
        ...old,
        title: item.title,
        detail: item.detail,
        severity: item.severity,
        lastSeenAt: item.lastSeenAt,
        status: old.status === 'resolved' ? 'open' : old.status,
        resolvedAt: old.status === 'resolved' ? undefined : old.resolvedAt,
      })
      prev.delete(item.id)
    } else {
      next.push(item)
    }
  }

  for (const leftover of prev.values()) {
    if (leftover.status === 'resolved') {
      next.push(leftover)
      continue
    }
    next.push({
      ...leftover,
      status: 'resolved',
      resolvedAt: leftover.resolvedAt ?? new Date().toISOString(),
    })
  }

  const open = next.filter((item) => item.status !== 'resolved')
  const resolved = next
    .filter((item) => item.status === 'resolved')
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
    .slice(0, 30)
  return [...open, ...resolved]
}

export function openIncidents(incidents: Incident[]) {
  return incidents.filter((item) => item.status !== 'resolved')
}
