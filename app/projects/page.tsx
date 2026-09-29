'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { isLiveProject, projectStatus, sortByRisk } from '@/lib/health'
import { useWorkspace } from '@/lib/workspace'
import { ProjectForm } from '@/components/project-form'

type FilterId = 'all' | 'risk' | 'live'

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'risk', label: 'En riesgo' },
  { id: 'live', label: 'Producción' },
]

export default function ProjectsPage() {
  const { query, projects, deleteProject } = useWorkspace()
  const [filter, setFilter] = useState<FilterId>('all')
  const [creating, setCreating] = useState(false)

  const visible = useMemo(() => {
    return sortByRisk(projects).filter((project) => {
      if (!project.name.toLowerCase().includes(query.toLowerCase())) return false
      if (filter === 'live') return isLiveProject(project)
      if (filter === 'risk') {
        const status = projectStatus(project)
        return status === 'down' || status === 'degraded'
      }
      return true
    })
  }, [filter, projects, query])

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>Proyectos</h1>
          <p>Un punto por proyecto. Entrá para conectar servicios.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Nuevo proyecto
        </button>
      </section>

      <div className="filter-row">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter-button ${filter === item.id ? 'active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="quiet-empty">No hay proyectos en este filtro.</p>}
      <div className="stack">
        {visible.map((project) => (
          <div key={project.id} className="quiet-row">
            <Link href={`/projects/${project.id}`} className="quiet-row-link">
              <span className={`status-dot dot-${projectStatus(project)}`} />
              <strong>{project.name}</strong>
            </Link>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (window.confirm(`¿Sacar “${project.name}” del catálogo?`)) void deleteProject(project.id)
              }}
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </div>
  )
}
