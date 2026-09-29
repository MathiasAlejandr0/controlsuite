'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { sortAlerts } from '@/lib/alerts'
import { projectStatus, sortByRisk } from '@/lib/health'
import { useWorkspace } from '@/lib/workspace'
import { ProjectForm } from '@/components/project-form'
import { EmptyState } from '@/components/ui/empty-state'

export default function OverviewPage() {
  const { query, projects, incidents, ready } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const ranked = useMemo(() => sortByRisk(projects), [projects])
  const visible = ranked.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()))
  const actionable = sortAlerts(incidents.filter((item) => item.status === 'open'))
  const down = projects.filter((project) => projectStatus(project) === 'down').length
  const degraded = projects.filter((project) => projectStatus(project) === 'degraded').length

  const health =
    !ready
      ? 'Cargando…'
      : projects.length === 0
        ? 'Sin proyectos todavía.'
        : down > 0
          ? down === 1
            ? '1 proyecto en rojo.'
            : `${down} proyectos en rojo.`
          : degraded > 0
            ? 'Hay avisos. Nada está caído.'
            : 'Todo lo medido está bien.'

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>{health}</h1>
          <p>
            {projects.length === 0
              ? 'Agregá una carpeta y conectá sus servicios.'
              : `${projects.length} proyecto${projects.length === 1 ? '' : 's'} en este equipo.`}
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Nuevo proyecto
        </button>
      </section>

      <section>
        <div className="section-head">
          <div>
            <h2>Para actuar</h2>
            <p>Solo alertas abiertas.</p>
          </div>
          {actionable.length > 0 && (
            <Link href="/incidents" className="text-button">
              Ver alertas
            </Link>
          )}
        </div>
        {actionable.length === 0 ? (
          <EmptyState>Nada pendiente.</EmptyState>
        ) : (
          <div className="stack">
            {actionable.slice(0, 5).map((incident) => {
              const project = projects.find((item) => item.id === incident.projectId)
              return (
                <Link key={incident.id} href="/incidents" className="quiet-row">
                  <span className={`status-dot ${incident.severity === 'critical' || incident.severity === 'high' ? 'dot-down' : 'dot-degraded'}`} />
                  <div className="quiet-copy">
                    <strong>{incident.title}</strong>
                    <span>{project?.name ?? 'Proyecto'}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <div>
            <h2>Proyectos</h2>
          </div>
          <Link href="/projects" className="text-button">
            Ver lista
          </Link>
        </div>
        {projects.length === 0 && <EmptyState>Todavía no hay proyectos.</EmptyState>}
        {projects.length > 0 && visible.length === 0 && <EmptyState>Nada coincide con la búsqueda.</EmptyState>}
        <div className="stack">
          {visible.slice(0, 8).map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="quiet-row">
              <span className={`status-dot dot-${projectStatus(project)}`} />
              <strong>{project.name}</strong>
            </Link>
          ))}
        </div>
      </section>
      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </div>
  )
}
