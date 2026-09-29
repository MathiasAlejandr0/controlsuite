'use client'

import { useEffect, useState } from 'react'
import { AccountDialog } from '@/components/account-dialog'
import { ServiceCard } from '@/components/service-card'
import { EmptyState } from '@/components/ui/empty-state'
import { TOKEN_GUIDES, type ConnectKind } from '@/lib/service-link'
import { useWorkspace } from '@/lib/workspace'

const KINDS: ConnectKind[] = ['github', 'vercel', 'supabase', 'cloudflare', 'sentry']

type AccountRepo = { fullName: string; alreadyImported: boolean }

export default function IntegrationsPage() {
  const { credentials, reload, pushToast, importGithubRepos } = useWorkspace()
  const [dialog, setDialog] = useState<ConnectKind | null>(null)
  const [repos, setRepos] = useState<AccountRepo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!credentials.integrations.github) {
      setRepos([])
      return
    }
    void fetch('/api/github/account')
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? 'No se pudo leer GitHub')
        }
        return response.json()
      })
      .then((payload) => {
        const list = (payload?.repos ?? []) as AccountRepo[]
        setRepos(list)
        setSelected(list.filter((repo) => !repo.alreadyImported).map((repo) => repo.fullName))
        setError('')
      })
      .catch((cause: unknown) => {
        setRepos([])
        setError(cause instanceof Error ? cause.message : 'No se pudo leer GitHub')
      })
  }, [credentials.integrations.github])

  async function forget(kind: ConnectKind) {
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, phase: 'forget' }),
    })
    if (!response.ok) {
      pushToast('No se pudo quitar la cuenta', 'warn')
      return
    }
    await reload()
    pushToast(`${TOKEN_GUIDES[kind].label} desconectada`)
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>Cuentas</h1>
          <p>Cada proveedor se conecta una vez y vale para todos los proyectos.</p>
        </div>
      </section>

      <div className="svc-grid">
        {KINDS.map((kind) => {
          const connected = Boolean(credentials.integrations[kind])
          return (
            <ServiceCard
              key={kind}
              title={TOKEN_GUIDES[kind].label}
              hint={connected ? 'Lista para usar en los proyectos' : 'Todavía no hay cuenta'}
              tone={connected ? 'ok' : 'off'}
              badge={connected ? 'Conectada' : 'Falta conectar'}
              primaryLabel={connected ? undefined : 'Conectar'}
              onPrimary={connected ? undefined : () => setDialog(kind)}
              menu={
                connected
                  ? [{ label: 'Quitar cuenta', onSelect: () => void forget(kind) }]
                  : []
              }
            />
          )
        })}
      </div>

      <details className="fold">
        <summary>Importar repos de GitHub</summary>
        {!credentials.integrations.github && <EmptyState>Primero conectá GitHub.</EmptyState>}
        {error && <p className="form-error">{error}</p>}
        {credentials.integrations.github && !error && repos.length === 0 && <EmptyState>No hay repos para importar.</EmptyState>}
        <div className="stack">
          {repos.map((repo) => (
            <label key={repo.fullName} className="quiet-row">
              <input
                type="checkbox"
                checked={selected.includes(repo.fullName)}
                disabled={repo.alreadyImported}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(repo.fullName)
                      ? current.filter((item) => item !== repo.fullName)
                      : [...current, repo.fullName],
                  )
                }
              />
              <span className="truncate">{repo.alreadyImported ? `${repo.fullName} · ya está` : repo.fullName}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={importing}
            onClick={() => {
              setImporting(true)
              void importGithubRepos(selected).finally(() => setImporting(false))
            }}
          >
            {importing ? 'Importando…' : 'Traer seleccionados'}
          </button>
        )}
      </details>

      {dialog && (
        <AccountDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            void reload()
          }}
        />
      )}
    </div>
  )
}
