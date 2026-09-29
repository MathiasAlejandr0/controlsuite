'use client'

import Link from 'next/link'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { severityLabel, incidentStatusLabel } from '@/lib/labels'
import { remediationFor } from '@/lib/remediation'
import type { Incident, Project } from '@/lib/types'
import { formatRelative } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/safe-url'

export function IncidentCard({
  incident,
  project,
  onResolve,
  onAcknowledge,
  onCursor,
}: {
  incident: Incident
  project?: Project
  onResolve?: () => void
  onAcknowledge?: () => void
  onCursor?: () => void
}) {
  const guide = remediationFor(incident.code)
  const href = safeHttpUrl(incident.href)
  return (
    <article className={`stack-card alert-card sev-${incident.severity}`}>
      <div className="panel-header" style={{ padding: 0 }}>
        <div>
          <div className="alert-kicker">
            <span className={`sev-badge sev-${incident.severity}`}>{severityLabel(incident.severity)}</span>
            <span>{incident.source ?? incident.environment}</span>
            <span>{incidentStatusLabel(incident.status)}</span>
          </div>
          <h2>{incident.title}</h2>
          <p>{incident.detail}</p>
        </div>
        <span className={`incident-icon ${incident.severity === 'critical' ? 'incident-red' : 'incident-amber'}`}>
          <TriangleAlert size={16} />
        </span>
      </div>
      <div className="detail-meta">
        {project && (
          <Link href={`/projects/${incident.projectId}`}>
            <strong>{project.name}</strong>
          </Link>
        )}
        <span>Primera vez {formatRelative(incident.detectedAt)}</span>
        {incident.lastSeenAt && <span>Última vez {formatRelative(incident.lastSeenAt)}</span>}
        {href && (
          <a href={href} target="_blank" rel="noreferrer">
            Ver en el proveedor
          </a>
        )}
      </div>
      <div className="remediation">
        <strong>Qué hacer · {guide.title}</strong>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="service-actions">
        {onCursor && (
          <button type="button" className="ghost-button" onClick={onCursor}>
            <Sparkles size={14} />
            Abrir en Cursor
          </button>
        )}
        {onAcknowledge && incident.status !== 'acknowledged' && (
          <button type="button" className="ghost-button" onClick={onAcknowledge}>
            Marcar visto
          </button>
        )}
        {onResolve && (
          <button type="button" className="ghost-button" onClick={onResolve}>
            Resolver
          </button>
        )}
      </div>
    </article>
  )
}
