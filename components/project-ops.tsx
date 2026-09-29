'use client'

import { useState } from 'react'
import { Container, GitBranch } from 'lucide-react'
import type { Project } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

export function ProjectOps({ project }: { project: Project }) {
  const { pushToast, reload, refresh } = useWorkspace()
  const [busy, setBusy] = useState<string>()

  async function gitSync() {
    setBusy('git')
    const response = await fetch(`/api/projects/${project.id}/git-sync`, { method: 'POST' })
    const payload = await response.json()
    setBusy(undefined)
    if (!response.ok) {
      pushToast(payload.error ?? 'No se pudo sincronizar git', 'warn')
      return
    }
    await reload()
    await refresh(project.id)
    pushToast(payload.detail ?? 'Git al día')
  }

  async function compose() {
    setBusy('compose')
    const response = await fetch(`/api/projects/${project.id}/compose`, { method: 'POST' })
    const payload = await response.json()
    setBusy(undefined)
    if (!response.ok) {
      pushToast(payload.error ?? 'No se pudo levantar compose', 'warn')
      return
    }
    await refresh(project.id)
    pushToast(payload.detail ?? 'Compose arriba')
  }

  return (
    <section className="section-block">
      <h2>Acciones en este PC</h2>
      <p className="modal-sub">
        Clone o pull con ff-only, y docker compose up. El watchdog solo las repite si marcás
        automático en Conexiones.
      </p>
      <div className="modal-actions">
        <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void gitSync()}>
          <GitBranch size={14} />
          {busy === 'git' ? 'Sincronizando…' : 'Sincronizar git'}
        </button>
        <button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => void compose()}>
          <Container size={14} />
          {busy === 'compose' ? 'Levantando…' : 'Levantar compose'}
        </button>
      </div>
    </section>
  )
}
