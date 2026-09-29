'use client'

import { useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { isLiveProject, sortByRisk } from '@/lib/health'
import { projectTag } from '@/lib/tag'
import type { FilterId } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'
import { ProjectRow } from '@/components/project-row'
import { ProjectForm } from '@/components/project-form'

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'live', label: 'En producción' },
  { id: 'local', label: 'Solo local' },
  { id: 'risk', label: 'En riesgo' },
  { id: 'trabajo', label: 'Trabajo' },
  { id: 'casa', label: 'Casa' },
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'backend', label: 'Backend' },
]

export default function ProjectsPage() {
  const { query, projects, refresh, refreshing, deleteProject, deleteProjects } = useWorkspace()
  const [filter, setFilter] = useState<FilterId>('all')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const visible = useMemo(() => {
    return sortByRisk(projects).filter((project) => {
      const matchesQuery = project.name.toLowerCase().includes(query.toLowerCase())
      if (!matchesQuery) return false
      if (filter === 'all') return true
      if (filter === 'live') return isLiveProject(project)
      if (filter === 'local') return !isLiveProject(project)
      if (filter === 'risk') {
        return project.services.some((service) =>
          service.checks.some((check) => check.status === 'down' || check.status === 'degraded'),
        )
      }
      if (filter === 'trabajo' || filter === 'casa') return projectTag(project) === filter
      return project.kind === filter
    })
  }, [filter, projects, query])

  const visibleIds = visible.map((project) => project.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function deleteOne(id: string, name: string) {
    if (!window.confirm(`¿Sacar “${name}” del catálogo? No borra el repo del disco.`)) return
    void deleteProject(id).then(() => {
      setSelected((current) => current.filter((item) => item !== id))
    })
  }

  function deleteSelected() {
    if (selected.length === 0) return
    if (
      !window.confirm(
        `¿Sacar ${selected.length} proyecto${selected.length === 1 ? '' : 's'} del catálogo? No se borra nada del disco.`,
      )
    ) {
      return
    }
    const ids = [...selected]
    void deleteProjects(ids).then(() => setSelected([]))
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Catálogo de trabajo
          </div>
          <h1>
            Tus proyectos<span className="heading-period">.</span>
          </h1>
          <p>
            Solo lo que querés operar acá. El tacho saca del catálogo: el código en disco no se toca.
          </p>
        </div>
        <div className="heading-actions">
          {selected.length > 0 && (
            <button type="button" className="ghost-button" onClick={deleteSelected}>
              <Trash2 size={16} />
              Eliminar {selected.length}
            </button>
          )}
          <button type="button" className="ghost-button" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={16} />
            {refreshing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          <button type="button" className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Nuevo proyecto
          </button>
        </div>
      </section>

      <div className="filter-row" style={{ marginBottom: 16 }}>
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
        {visible.length > 0 && (
          <button
            type="button"
            className={`filter-button ${allVisibleSelected ? 'active' : ''}`}
            onClick={() => setSelected(allVisibleSelected ? [] : visibleIds)}
          >
            {allVisibleSelected ? 'Quitar selección' : 'Elegir visibles'}
          </button>
        )}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{visible.length} proyectos</h2>
            <p>Filtro Trabajo / Casa. El tacho saca del catálogo, no del disco.</p>
          </div>
        </div>
        <div className="project-list">
          {visible.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              selected={selected.includes(project.id)}
              onToggle={toggle}
              onDelete={deleteOne}
            />
          ))}
        </div>
        {visible.length === 0 && (
          <div className="empty-state">
            {projects.length === 0
              ? 'El catálogo está vacío. Sumá una carpeta o un repo de GitHub.'
              : 'Nada coincide con este filtro. Cambiá el chip o la búsqueda.'}
          </div>
        )}
      </section>
      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </>
  )
}
