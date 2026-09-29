import { alertFromCheck, dedupeAlerts } from './alerts'
import type { Incident, Project } from './types'

export function detectedIncidents(projects: Project[]): Incident[] {
  const now = new Date().toISOString()
  const incidents: Incident[] = []
  for (const project of projects) {
    for (const service of project.services) {
      if (service.accessOnly) continue
      for (const check of service.checks) {
        const alert = alertFromCheck(project, service, check, now)
        if (alert) incidents.push(alert)
      }
    }
  }
  return dedupeAlerts(incidents)
}

export function mergeIncidents(previous: Incident[], detected: Incident[]): Incident[] {
  const prev = new Map(previous.map((item) => [item.id, item]))
  const next: Incident[] = []

  for (const item of detected) {
    const old = prev.get(item.id)
    if (old) {
      const reopened = old.status === 'resolved'
      next.push({
        ...old,
        title: item.title,
        detail: item.detail,
        severity: item.severity,
        source: item.source,
        code: item.code,
        href: item.href,
        lastSeenAt: item.lastSeenAt,
        status: reopened ? 'open' : old.status,
        resolvedAt: reopened ? undefined : old.resolvedAt,
        acknowledgedAt: reopened ? undefined : old.acknowledgedAt,
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
