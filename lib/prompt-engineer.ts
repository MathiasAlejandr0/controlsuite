import { kindLabel, projectChecks, projectCoverage, projectScore, projectStatus, statusLabel } from './health'
import type { HealthCheck, HealthStatus, Incident, Project, Service } from './types'

const PLAYBOOKS: Record<string, { meaning: string; investigate: string; avoid: string }> = {
  'chk-uptime': {
    meaning: 'El origen público no está devolviendo 2xx a tiempo. Es un fallo de runtime o de edge, no de “falta token”.',
    investigate:
      'Reproducí el GET contra productionUrl. Revisá el servidor/origen (Hostinger, Vercel, reverse proxy), variables de entorno de producción, healthcheck, y el último deploy. Si hay 5xx, partí de logs del proceso y de la última release.',
    avoid: 'No reescribas el stack ni cambies DNS “por las dudas”.',
  },
  'chk-tls': {
    meaning: 'El certificado, la cadena o el dominio no cierran bien en el chequeo TLS.',
    investigate:
      'Confirmá el host que responde, expiración del cert, cadena intermedia, y si Cloudflare/proxy está en modo flexible vs full. Revisá redirects HTTP→HTTPS.',
    avoid: 'No regeneres certificados a ciegas ni toques nameservers sin evidencia.',
  },
  'chk-deploy': {
    meaning: 'Vercel no tiene un deployment listo o el último build falló.',
    investigate:
      'Abrí el último deployment, leé el log de build, y contrastá con package.json / next.config. Buscá el commit que rompió el build.',
    avoid: 'No hagas redeploy vacío sin entender el error de build.',
  },
  'chk-ci': {
    meaning: 'GitHub Actions o el estado de CI del repo está en rojo.',
    investigate:
      'Abrí el workflow fallido en .github/workflows, reproducí el job en local si es barato, y parcheá el test o el script. No silencies el check.',
    avoid: 'No borres el workflow ni pongas continue-on-error para “poner verde”.',
  },
  'chk-repo': {
    meaning: 'El conector no ve el repositorio (id mal formado, sin acceso, o el repo no existe).',
    investigate:
      'Confirmá owner/repo en Conexiones de Suite Control y que el remote local coincida. Si el repo está bien, el fallo puede ser de permisos del PAT, no del código.',
    avoid: 'No crees un repo nuevo ni force-pushees.',
  },
  'chk-db': {
    meaning: 'Supabase/Management API no confirma la base o el proyecto está pausado/inaccesible.',
    investigate:
      'Revisá migraciones recientes, RLS, el ref del proyecto, y si el proyecto está paused. Contrastá DATABASE_URL de producción sin imprimir el secreto.',
    avoid: 'No resetees la base ni toques RLS de más.',
  },
  'chk-docker': {
    meaning: 'Docker Desktop/daemon no responde en esta máquina.',
    investigate:
      'Confirmá que Docker Desktop está corriendo. Si el proyecto necesita compose, no es un bug de producción pública salvo que el origen dependa de esos contenedores.',
    avoid: 'No reinstales Docker como primer paso.',
  },
  'chk-compose': {
    meaning: 'Hay compose/contenedores locales en mal estado.',
    investigate:
      'Leé docker compose ps y los logs del servicio que falla. Arreglá healthcheck, puertos o env del compose.',
    avoid: 'No hagas docker system prune salvo que el operador lo pida.',
  },
}

const GENERIC = {
  meaning: 'Suite Control midió este check en rojo. Tratá la evidencia como un incidente real.',
  investigate: 'Reproducí el síntoma, aislá la causa mínima y parcheá.',
  avoid: 'No rediseñes ni refactors colaterales.',
}

export type PromptIssue = {
  id: string
  label: string
  status: HealthStatus
  detail: string
  source: string
  serviceName: string
  severity: 'critical' | 'high'
}

export function failingIssues(project: Project, incidents: Incident[] = []): PromptIssue[] {
  const fromChecks: PromptIssue[] = []
  for (const service of project.services) {
    if (service.accessOnly) continue
    for (const check of service.checks) {
      if (check.status !== 'down' && check.status !== 'degraded') continue
      fromChecks.push(issueFromCheck(check, service))
    }
  }
  if (fromChecks.length > 0) return fromChecks

  return incidents
    .filter((item) => item.projectId === project.id && item.status !== 'resolved')
    .map((item) => ({
      id: item.id,
      label: item.title,
      status: item.severity === 'critical' ? 'down' : 'degraded',
      detail: item.detail,
      source: item.environment,
      serviceName: item.environment,
      severity: item.severity === 'critical' ? 'critical' : 'high',
    }))
}

