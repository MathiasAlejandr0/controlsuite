'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { Remediation } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

export function OpsQueue() {
  const { pushToast } = useWorkspace()
  const [items, setItems] = useState<Remediation[]>([])

  async function load() {
    const response = await fetch('/api/ops', { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json()
    setItems(payload.remediations ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function dismiss(id: string) {
    const response = await fetch('/api/ops', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'dismissed' }),
    })
    if (!response.ok) {
      pushToast('No se pudo descartar', 'warn')
      return
    }
    const payload = await response.json()
    setItems(payload.remediations ?? [])
  }

  if (items.length === 0) return null

  return (
    <section className="section-block">
      <h2>Cola de remediación</h2>
      <p className="modal-sub">
        El watchdog encola incidentes de producción. Abrí Cursor cuando puedas; no se parchea solo.
      </p>
      <div className="need-list">
        {items.slice(0, 6).map((item) => (
          <article key={item.id} className="need-row">
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            <div className="need-actions">
              <Link className="primary-button" href={`/projects/${item.projectId}`}>
                <Sparkles size={14} />
                Abrir proyecto
              </Link>
              <button type="button" className="ghost-button" onClick={() => void dismiss(item.id)}>
                Descartar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
