import type { AuditEvent, HealthStatus, IncidentSeverity, ServiceKind } from './types'

export const serviceMeta: Record<
  ServiceKind,
  { label: string; tone: 'violet' | 'orange' | 'blue' | 'cyan' | 'green' | 'amber' | 'rose' }
> = {
  github: { label: 'GitHub', tone: 'violet' },
  vercel: { label: 'Vercel', tone: 'cyan' },
  cloudflare: { label: 'Cloudflare', tone: 'orange' },
  supabase: { label: 'Supabase', tone: 'green' },
  insforge: { label: 'InsForge', tone: 'green' },
  email: { label: 'Correo', tone: 'amber' },
  sentry: { label: 'Sentry', tone: 'rose' },
  hostinger: { label: 'Hostinger', tone: 'violet' },
  expo: { label: 'Expo', tone: 'orange' },
  firebase: { label: 'Firebase', tone: 'amber' },
  aws: { label: 'AWS', tone: 'orange' },
  railway: { label: 'Railway', tone: 'violet' },
  neon: { label: 'Neon', tone: 'cyan' },
  instagram: { label: 'Instagram', tone: 'rose' },
  meta: { label: 'Meta Ads', tone: 'blue' },
  x: { label: 'X', tone: 'blue' },
  uptime: { label: 'HTTP', tone: 'green' },
  docker: { label: 'Docker', tone: 'blue' },
}

export function incidentStatusLabel(status: string) {
  switch (status) {
    case 'open':
      return 'Abierto'
    case 'acknowledged':
      return 'Visto'
    case 'fixing':
      return 'En curso'
    case 'resolved':
      return 'Resuelto'
    default:
      return status
  }
}

export function environmentLabel(value: string) {
  if (value === 'production') return 'producción'
  if (value === 'local') return 'local'
  return value
}

export function uptimeLabel(value: string) {
  if (value === 'online') return 'en línea'
  if (value === 'down') return 'caído'
  if (value === 'degraded') return 'degradado'
  return value
}

export function auditTypeLabel(type: AuditEvent['type'] | string) {
  switch (type) {
    case 'secret.revealed':
      return 'Secreto revelado'
    case 'access.saved':
      return 'Acceso guardado'
    case 'cursor.opened':
      return 'Abrió en Cursor'
    case 'project.opened':
      return 'Proyecto abierto'
    case 'incident.resolved':
      return 'Incidente resuelto'
    case 'project.deleted':
      return 'Proyecto sacado'
    case 'integration.linked':
      return 'Cuenta enlazada'
    default:
      return type
  }
}

export function healthStatusLabel(status: HealthStatus) {
  switch (status) {
    case 'healthy':
      return 'Sano'
    case 'degraded':
      return 'Degradado'
    case 'down':
      return 'Caído'
    case 'unknown':
      return 'Sin medir'
  }
}

export function severityLabel(severity: IncidentSeverity) {
  switch (severity) {
    case 'critical':
      return 'Crítica'
    case 'high':
      return 'Alta'
    case 'medium':
      return 'Media'
    case 'low':
      return 'Baja'
  }
}

export function buildCursorBrief(input: {
  projectName: string
  localPath: string
  branch: string
  score: number
  status: string
  failing: string[]
}) {
  return [
    `# Tarea de remediación · ${input.projectName}`,
    '',
    `- Path: ${input.localPath}`,
    `- Branch: ${input.branch}`,
    `- Score: ${input.score}/100 · ${input.status}`,
    '',
    '## Checks en rojo',
    ...input.failing.map((line) => `- ${line}`),
    '',
    'Reproduce, parchea, no rediseñes.',
  ].join('\n')
}
