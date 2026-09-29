import { isLiveProject } from './health'
import type { HealthCheck, Incident, IncidentSeverity, Project, Service } from './types'

const RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const CRITICAL_WHEN_DOWN = new Set(['http.uptime', 'tls.expiry', 'supabase.status'])

export function severityForCheck(check: HealthCheck): IncidentSeverity | null {
  if (check.status === 'healthy' || check.status === 'unknown') return null
  const code = check.code ?? check.id
  if (code === 'github.pulls') return 'low'
  if (code === 'supabase.perf') return check.status === 'down' ? 'medium' : 'low'
  if (code === 'cloudflare.attack' || code === 'github.secrets') return 'critical'
  if (check.status === 'down' && CRITICAL_WHEN_DOWN.has(code)) return 'critical'
  if (check.status === 'down') return 'high'
  return 'medium'
}

export function alertFromCheck(
  project: Project,
  service: Service,
  check: HealthCheck,
  now = new Date().toISOString(),
): Incident | null {
  const severity = severityForCheck(check)
  if (!severity) return null
  return {
    id: `${project.id}-${check.id}`,
    projectId: project.id,
    title: `${check.label} · ${project.name}`,
    detail: check.detail,
    environment: isLiveProject(project) ? 'production' : 'local',
    status: 'open',
    severity,
    source: check.source || service.name,
    code: check.code ?? check.id,
    href: check.href,
    detectedAt: project.lastSyncedAt ?? now,
    lastSeenAt: now,
  }
}

export function dedupeAlerts(items: Incident[]) {
  const map = new Map<string, Incident>()
  for (const item of items) {
    const previous = map.get(item.id)
    if (!previous || RANK[item.severity] < RANK[previous.severity]) map.set(item.id, item)
  }
  return [...map.values()]
}

export function sortAlerts(items: Incident[]) {
  return [...items].sort((a, b) => {
    const ack = Number(Boolean(a.acknowledgedAt)) - Number(Boolean(b.acknowledgedAt))
    if (ack !== 0) return ack
    const severity = RANK[a.severity] - RANK[b.severity]
    if (severity !== 0) return severity
    return (b.lastSeenAt ?? b.detectedAt).localeCompare(a.lastSeenAt ?? a.detectedAt)
  })
}

export function isSecurityAlert(incident: Incident) {
  const code = incident.code ?? ''
  return (
    code.startsWith('cloudflare.') ||
    code === 'github.secrets' ||
    code === 'github.dependabot' ||
    code === 'tls.expiry' ||
    code === 'sentry.spike' ||
    code === 'vercel.firewall'
  )
}
