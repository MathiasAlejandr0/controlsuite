'use client'

import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, LockKeyhole, X } from 'lucide-react'
import { safeHttpUrl } from '@/lib/safe-url'
import { useWorkspace } from '@/lib/workspace'

export function SecretReveal() {
  const { reveal, closeReveal, pushToast } = useWorkspace()
  const [visible, setVisible] = useState(false)
  const [seconds, setSeconds] = useState(20)

  useEffect(() => {
    if (!reveal) return
    setVisible(false)
    setSeconds(20)
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          closeReveal()
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [closeReveal, reveal])

  if (!reveal) return null

  const stored = reveal.value
  const username = reveal.username
  const shownSecret = stored ? (visible ? stored : '••••••••••••••••••••') : 'Sin contraseña guardada'
  const shownUser = username ? (visible ? username : '••••••••') : 'Sin usuario guardado'

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    pushToast(`${label} copiado · se limpia en 30s`)
    window.setTimeout(() => {
      void navigator.clipboard.writeText('')
    }, 30_000)
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={closeReveal}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="reveal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-kicker">
            <LockKeyhole size={15} />
            Vault local · se cierra en {seconds}s
          </div>
          <button className="icon-button" onClick={closeReveal} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <h2 id="reveal-title">
          {reveal.projectName} · {reveal.serviceName}
        </h2>
        <p className="modal-sub">
          {reveal.secret.label}
          {reveal.aliased ? ' · mismo acceso que otro servicio' : ''}
        </p>

        <dl className="reveal-grid">
          {safeHttpUrl(reveal.secret.loginUrl) && (
            <div>
              <dt>Login</dt>
              <dd>
                <a href={safeHttpUrl(reveal.secret.loginUrl)} target="_blank" rel="noreferrer">
                  {reveal.secret.loginUrl!.replace(/^https?:\/\//, '')}
                </a>
              </dd>
            </div>
          )}
          {reveal.secret.mfa && (
            <div>
              <dt>2FA</dt>
              <dd>{reveal.secret.mfa}</dd>
            </div>
          )}
        </dl>

        <div className="secret-box">
          <div>
            <span>Usuario</span>
            <strong>{shownUser}</strong>
          </div>
          {username && (
            <button className="ghost-button" type="button" onClick={() => void copy(username, 'Usuario')}>
              <Copy size={15} />
              Copiar usuario
            </button>
          )}
        </div>

        <div className="secret-box">
          <div>
            <span>Contraseña</span>
            <strong>{shownSecret}</strong>
          </div>
          {stored && (
            <div className="secret-actions">
              <button className="ghost-button" type="button" onClick={() => void copy(stored, 'Contraseña')}>
                <Copy size={15} />
                Copiar clave
              </button>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={() => setVisible((value) => !value)} type="button">
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            {visible ? 'Ocultar valores' : 'Mostrar valores'}
          </button>
        </div>

        {reveal.secret.note && <p className="reveal-note">{reveal.secret.note}</p>}
        <p className="reveal-audit">
          El valor no viaja en el catálogo ni en los listados. Queda en{' '}
          <code>data/credentials.json</code> de este equipo. La auditoría no guarda la clave.
        </p>
      </div>
    </div>
  )
}
