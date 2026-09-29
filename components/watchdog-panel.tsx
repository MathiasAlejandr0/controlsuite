'use client'

import { useEffect, useState } from 'react'
import { formatRelative } from '@/lib/utils'

type Status = {
  lastTickAt?: string
  tone?: string
  down?: number
  degraded?: number
  queued?: number
}

export function WatchdogPanel() {
  const [status, setStatus] = useState<Status>({})

  useEffect(() => {
    void fetch('/api/watchdog/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : {}))
      .then((payload) => setStatus(payload))
  }, [])

  return (
    <section className="section-block">
      <h2>Vigilancia en este Windows</h2>
      <p className="modal-sub">
        El proceso de bandeja (instalador) y el server de Next tildan cada 5 minutos: HTTP, TLS y
        Docker, sin abrir el vault. GitHub/Vercel/Cloudflare esperan tu PIN en la UI.
      </p>
      <div className="detail-meta">
        <span>Último tick: {status.lastTickAt ? formatRelative(status.lastTickAt) : 'todavía no'}</span>
        <span>Tono: {status.tone ?? '—'}</span>
        <span>{status.down ?? 0} caídos · {status.degraded ?? 0} degradados</span>
        <span>{status.queued ?? 0} en cola de remediación</span>
      </div>
    </section>
  )
}