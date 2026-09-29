'use client'

import { useEffect, useState } from 'react'
import { AccountDialog } from '@/components/account-dialog'
import { ServiceCard } from '@/components/service-card'
import { Button } from '@/components/ui/button'
import { toneForLink } from '@/components/ui/status-badge'
import type { AutoconnectItem } from '@/lib/autoconnect'
import { connectionState } from '@/lib/connection-status'
import { TOKEN_GUIDES, type ConnectKind } from '@/lib/service-link'
import type { Project } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

const KINDS: ConnectKind[] = ['github', 'vercel', 'supabase', 'cloudflare', 'sentry']

type Hint = { kind: ConnectKind; id?: string; evidence: string }
type Resource = { id: string; label: string }

export function ConnectPanel({ project }: { project: Project }) {
  const { credentials, reload, pushToast, refresh } = useWorkspace()
  const [dialog, setDialog] = useState<ConnectKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState<Hint[]>([])
  const [choices, setChoices] = useState<Partial<Record<ConnectKind, string>>>({})
  const [lists, setLists] = useState<Partial<Record<ConnectKind, Resource[]>>>({})
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

  const rows = KINDS.map((kind) => {
    const service = project.services.find((item) => item.kind === kind)
    const hint = service?.externalId || hints.find((item) => item.kind === kind)?.id
    const link = connectionState({
      hasToken: Boolean(credentials.integrations[kind]),
      externalId: service?.externalId,
      checks: service?.checks ?? [],
    })
    return { kind, service, hint, link, note: notes[kind] }
  })
  const pending = rows.some((row) => row.link.state !== 'conectado')

  function applyItems(items: AutoconnectItem[]) {
    const nextLists: Partial<Record<ConnectKind, Resource[]>> = {}
    const nextChoices: Partial<Record<ConnectKind, string>> = {}
    const nextNotes: Partial<Record<ConnectKind, string>> = {}
    for (const item of items) {
      if (item.resources?.length) {
        nextLists[item.kind] = item.resources
        nextChoices[item.kind] =
          item.hint && item.resources.some((resource) => resource.id === item.hint)
            ? item.hint
            : item.resources[0].id
      }
      if (item.error) nextNotes[item.kind] = item.error
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
      const linked = items.filter((item) => item.state === 'enlazado')
      if (linked.length) pushToast(linked.length === 1 ? 'Un servicio quedó enlazado' : `${linked.length} servicios enlazados`)
      const missing = items.find((item) => item.state === 'falta-cuenta')
      if (missing) setDialog(missing.kind)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No se pudo enlazar', 'warn')
    } finally {
      setBusy(false)
    }
  }

  async function post(kind: ConnectKind, phase: 'save' | 'test' | 'disconnect', resourceId?: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/connect-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, phase, resourceId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo completar')
      await reload()
      if (phase === 'test') pushToast('Chequeo listo')
      else if (phase === 'disconnect') pushToast('Servicio desconectado')
      else pushToast(`${TOKEN_GUIDES[kind].label} confirmado`)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'No se pudo completar', 'warn')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Servicios</h2>
          <p>La cuenta se conecta una vez. Acá confirmás el recurso.</p>
        </div>
        {pending && (
          <Button variant="primary" disabled={busy} onClick={() => void autoconnect()}>
            {busy ? 'Enlazando…' : 'Conectar todo'}
          </Button>
        )}
      </div>
      <div className="svc-grid">
        {rows.map((row) => {
          const options = lists[row.kind]
          const hasAccount = Boolean(credentials.integrations[row.kind])
          const primary =
            row.link.state === 'conectado'
              ? undefined
              : row.link.state === 'error'
                ? 'Reintentar'
                : !hasAccount
                  ? 'Conectar'
                  : options && options.length > 1
                    ? 'Confirmar'
                    : 'Usar detectado'
          const badge = row.link.state === 'conectado' ? 'Conectado' : row.link.state === 'error' ? 'Error' : 'Falta conectar'
          return (
            <ServiceCard
              key={row.kind}
              title={TOKEN_GUIDES[row.kind].label}
              hint={row.hint}
              tone={toneForLink(row.link.state)}
              badge={badge}
              detail={row.link.state === 'error' ? row.note || row.link.detail : undefined}
              primaryLabel={primary}
              primaryDisabled={busy || (primary === 'Confirmar' && !choices[row.kind])}
              onPrimary={
                primary
                  ? () => {
                      if (row.link.state === 'error') void post(row.kind, 'test')
                      else if (!hasAccount) setDialog(row.kind)
                      else if (options && options.length > 1) void post(row.kind, 'save', choices[row.kind])
                      else void autoconnect()
                    }
                  : undefined
              }
              extra={
                options && options.length > 1 ? (
                  <select
                    className="svc-select"
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
                ) : null
              }
              menu={[
                {
                  label: 'Probar',
                  disabled: busy,
                  onSelect: () => void post(row.kind, 'test'),
                },
                {
                  label: 'Desconectar',
                  disabled: busy || !row.service?.externalId,
                  onSelect: () => void post(row.kind, 'disconnect'),
                },
              ]}
            />
          )
        })}
      </div>
      {!pending && (
        <div className="quiet-actions">
          <Button variant="ghost" disabled={busy} onClick={() => void refresh(project.id)}>
            Chequear ahora
          </Button>
        </div>
      )}
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
