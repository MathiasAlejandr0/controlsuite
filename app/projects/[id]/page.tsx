'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { CursorModal } from '@/components/cursor-modal'
import { ConnectPanel } from '@/components/connect-panel'
import { ProjectAccess } from '@/components/project-access'
import { ProjectConnections } from '@/components/project-connections'
import { ProjectOps } from '@/components/project-ops'
import { StatusPill } from '@/components/status-pill'
import { projectChecks, projectStatus } from '@/lib/health'
import { composeRemediationPrompt } from '@/lib/prompt-engineer'
import { safeHttpUrl } from '@/lib/safe-url'
import { useWorkspace } from '@/lib/workspace'

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { projects, incidents, refresh, refreshing, ready, deleteProject, openCursor, saveIntegrations } = useWorkspace()
  const project = projects.find((item) => item.id === id)
  const [cursorOpen, setCursorOpen] = useState(false)
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})

  if (!ready) return <p className="quiet-empty">Cargando…</p>

  if (!project) {
    return (
      <p className="quiet-empty">
        Proyecto no encontrado. <Link href="/projects">Volver</Link>
      </p>
    )
  }

  const status = projectStatus(project)
  const checks = projectChecks(project)
  const open = incidents.filter((item) => item.projectId === project.id && item.status === 'open')
  const secrets = project.services.flatMap((service) =>
    service.secretRefs.map((secret) => ({ service, secret })),
  )
  const brief = composeRemediationPrompt({ project, incidents, incidentId: open[0]?.id })
  const site = safeHttpUrl(project.productionUrl)

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>
            <span className={`status-dot dot-${status}`} /> {project.name}
          </h1>
          <p>
            {open.length > 0 ? (
              <Link href="/incidents">
                {open.length === 1 ? '1 alerta abierta' : `${open.length} alertas abiertas`}
              </Link>
            ) : (
              'Sin alertas abiertas.'
            )}
            {site ? ` · ${site.replace(/^https?:\/\//, '')}` : ''}
          </p>
        </div>
      </section>

      <ConnectPanel project={project} />

      <details className="fold">
        <summary>Ver detalles</summary>
        <div className="stack">
          <p className="quiet-copy">
            <span>{project.localPath}</span>
            {project.summary ? <span>{project.summary}</span> : null}
          </p>
          <div className="quiet-actions">
            <button type="button" className="ghost-button" disabled={refreshing} onClick={() => void refresh(project.id)}>
              {refreshing ? 'Chequeando…' : 'Chequear ahora'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setCursorOpen(true)
                void openCursor(project.id, open[0]?.id)
              }}
            >
              Abrir en Cursor
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (window.confirm(`¿Sacar “${project.name}” del catálogo?`)) {
                  void deleteProject(project.id).then(() => {
                    window.location.href = '/projects'
                  })
                }
              }}
            >
              Quitar del catálogo
            </button>
          </div>
          {checks.length > 0 && (
            <div className="stack">
              {checks.map((check) => (
                <div key={check.id} className="quiet-row">
                  <StatusPill status={check.status} />
                  <div className="quiet-copy">
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ProjectAccess project={project} />
          <ProjectOps project={project} />
          <ProjectConnections project={project} />
          {secrets.length > 0 && (
            <div className="stack">
              {secrets.map(({ service, secret }) => (
                <label key={secret.id} className="quiet-row">
                  <span className="quiet-copy">
                    <strong>
                      {service.name} · {secret.label}
                    </strong>
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Pegar valor"
                    value={secretDrafts[secret.id] ?? ''}
                    onChange={(event) =>
                      setSecretDrafts((current) => ({ ...current, [secret.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const filled = Object.fromEntries(
                    Object.entries(secretDrafts).filter(([, value]) => value.trim()),
                  )
                  void saveIntegrations({ secrets: filled })
                  setSecretDrafts({})
                }}
              >
                Guardar accesos
              </button>
            </div>
          )}
        </div>
      </details>

      <CursorModal
        open={cursorOpen}
        onClose={() => setCursorOpen(false)}
        projectId={project.id}
        projectName={project.name}
        incidentId={open[0]?.id}
        brief={brief}
      />
    </div>
  )
}