function issueFromCheck(check: HealthCheck, service: Service): PromptIssue {
  return {
    id: check.id,
    label: check.label,
    status: check.status,
    detail: check.detail,
    source: check.source,
    serviceName: service.name,
    severity: check.status === 'down' ? 'critical' : 'high',
  }
}

export function focusIssues(issues: PromptIssue[], incidentId?: string) {
  if (!incidentId) return issues
  const hit = issues.filter((issue) => incidentId.includes(issue.id) || issue.id === incidentId)
  return hit.length > 0 ? hit : issues
}

function playbook(checkId: string) {
  return PLAYBOOKS[checkId] ?? GENERIC
}

function clip(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 20)).trimEnd()}\n\n[prompt recortado]`
}

export function composeRemediationPrompt(input: {
  project: Project
  incidents?: Incident[]
  incidentId?: string
  maxChars?: number
}): string {
  const { project } = input
  const issues = focusIssues(failingIssues(project, input.incidents ?? []), input.incidentId)
  const score = projectScore(project)
  const coverage = projectCoverage(project)
  const status = statusLabel(projectStatus(project))
  const checks = projectChecks(project)
  const healthy = checks.filter((check) => check.status === 'healthy')
  const unknown = checks.filter((check) => check.status === 'unknown')
  const github = project.services.find((service) => service.kind === 'github')?.externalId

  const header = [
    `# Tarea de remediación · ${project.name}`,
    '',
    'Sos el ingeniero de guardia en Cursor. Suite Control (command center local) detectó esto y te abre el repo con el brief listo.',
    'Reproducí. Aislá la causa. Parcheá el mínimo. Verificá. No rediseñes. No commitees ni pushees salvo que el operador lo pida. No imprimas secretos.',
    '',
    '## Contexto',
    `- Proyecto: ${project.name} (${kindLabel(project.kind)})`,
    `- Path local: ${project.localPath}`,
    `- Branch: ${project.branch}`,
    project.productionUrl ? `- URL de producción: ${project.productionUrl}` : '- Sin URL de producción (trabajo local)',
    github ? `- GitHub: ${github}` : undefined,
    `- Score: ${score}/100 · ${status} · ${coverage.measured}/${coverage.total} checks medidos`,
    project.summary ? `- Resumen: ${project.summary}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')

  let body: string
  if (issues.length === 0) {
    body = [
      '',
      '## Estado',
      'No hay un check **medido** en rojo. Abrí el repo y esperá instrucciones, o revisá Conexiones/Ajustes si hay checks “sin token”.',
      unknown.length
        ? [
            '',
            '## Sin medir (no es un bug de código)',
            ...unknown.map((check) => `- ${check.label}: ${check.detail}`),
          ].join('\n')
        : '',
    ].join('\n')
  } else {
    body = [
      '',
      '## Fallos a resolver (prioridad)',
      ...issues.flatMap((issue, index) => {
        const book = playbook(issue.id)
        return [
          '',
          `### ${index + 1}. ${issue.label} · ${issue.severity === 'critical' ? 'crítico' : 'alto'}`,
          `- Servicio: ${issue.serviceName} · fuente ${issue.source}`,
          `- Evidencia: ${issue.detail}`,
          `- Qué significa: ${book.meaning}`,
          `- Cómo investigar: ${book.investigate}`,
          `- Qué no hacer: ${book.avoid}`,
        ]
      }),
    ].join('\n')
  }

  const footer = [
    healthy.length
      ? [
          '',
          '## Checks sanos (no los rompas)',
          ...healthy.map((check) => `- ${check.label}: ${check.detail}`),
        ].join('\n')
      : '',
    issues.length > 0 && unknown.length
      ? [
          '',
          '## Sin medir (no son bugs de este repo)',
          ...unknown.map((check) => `- ${check.label}: ${check.detail}`),
        ].join('\n')
      : '',
    '',
    '## Entrega',
    '1. Causa raíz en una frase.',
    '2. Archivos tocados y por qué.',
    '3. Cómo verificar que el síntoma de Suite Control quedó sano (comando, URL o test).',
  ].join('\n')

  return clip(`${header}${body}${footer}`.trim(), input.maxChars ?? 6000)
}

export function composeCompactPrompt(input: {
  project: Project
  incidents?: Incident[]
  incidentId?: string
}) {
  return composeRemediationPrompt({ ...input, maxChars: 2200 })
}
