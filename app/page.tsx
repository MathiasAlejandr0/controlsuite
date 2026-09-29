'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Check,
  Cloud,
  Database,
  GitBranch,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { sortAlerts } from '@/lib/alerts'
import { isLiveProject, kindLabel, overallScore, projectStatus, sortByRisk } from '@/lib/health'
import { severityLabel } from '@/lib/labels'
import { remediationFor } from '@/lib/remediation'
import { openIncidents } from '@/lib/incidents'
import { greetingForHour, formatRelative } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'
import { ProjectRow } from '@/components/project-row'
import { OpsQueue } from '@/components/ops-queue'
import { ProjectForm } from '@/components/project-form'

const ACTIVITY_ICONS = {
  green: Check,
  blue: ShieldCheck,
  amber: TriangleAlert,
  purple: GitBranch,
}

export default function OverviewPage() {
  const {
    query,
    profile,
    projects,
    incidents: allIncidents,
    activities,
    lastSyncedAt,
    refreshing,
    refresh,
    ready,
    deleteProject,
  } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const ranked = useMemo(() => sortByRisk(projects), [projects])
  const visible = ranked.filter((project) =>
    project.name.toLowerCase().includes(query.toLowerCase()),
  )
  const health = overallScore(projects)
  const downCount = projects.filter((project) => projectStatus(project) === 'down').length
  const online = projects.filter((project) => project.uptime === 'online').length
  const liveCount = projects.filter(isLiveProject).length
  const localCount = projects.length - liveCount
  const incidents = sortAlerts(openIncidents(allIncidents))
  const criticalCount = incidents.filter((item) => item.severity === 'critical').length
  const highCount = incidents.filter((item) => item.severity === 'high').length
  const greeting = greetingForHour(new Date().getHours())

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            {ready ? 'Checks en vivo' : 'Cargando workspace'}
          </div>
          <h1>
            {greeting}, {profile.name}
            <span className="heading-period">.</span>
          </h1>
          <p>
            Este escritorio se queda en tu PC. Mira la salud de lo que ya está online y de lo que
            todavía es solo local.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            {refreshing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          <button type="button" className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Nuevo proyecto
          </button>
        </div>
      </section>

      <section className="setup-banner setup-banner-safe">
        <div>
          <strong>Solo este PC · 127.0.0.1:3100</strong>
          <p>
            No está en internet. Los tokens se pegan en Ajustes cuando quieras medir GitHub, Vercel
            o Sentry. “Sin token” es un check no medido, no un agujero.
          </p>
        </div>
        <Link href="/security" className="ghost-button">
          Ver aislamiento
        </Link>
      </section>

      <OpsQueue />

      <section className="metric-grid" aria-label="Métricas del workspace">
        <div className="metric-card metric-featured">
          <div className="metric-top">
            <span>Salud global</span>
            <ShieldCheck size={16} />
          </div>
          <div className="metric-value">
            {health}
            <span className="metric-unit">/100</span>
          </div>
          <div className="metric-footer">
            <span className={downCount > 0 ? 'trend-down' : 'trend-up'}>
              {downCount > 0 ? `${downCount} en rojo` : 'Sin caídas'}
            </span>
            <span>promedio medido ahora</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Uptime HTTP</span>
            <Activity size={16} />
          </div>
          <div className="metric-value">
            {online}
            <span className="metric-unit">/{projects.length}</span>
          </div>
          <div className="metric-footer">
            <span>URLs de producción que responden</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Proyectos</span>
            <Cloud size={16} />
          </div>
          <div className="metric-value">{String(projects.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span>
              {liveCount} en producción · {localCount} locales
            </span>
          </div>
        </div>
        <div className="metric-card metric-risk">
          <div className="metric-top">
            <span>Incidentes abiertos</span>
            <TriangleAlert size={16} />
          </div>
          <div className="metric-value">{String(incidents.length).padStart(2, '0')}</div>
          <div className="metric-footer">
            <span className={incidents.length ? 'trend-warn' : 'trend-up'}>
              {incidents.length
                ? `${criticalCount} críticas · ${highCount} altas`
                : 'Nada abierto'}
            </span>
          </div>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel projects-panel">
          <div className="panel-header">
            <div>
              <h2>Proyectos</h2>
              <p>Peor score primero. Entrá para ver servicios y accesos.</p>
            </div>
          </div>
          <div className="project-list">
            {visible.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onDelete={(id, name) => {
                  if (window.confirm(`¿Sacar “${name}” del catálogo? No borra el repo del disco.`)) {
                    void deleteProject(id)
                  }
                }}
              />
            ))}
            {projects.length === 0 && (
              <div className="empty-state">
                Todavía no hay proyectos. Empezá por <strong>Nuevo proyecto</strong> (una carpeta
                del disco) o cargá repos desde <Link href="/integrations">Entorno</Link>.
              </div>
            )}
            {projects.length > 0 && visible.length === 0 && (
              <div className="empty-state">Nada coincide con la búsqueda.</div>
            )}
          </div>
          <Link href="/projects" className="view-all">
            Ver todos los proyectos <ArrowUpRight size={15} />
          </Link>
        </section>

        <aside className="right-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Necesita atención</h2>
                <p>Salen del último sync, no de un mock.</p>
              </div>
              <span className="incident-number">{incidents.length}</span>
            </div>
            {incidents.slice(0, 4).map((incident) => {
              const project = projects.find((item) => item.id === incident.projectId)
              const critical = incident.severity === 'critical'
              const guide = remediationFor(incident.code)
              return (
                <Link key={incident.id} href={`/incidents`} className="incident-item">
                  <div className={`incident-icon ${critical ? 'incident-red' : 'incident-amber'}`}>
                    {critical ? <TriangleAlert size={16} /> : <Database size={16} />}
                  </div>
                  <div>
                    <strong>{incident.title}</strong>
                    <p>
                      {project?.name} · {severityLabel(incident.severity)} · {guide.steps[0]}
                    </p>
                    <span className="incident-time">
                      Visto por primera vez {formatRelative(incident.detectedAt)}
                    </span>
                  </div>
                </Link>
              )
            })}
            {incidents.length === 0 && (
              <div className="empty-state">Sin incidentes después del último sync.</div>
            )}
            <Link href="/incidents" className="incident-link">
              Abrir centro de incidentes <ArrowUpRight size={15} />
            </Link>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Actividad reciente</h2>
                <p>Cada sync deja rastro.</p>
              </div>
            </div>
            <div className="activity-list">
              {activities.map((item) => {
                const Icon = ACTIVITY_ICONS[item.tone]
                return (
                  <div className="activity-item" key={item.id}>
                    <div className={`activity-icon tone-${item.tone}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <time>{formatRelative(item.at)}</time>
                  </div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>

      <footer className="footer-note">
        <span>
          <span className="live-dot" />
          {lastSyncedAt ? `Último sync ${formatRelative(lastSyncedAt)}` : 'Aún no sincronizado'}
        </span>
        <span>
          {projects.length} proyectos · {incidents.length} abiertos
        </span>
        <span>{ranked[0] ? `Peor: ${ranked[0].name} · ${kindLabel(ranked[0].kind)}` : ''}</span>
      </footer>
      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </>
  )
}
