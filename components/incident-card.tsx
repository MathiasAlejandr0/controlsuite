'use client'

import Link from 'next/link'
import { severityLabel } from '@/lib/labels'
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
  const open = incident.status !== 'resolved'
  return (
    <article className="quiet-row alert-card">
      <span className={`status-dot ${incident.severity === 'critical' || incident.severity === 'high' ? 'dot-down' : 'dot-degraded'}`} />
      <div className="quiet-copy">
        <strong>{incident.title}</strong>
        <span>
          {severityLabel(incident.severity)}
          {project ? ` · ${project.name}` : ''}
        </span>
      </div>
      {open && onResolve && (
        <button type="button" className="primary-button" onClick={onResolve}>
          Resolver
        </button>
      )}
      <details className="inline-fold">
        <summary>Ver detalles</summary>
        <p>{incident.detail}</p>
        <p className="connect-meta">
          Primera vez {formatRelative(incident.detectedAt)}
          {incident.lastSeenAt ? ` · última ${formatRelative(incident.lastSeenAt)}` : ''}
          {project ? (
            <>
              {' '}
              · <Link href={`/projects/${incident.projectId}`}>{project.name}</Link>
            </>
          ) : null}
        </p>
        <div className="remediation">
          <strong>Qué hacer</strong>
          <ol>
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="quiet-actions">
          {href && (
            <a href={href} target="_blank" rel="noreferrer">
              Ver en el proveedor
            </a>
          )}
          {onAcknowledge && incident.status === 'open' && (
            <button type="button" className="text-button" onClick={onAcknowledge}>
              Marcar visto
            </button>
          )}
          {onCursor && (
            <button type="button" className="text-button" onClick={onCursor}>
              Abrir en Cursor
            </button>
          )}
        </div>
      </details>
    </article>
  )
}
