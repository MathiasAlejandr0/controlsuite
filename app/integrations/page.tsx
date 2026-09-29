'use client'

import { useEffect, useState } from 'react'
import { AccountDialog } from '@/components/account-dialog'
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

  useEffect(() => {
    if (!credentials.integrations.github) {
      setRepos([])
      return
    }
    void fetch('/api/github/account')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const list = (payload?.repos ?? []) as AccountRepo[]
        setRepos(list)
        setSelected(list.filter((repo) => !repo.alreadyImported).map((repo) => repo.fullName))
      })
      .catch(() => setRepos([]))
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
          <p>Conectá cada proveedor una vez. Después, en el proyecto, solo confirmás el recurso.</p>
        </div>
      </section>

      <div className="stack">
        {KINDS.map((kind) => {
          const connected = Boolean(credentials.integrations[kind])
          const firstMissing = KINDS.find((item) => !credentials.integrations[item])
          return (
            <article key={kind} className="quiet-row">
              <span className={`status-dot ${connected ? 'dot-healthy' : 'dot-unknown'}`} />
              <div className="quiet-copy">
                <strong>{TOKEN_GUIDES[kind].label}</strong>
                <span>{connected ? 'Conectada' : 'Falta conectar'}</span>
              </div>
              {connected ? (
                <button type="button" className="text-button" onClick={() => void forget(kind)}>
                  Quitar
                </button>
              ) : (
                <button
                  type="button"
                  className={kind === firstMissing ? 'primary-button' : 'ghost-button'}
                  onClick={() => setDialog(kind)}
                >
                  Conectar
                </button>
              )}
            </article>
          )
        })}
      </div>

      <details className="fold">
        <summary>Importar repos de GitHub</summary>
        {!credentials.integrations.github && <p className="quiet-empty">Primero conectá GitHub.</p>}
        {credentials.integrations.github && repos.length === 0 && <p className="quiet-empty">No hay repos para importar.</p>}
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
              <span>{repo.alreadyImported ? `${repo.fullName} · ya está` : repo.fullName}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            className="ghost-button"
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
