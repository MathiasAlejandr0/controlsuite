'use client'

import { useState } from 'react'
import { TOKEN_GUIDES, type ConnectKind } from '@/lib/service-link'
import { useWorkspace } from '@/lib/workspace'

export function AccountDialog({
  kind,
  projectId,
  onClose,
  onSaved,
}: {
  kind: ConnectKind
  projectId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { pushToast } = useWorkspace()
  const guide = TOKEN_GUIDES[kind]
  const [token, setToken] = useState('')
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = token.trim().length >= 8

  async function validateAndSave() {
    setBusy(true)
    setError('')
    try {
      const checked = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, phase: 'validate', token }),
      })
      const payload = await checked.json()
      if (!checked.ok) throw new Error(payload.error ?? 'No se pudo validar')
      setAccount(payload.account ?? '')
      const saved = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, phase: 'save', token, teamId: payload.teamId }),
      })
      const savedPayload = await saved.json()
      if (!saved.ok) throw new Error(savedPayload.error ?? 'No se pudo guardar')
      setToken('')
      pushToast(`${guide.label} quedó en este equipo`)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <p className="modal-kicker">Cuenta de {guide.label}</p>
        <h2>Una sola vez en este PC</h2>
        <p className="modal-sub">Después, en cada proyecto solo confirmás el recurso. El token no vuelve a la pantalla.</p>
        <ol className="steps">
          <li>Abrí la página del proveedor.</li>
          <li>Creá el token con los permisos de abajo.</li>
          <li>Pegalo acá. Lo validamos al instante.</li>
        </ol>
        <p>
          <a href={guide.tokenUrl} target="_blank" rel="noreferrer">
            Abrir página de {guide.label}
          </a>
        </p>
        <p className="connect-meta">{guide.scopes.join(' · ')}</p>
        {guide.oauth && (
          <p>
            <a href={`/api/connect/start?provider=github${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`}>
              O conectar la GitHub App
            </a>
          </p>
        )}
        <label>
          Token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Pegá el token"
            autoFocus
          />
        </label>
        {account && <p className="connect-meta">Vimos la cuenta {account}</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="primary-button" disabled={!ready || busy} onClick={() => void validateAndSave()}>
            {busy ? 'Comprobando…' : 'Validar y guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
