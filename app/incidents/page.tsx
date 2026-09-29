'use client'

import Link from 'next/link'
import { Sparkles, RefreshCw, TriangleAlert } from 'lucide-react'
import { incidentStatusLabel, severityLabel } from '@/lib/labels'
import { formatRelative } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'

export default function IncidentsPage() {
  const { incidents, projects, refresh, refreshing, resolveIncident, openCursor } = useWorkspace()
  const open = incidents.filter((item) => item.status !== 'resolved')
  const resolved = incidents.filter((item) => item.status === 'resolved')

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Centro de incidentes
          </div>
          <h1>
            Ciclo de vida, no un snapshot<span className="heading-period">.</span>
          </h1>
          <p>Un down sobrevive al re-sync hasta que lo cerrás. Si el check sana, se cierra solo.</p>
        </div>
        <button type="button" className="ghost-button" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          {refreshing ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      </section>

      <div className="incident-stack">
        {open.map((incident) => {
          const project = projects.find((item) => item.id === incident.projectId)
          return (
            <article key={incident.id} className="stack-card">
              <div className="panel-header" style={{ padding: 0 }}>
                <div>
                  <h2>{incident.title}</h2>
                  <p>{incident.detail}</p>
                </div>
                <span className={`incident-icon ${incident.severity === 'critical' ? 'incident-red' : 'incident-amber'}`}>
                  <TriangleAlert size={16} />
                </span>
              </div>
              <div className="detail-meta">
                <Link href={`/projects/${incident.projectId}`}>
                  <strong>{project?.name}</strong>
                </Link>
                <span>{incidentStatusLabel(incident.status)}</span>
                <span>{severityLabel(incident.severity)}</span>
                <span>{formatRelative(incident.detectedAt)}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void openCursor(incident.projectId, incident.id)}
                >
                  <Sparkles size={14} />
                  Abrir en Cursor
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void resolveIncident(incident.id)}
                >
                  Resolver
                </button>
              </div>
            </article>
          )
        })}
        {open.length === 0 && (
          <div className="empty-state">
            Nada abierto. Si un sitio live se cae, aparece acá y en un aviso de Windows.
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <section className="section-block" style={{ marginTop: 28 }}>
          <h2>Resueltos</h2>
          <div className="incident-stack">
            {resolved.map((incident) => (
              <Link key={incident.id} href={`/projects/${incident.projectId}`} className="stack-card">
                <strong>{incident.title}</strong>
                <p>{incident.detail}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
