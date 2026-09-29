'use client'

import Link from 'next/link'
import { use, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  ExternalLink,
  FolderGit2,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { CursorModal } from '@/components/cursor-modal'
import { ProjectAccess } from '@/components/project-access'
import { ProjectConnections } from '@/components/project-connections'
import { ProjectLinkPanel } from '@/components/project-link-panel'
import { ProjectOps } from '@/components/project-ops'
import { ProjectIcon } from '@/components/project-icon'
import { StatusPill } from '@/components/status-pill'
import { kindLabel, projectChecks, projectCoverage, projectScore, projectStatus, serviceStatus, statusLabel } from '@/lib/health'
import { composeRemediationPrompt } from '@/lib/prompt-engineer'
import { serviceMeta, severityLabel, uptimeLabel } from '@/lib/labels'
import { safeHttpUrl } from '@/lib/safe-url'
import { formatRelative } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { openReveal, projects, incidents: allIncidents, refresh, refreshing, ready, deleteProject } =
    useWorkspace()
  const project = projects.find((item) => item.id === id)
  const [cursorOpen, setCursorOpen] = useState(false)
  const [cursorIncidentId, setCursorIncidentId] = useState<string>()

  const score = project ? projectScore(project) : 0
  const status = project ? projectStatus(project) : 'unknown'
  const coverage = project ? projectCoverage(project) : { measured: 0, total: 0 }
  const checks = project ? projectChecks(project) : []
  const incidents = project ? allIncidents.filter((item) => item.projectId === project.id) : []
  const secrets = useMemo(
    () =>
      project
        ? project.services.flatMap((service) =>
            service.secretRefs.map((secret) => ({ service, secret })),
          )
        : [],
    [project],
  )

  if (!ready) {
    return <div className="empty-state">Cargando proyecto…</div>
  }

  if (!project) {
    return (
      <div className="empty-state">
        Proyecto no encontrado. <Link href="/projects">Volver al catálogo</Link>
      </div>
    )
  }

  const brief = composeRemediationPrompt({
    project,
    incidents,
    incidentId: cursorIncidentId,
  })

  return (
    <>
      <section className="detail-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            {kindLabel(project.kind)} · {project.branch}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ProjectIcon kind={project.kind} />
            <h1>
              {project.name}
              <span className="heading-period">.</span>
            </h1>
          </div>
          <p>{project.summary}</p>
          <div className="detail-meta">
            <StatusPill status={status} />
            <span>
              Score <strong>{score}</strong>/100
              {coverage.measured < coverage.total
                ? ` · ${coverage.measured}/${coverage.total} medidos`
                : ''}
            </span>
            <span>Uptime {uptimeLabel(project.uptime)}</span>
            {safeHttpUrl(project.productionUrl) && (
              <a href={safeHttpUrl(project.productionUrl)} target="_blank" rel="noreferrer">
                {project.productionUrl!.replace(/^https?:\/\//, '')}
              </a>
            )}
            <code>{project.localPath}</code>
          </div>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={refreshing}
            onClick={() => void refresh(project.id)}
          >
            <RefreshCw size={16} />
            {refreshing ? 'Chequeando…' : 'Chequear ahora'}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setCursorIncidentId(undefined)
              setCursorOpen(true)
            }}
          >
            <Sparkles size={16} />
            Abrir en Cursor
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              if (window.confirm(`¿Borrar ${project.name} del catálogo?`)) {
                void deleteProject(project.id).then(() => {
                  window.location.href = '/projects'
                })
              }
            }}
          >
            Borrar
          </button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Salud del proyecto">
        <div className={`metric-card ${status === 'down' ? 'metric-risk' : 'metric-featured'}`}>
          <div className="metric-top">
            <span>Salud de producción</span>
            <FolderGit2 size={16} />
          </div>
          <div className="metric-value">
            {score}
            <span className="metric-unit">/100</span>
          </div>
          <div className="metric-footer">
            <span className={status === 'healthy' ? 'trend-up' : 'trend-warn'}>
              {statusLabel(status)}
            </span>
            <span>{checks.filter((check) => check.status !== 'healthy').length} checks en riesgo</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Servicios</span>
          </div>
          <div className="metric-value">{String(project.services.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span>
              {project.services.filter((service) => service.accessOnly).length} solo acceso
            </span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Secretos referenciados</span>
            <LockKeyhole size={16} />
          </div>
          <div className="metric-value">{String(secrets.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span>Revelar pide el valor real al servidor</span>
          </div>
        </div>
        <div className="metric-card metric-risk">
          <div className="metric-top">
            <span>Incidentes</span>
            <TriangleAlert size={16} />
          </div>
          <div className="metric-value">{String(incidents.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span className="trend-warn">{incidents[0]?.title ?? 'Sin abiertos'}</span>
          </div>
        </div>
      </section>

      <ProjectAccess project={project} />

      <ProjectOps project={project} />

      <ProjectLinkPanel projectId={project.id} />

      <ProjectConnections project={project} />

      <section className="section-block">
        <h2>Servicios involucrados</h2>
        <div className="service-grid">
          {project.services.map((service) => {
            const meta = serviceMeta[service.kind]
            const current = serviceStatus(service)
            return (
              <article key={service.id} className="service-card">
                <header>
                  <div>
                    <h3>{service.name}</h3>
                    <p>{service.role}</p>
                  </div>
                  <StatusPill status={current} />
                </header>
                <div className="service-list">
                  {service.accessOnly && <span>Solo acceso</span>}
                  {service.externalId && <span>{service.externalId}</span>}
                  <span className={`chip icon-${meta.tone}`}>{meta.label}</span>
                </div>
                {service.checks[0] && <p>{service.checks[0].detail}</p>}
                <div className="service-actions">
                  {service.secretRefs[0] && (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        void openReveal({
                          secret: service.secretRefs[0],
                          projectName: project.name,
                          serviceName: service.name,
                          projectId: project.id,
                          serviceId: service.id,
                        })
                      }
                    >
                      <LockKeyhole size={14} />
                      Revelar acceso
                    </button>
                  )}
                  {safeHttpUrl(service.dashboardUrl) && (
                    <a
                      className="ghost-button"
                      href={safeHttpUrl(service.dashboardUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      Dashboard
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <div className="content-grid">
        <section className="section-block">
          <h2>Checks de salud</h2>
          <div className="check-list">
            {checks.map((check) => (
              <div key={check.id} className="check-row">
                <div>
                  <strong>{check.label}</strong>
                  <p>
                    {check.detail} · {check.source}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <StatusPill status={check.status} />
                  <div className="check-weight">peso {check.weight}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block">
          <h2>Tokens de API</h2>
          <p className="modal-sub">PAT y tokens. Las contraseñas de cuenta están arriba, en Accesos.</p>
          <div className="secret-list">
            {secrets
              .filter(({ secret }) => secret.field !== 'password' && !secret.id.endsWith('-login'))
              .map(({ service, secret }) => (
              <div key={secret.id} className="secret-row">
                <div>
                  <strong>
                    {service.name} · {secret.label}
                  </strong>
                  <p>{secret.loginUrl ?? 'sin URL de login'}</p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    void openReveal({
                      secret,
                      projectName: project.name,
                      serviceName: service.name,
                      projectId: project.id,
                      serviceId: service.id,
                    })
                  }
                >
                  Revelar
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {incidents.length > 0 && (
        <section className="section-block">
          <h2>Incidentes de este proyecto</h2>
          <div className="incident-stack">
            {incidents.map((incident) => (
              <article key={incident.id} className="stack-card">
                <div className="panel-header" style={{ padding: 0 }}>
                  <div>
                    <h2>{incident.title}</h2>
                    <p>{incident.detail}</p>
                  </div>
                  <span className="chip">{severityLabel(incident.severity)}</span>
                </div>
                <div className="detail-meta">
                  <span>{incident.environment}</span>
                  <span>{formatRelative(incident.detectedAt)}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setCursorIncidentId(incident.id)
                      setCursorOpen(true)
                    }}
                  >
                    Subsana en Cursor <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <CursorModal
        open={cursorOpen}
        onClose={() => {
          setCursorOpen(false)
          setCursorIncidentId(undefined)
        }}
        projectId={project.id}
        projectName={project.name}
        incidentId={cursorIncidentId}
        brief={brief}
      />
    </>
  )
}
