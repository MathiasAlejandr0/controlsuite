'use client'

import { useState } from 'react'
import { Link2 } from 'lucide-react'
import type { LinkProvider } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

const BUTTONS: Array<{ id: LinkProvider; label: string; hint: string }> = [
  { id: 'github', label: 'GitHub', hint: 'GitHub pide autorizar Suite Control en tus repos' },
  { id: 'vercel', label: 'Vercel', hint: 'vercel login' },
  { id: 'cloudflare', label: 'Cloudflare', hint: 'wrangler login' },
  { id: 'supabase', label: 'Supabase', hint: 'supabase login' },
  { id: 'insforge', label: 'InsForge', hint: 'dashboard de InsForge' },
]

export function LinkIntegrations() {
  const { credentials, pushToast, reload } = useWorkspace()
  const [busy, setBusy] = useState<string>()

  function start(provider: LinkProvider) {
    window.open(
      `/api/connect/start?provider=${encodeURIComponent(provider)}`,
      'suite-permisos',
      'width=560,height=780,noopener=yes',
    )
  }

  async function collect(provider: LinkProvider) {
    setBusy(provider)
    const collected = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', provider }),
    })
    const payload = await collected.json()
    setBusy(undefined)
    if (!collected.ok) {
      pushToast(payload.error ?? 'Todavía no hay sesión', 'warn')
      return
    }
    await reload()
    pushToast('Sesión guardada en el vault de este PC')
  }

  return (
    <div className="need-list">
      {BUTTONS.map((field) => (
        <article key={field.id} className="need-row">
          <div>
            <strong>
              {field.label}
              {credentials.integrations[field.id] ? ' · enlazado' : ' · sin sesión'}
            </strong>
            <p>{field.hint}. El botón abre el navegador oficial; no tenés que fabricar un token.</p>
          </div>
          <div className="need-actions">
            {!credentials.integrations[field.id] && (
              <button
                type="button"
                className="ghost-button"
                disabled={Boolean(busy)}
                onClick={() => void collect(field.id)}
              >
                Recoger sesión
              </button>
            )}
            {!credentials.integrations[field.id] && (
              <button type="button" className="primary-button" onClick={() => start(field.id)}>
                <Link2 size={14} />
                Autorizar {field.label}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
