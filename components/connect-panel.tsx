'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { AccountDialog } from '@/components/account-dialog'
import type { AutoconnectItem } from '@/lib/autoconnect'
import { connectionState } from '@/lib/connection-status'
import { TOKEN_GUIDES, type ConnectKind } from '@/lib/service-link'
import type { Project } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

const KINDS: ConnectKind[] = ['github', 'vercel', 'supabase', 'cloudflare', 'sentry']

type Hint = { kind: ConnectKind; id?: string; evidence: string }

export function ConnectPanel({ project }: { project: Project }) {
  const { credentials, reload, pushToast, refresh } = useWorkspace()
  const [dialog, setDialog] = useState<ConnectKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [hints, setHints] = useState<Hint[]>([])
  const [choices, setChoices] = useState<Partial<Record<ConnectKind, string>>>({})
  const [lists, setLists] = useState<Partial<Record<ConnectKind, Array<{ id: string; label: string }>>>>({})
  const [notes, setNotes] = useState<Partial<Record<ConnectKind, string>>>({})

  useEffect(() => {
    let cancel = false
    void fetch(`/api/projects/${project.id}/hints`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancel && Array.isArray(payload.hints)) setHints(payload.hints)
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [project.id, project.localPath])

  const hinted = new Set(hints.map((item) => item.kind))
  const bound = new Set(project.services.map((service) => service.kind))
  const detected = KINDS.filter((kind) => hinted.has(kind) || bound.has(kind) || lists[kind])
  const visible = showAll || detected.length === 0 ? KINDS : detected

  const rows = visible.map((kind) => {
    const service = project.services.find((item) => item.kind === kind)
    const hint = service?.externalId || hints.find((item) => item.kind === kind)?.id
    const link = connectionState({
      hasToken: Boolean(credentials.integrations[kind]),
      externalId: service?.externalId,
      checks: service?.checks ?? [],
    })
    const label =
      link.state === 'conectado' ? 'Conectado' : link.state === 'error' ? 'Error' : 'Falta conectar'
    return { kind, hint, link, label, note: notes[kind] }
  })
  const pending = rows.filter((row) => row.label !== 'Conectado')

  function applyItems(items: AutoconnectItem[]) {
    const nextLists: Partial<Record<ConnectKind, Array<{ id: string; label: string }>>> = {}
    const nextChoices: Partial<Record<ConnectKind, string>> = {}
    const nextNotes: Partial<Record<ConnectKind, string>> = {}
    for (const item of items) {
      if (item.hint) {
        setHints((current) => {
          const rest = current.filter((hint) => hint.kind !== item.kind)
          return [...rest, { kind: item.kind, id: item.hint, evidence: item.reason ?? '' }]
        })
      }
      if (item.resources?.length) {
        nextLists[item.kind] = item.resources
        nextChoices[item.kind] =
          item.hint && item.resources.some((resource) => resource.id === item.hint)
            ? item.hint
            : item.resources[0].id
      }
      if (item.error || item.reason) nextNotes[item.kind] = item.error || item.reason
    }
    setLists(nextLists)
    setChoices(nextChoices)
    setNotes(nextNotes)
  }

  async function autoconnect() {
    setBusy(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/autoconnect`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo enlazar')
      const items = (payload.items ?? []) as AutoconnectItem[]
      if (Array.isArray(payload.hints)) setHints(payload.hints)
      applyItems(items)
      await reload()
      const linked = items.filter((item) => item.state === 'enlazado' || item.state === 'conectado')
      if (items.some((item) => item.state === 'enlazado')) {
        pushToast(linked.length === 1 ? 'Un servicio quedó enlazado' : `${items.filter((item) => item.state === 'enlazado').length} servicios enlazados`)
      }
      const missing = items.find((item) => item.state === 'falta-cuenta')
      if (missing) setDialog(missing.kind)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No se pudo enlazar', 'warn')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(kind: ConnectKind) {
    const resourceId = choices[kind]
    if (!resourceId) return
    setBusy(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/connect-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, phase: 'save', resourceId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo confirmar')
      await reload()
      pushToast(`${TOKEN_GUIDES[kind].label} confirmado`)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No se pudo confirmar', 'warn')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Servicios</h2>
          <p>La cuenta se conecta una vez. Acá solo confirmás el recurso de este proyecto.</p>
        </div>
        {pending.length > 0 && (
          <button type="button" className="primary-button" disabled={busy} onClick={() => void autoconnect()}>
            {busy ? 'Enlazando…' : 'Conectar todo'}
          </button>
        )}
      </div>
      <div className="stack">
        {rows.map((row) => {
          const options = lists[row.kind]
          const primary =
            row.label === 'Conectado' ? null : !credentials.integrations[row.kind] ? 'cuenta' : 'confirmar'
          return (
            <article key={row.kind} className="quiet-row">
              <span
                className={`status-dot dot-${row.link.state === 'conectado' ? 'healthy' : row.link.state === 'error' ? 'down' : 'unknown'}`}
              />
              <div className="quiet-copy">
                <strong>{TOKEN_GUIDES[row.kind].label}</strong>
                <span>
                  {row.label === 'Conectado' && <Check size={14} aria-hidden="true" />} {row.label}
                  {row.hint ? ` · ${row.hint}` : ''}
                </span>
                {row.label === 'Error' && <span className="form-error">{row.note || row.link.detail}</span>}
                {row.label !== 'Error' && row.note && row.label !== 'Conectado' && (
                  <span>{row.note}</span>
                )}
              </div>
              {options && options.length > 1 && (
                <select
                  aria-label={`Recurso de ${TOKEN_GUIDES[row.kind].label}`}
                  value={choices[row.kind] ?? ''}
                  onChange={(event) => setChoices((current) => ({ ...current, [row.kind]: event.target.value }))}
                >
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
              {primary === 'cuenta' && (
                <button type="button" className="ghost-button" onClick={() => setDialog(row.kind)}>
                  Conectar cuenta
                </button>
              )}
              {primary === 'confirmar' && (
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy || (options ? !choices[row.kind] : false)}
                  onClick={() => (options?.length ? void confirm(row.kind) : void autoconnect())}
                >
                  {options?.length ? 'Confirmar' : 'Usar detectado'}
                </button>
              )}
            </article>
          )
        })}
      </div>
      <div className="quiet-actions">
        {detected.length > 0 && detected.length < KINDS.length && (
          <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? 'Ocultar otros servicios' : 'Ver otros servicios'}
          </button>
        )}
        {pending.length === 0 && (
          <button type="button" className="ghost-button" onClick={() => void refresh(project.id)}>
            Chequear ahora
          </button>
        )}
      </div>
      {dialog && (
        <AccountDialog
          kind={dialog}
          projectId={project.id}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            void reload().then(() => autoconnect())
          }}
        />
      )}
    </section>
  )
}
