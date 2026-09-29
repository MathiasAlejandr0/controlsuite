'use client'

import { RefreshCw } from 'lucide-react'
import { IncidentCard } from '@/components/incident-card'
import { sortAlerts } from '@/lib/alerts'
import { useWorkspace } from '@/lib/workspace'

export default function IncidentsPage() {
  const { incidents, projects, refresh, refreshing, resolveIncident, openCursor } = useWorkspace()
  const open = sortAlerts(incidents.filter((item) => item.status !== 'resolved'))
  const resolved = incidents.filter((item) => item.status === 'resolved')
  const counts = {
    critical: open.filter((item) => item.severity === 'critical').length,
    high: open.filter((item) => item.severity === 'high').length,
    medium: open.filter((item) => item.severity === 'medium').length,
    low: open.filter((item) => item.severity === 'low').length,
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Centro de incidentes
          </div>
          <h1>
            Alertas con qué hacer<span className="heading-period">.</span>
          </h1>
          <p>
            Se deduplican por proyecto y check. La primera vez se conserva. Si el check sana, se cierran solas.
            Crítica y alta también avisan en Windows.
          </p>
        </div>
        <button type="button" className="ghost-button" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          {refreshing ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      </section>

      <section className="severity-row" aria-label="Alertas por severidad">
        <span className="sev-badge sev-critical">{counts.critical} críticas</span>
        <span className="sev-badge sev-high">{counts.high} altas</span>
        <span className="sev-badge sev-medium">{counts.medium} medias</span>
        <span className="sev-badge sev-low">{counts.low} bajas</span>
      </section>

      <div className="incident-stack">
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
        {open.length === 0 && (
          <div className="empty-state">
            Nada abierto. Un sitio caído, un deploy rojo o un pico de firewall aparece acá y, si es crítica o alta, en un aviso de Windows.
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <section className="section-block" style={{ marginTop: 28 }}>
          <h2>Resueltos</h2>
          <div className="incident-stack">
            {resolved.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} project={projects.find((item) => item.id === incident.projectId)} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
