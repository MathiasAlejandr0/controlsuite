'use client'

import { IncidentCard } from '@/components/incident-card'
import { sortAlerts } from '@/lib/alerts'
import { useWorkspace } from '@/lib/workspace'

export default function IncidentsPage() {
  const { incidents, projects, resolveIncident, openCursor } = useWorkspace()
  const open = sortAlerts(incidents.filter((item) => item.status !== 'resolved'))
  const resolved = incidents.filter((item) => item.status === 'resolved')

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>{open.length === 0 ? 'Sin alertas abiertas' : open.length === 1 ? '1 alerta' : `${open.length} alertas`}</h1>
          <p>Qué hacer está en cada alerta, detrás de Ver detalles.</p>
        </div>
      </section>

      {open.length === 0 && <p className="quiet-empty">Nada que resolver.</p>}
      <div className="stack">
        {open.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            project={projects.find((item) => item.id === incident.projectId)}
            onAcknowledge={
              incident.status === 'open' ? () => void resolveIncident(incident.id, 'acknowledged') : undefined
            }
            onResolve={() => void resolveIncident(incident.id, 'resolved')}
            onCursor={() => void openCursor(incident.projectId, incident.id)}
          />
        ))}
      </div>

      {resolved.length > 0 && (
        <details className="fold">
          <summary>Resueltas ({resolved.length})</summary>
          <div className="stack">
            {resolved.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                project={projects.find((item) => item.id === incident.projectId)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
