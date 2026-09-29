'use client'

import Link from 'next/link'
import { ArrowUpRight, Trash2 } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { kindLabel, projectCoverage, projectScore, projectStatus, stageLabel } from '@/lib/health'
import { projectTag, tagLabel } from '@/lib/tag'
import { serviceMeta } from '@/lib/labels'
import type { Project } from '@/lib/types'
import { ProjectIcon } from './project-icon'
import { StatusPill } from './status-pill'

export function ProjectRow({
  project,
  selected,
  onToggle,
  onDelete,
}: {
  project: Project
  selected?: boolean
  onToggle?: (id: string) => void
  onDelete?: (id: string, name: string) => void
}) {
  const score = projectScore(project)
  const status = projectStatus(project)
  const coverage = projectCoverage(project)

  return (
    <div className={`project-row ${selected ? 'is-selected' : ''}`}>
      {onToggle && (
        <label className="row-check" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggle(project.id)}
            aria-label={`Elegir ${project.name}`}
          />
        </label>
      )}
      <Link href={`/projects/${project.id}`} className="project-row-link">
        <ProjectIcon kind={project.kind} />
        <div className="project-name">
          <strong>{project.name}</strong>
          <span>
            {kindLabel(project.kind)} · {stageLabel(project)} · {tagLabel(projectTag(project))}
          </span>
        </div>
        <div className="service-list">
          {project.services.slice(0, 4).map((service) => (
            <span key={service.id}>{serviceMeta[service.kind].label}</span>
          ))}
          {project.services.length > 4 && <span>+{project.services.length - 4}</span>}
        </div>
        <div className="project-health">
          <div className="health-score">
            <strong>{score}</strong>
            <span>/100</span>
            {coverage.measured < coverage.total && (
              <span>
                {' '}
                · {coverage.measured}/{coverage.total} medidos
              </span>
            )}
          </div>
          <div className={`progress-track track-${status}`}>
            <i style={{ width: `${score}%` }} />
          </div>
        </div>
        <div className="project-status">
          <StatusPill status={status} />
          <span>{formatRelative(project.lastActivity)}</span>
        </div>
        <ArrowUpRight className="row-arrow" size={16} />
      </Link>
      {onDelete && (
        <button
          type="button"
          className="icon-button row-delete"
          aria-label={`Eliminar ${project.name}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete(project.id, project.name)
          }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}
