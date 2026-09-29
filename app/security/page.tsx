'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { StatusPill } from '@/components/status-pill'
import { projectChecks } from '@/lib/health'
import { auditTypeLabel, healthStatusLabel } from '@/lib/labels'
import { staleSecrets } from '@/lib/secrets-hygiene'
import type { AuditEvent } from '@/lib/types'
import type { HistoryPoint } from '@/lib/history'
import { formatRelative } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'

export default function SecurityPage() {
  const { projects, audit, loadAudit } = useWorkspace()
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const checks = projects.flatMap((project) =>
    projectChecks(project).map((check) => ({ project, check })),
  )
  const risky = checks.filter((item) => item.check.status !== 'healthy')
  const tls = checks.filter((item) => item.check.label.includes('TLS'))
  const uptime = checks.filter((item) => item.check.id === 'chk-uptime')
  const stale = staleSecrets(projects)

  useEffect(() => {
    void loadAudit()
    void fetch('/api/history', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { points: [] }))
      .then((payload) => {
        if (Array.isArray(payload.points)) setHistory(payload.points)
      })
  }, [loadAudit])

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Postura de seguridad
          </div>
          <h1>
            Superficie medida<span className="heading-period">.</span>
          </h1>
          <p>
            Esta suite no se publica. Escucha solo 127.0.0.1. Un check “sin token” es falta de
            conector, no exposición a la red.
          </p>
        </div>
      </section>

      <section className="setup-banner setup-banner-safe">
        <div>
          <strong>Aislada en este Windows</strong>
          <p>
            Bind 127.0.0.1:3100 · PIN local · Origin debe coincidir host y puerto. Nadie fuera de
            este equipo puede pegarle. Los tokens los configurás cuando instales y pruebes.
          </p>
        </div>
      </section>

      <section className="security-grid">
        <article className="metric-card metric-featured">
          <div className="metric-top">
            <span>Alcance de red</span>
            <ShieldCheck size={16} />
          </div>
          <div className="metric-value" style={{ fontSize: 22 }}>
            local
          </div>
          <div className="metric-footer">
            <span className="trend-up">127.0.0.1 · no internet</span>
          </div>
        </article>
        <article className="metric-card metric-risk">
          <div className="metric-top">
            <span>Hallazgos</span>
            <ShieldCheck size={16} />
          </div>
          <div className="metric-value">{String(risky.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span>down + degraded + unknown</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>TLS / dominio</span>
          </div>
          <div className="metric-value">{tls.length}</div>
          <div className="metric-footer">
            <span>checks Cloudflare reales</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Secretos viejos</span>
          </div>
          <div className="metric-value">{String(stale.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span>sin rotar en 90 días</span>
          </div>
        </article>
      </section>

      <section className="section-block">
        <h2>Cola de postura</h2>
        <div className="check-list">
          {risky.map(({ project, check }) => (
            <a key={`${project.id}-${check.id}`} href={`/projects/${project.id}`} className="check-row">
              <div>
                <strong>
                  {project.name} · {check.label}
                </strong>
                <p>
                  {check.detail} · {check.source}
                </p>
              </div>
              <StatusPill status={check.status} />
            </a>
          ))}
          {risky.length === 0 && <div className="empty-state">Sin hallazgos en el último sync.</div>}
        </div>
      </section>

      <section className="section-block">
        <h2>Auditoría real</h2>
        <p className="modal-sub">Eventos de este equipo: revelar, Cursor, accesos, borrados.</p>
        <div className="check-list">
          {(audit as AuditEvent[]).slice(0, 20).map((event) => (
            <div key={event.id} className="check-row">
              <div>
                <strong>{auditTypeLabel(event.type)}</strong>
                <p>{event.label}</p>
              </div>
              <span>{formatRelative(event.at)}</span>
            </div>
          ))}
          {audit.length === 0 && <div className="empty-state">Todavía no hay eventos en disco.</div>}
        </div>
      </section>

      <section className="section-block">
        <h2>Historial 48 h</h2>
        <div className="check-list">
          {history.slice(-12).reverse().map((point) => (
            <div key={`${point.projectId}-${point.at}`} className="check-row">
              <div>
                <strong>{projects.find((item) => item.id === point.projectId)?.name ?? point.projectId}</strong>
                <p>
                  score {point.score} · {healthStatusLabel(point.status)}
                </p>
              </div>
              <span>{formatRelative(point.at)}</span>
            </div>
          ))}
          {history.length === 0 && <div className="empty-state">Se llena en cada sincronización.</div>}
        </div>
      </section>

      {stale.length > 0 && (
        <section className="section-block">
          <h2>Rotación pendiente</h2>
          <div className="check-list">
            {stale.map((item) => (
              <a key={item.secret.id} href={`/projects/${item.projectId}`} className="check-row">
                <div>
                  <strong>
                    {item.projectName} · {item.serviceName}
                  </strong>
                  <p>{item.secret.label}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
