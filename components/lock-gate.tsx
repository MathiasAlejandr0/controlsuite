'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace'

export function LockGate({ children }: { children: React.ReactNode }) {
  const { ready, gate, recoverTarget, unlock, setupPin, restoreBackup } = useWorkspace()

  if (!ready || gate === 'loading') {
    return <div className="empty-state lock-full">Cargando suite…</div>
  }

  if (gate === 'recover') {
    return (
      <RecoverPanel
        target={recoverTarget ?? 'workspace'}
        onRestore={(item, pin) => restoreBackup(item, pin)}
      />
    )
  }

  if (gate === 'setup') {
    return <PinForm mode="setup" onSubmit={(pin) => setupPin(pin)} />
  }

  if (gate === 'locked') {
    return <PinForm mode="unlock" onSubmit={(pin) => unlock(pin)} />
  }

  return children
}

function RecoverPanel({
  target,
  onRestore,
}: {
  target: 'workspace' | 'credentials'
  onRestore: (target: 'workspace' | 'credentials', pin?: string) => Promise<boolean>
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const needsPin = target === 'workspace'

  return (
    <div className="lock-full">
      <section className="modal lock-card">
        <div className="modal-kicker">
          <ShieldCheck size={15} />
          Recuperación
        </div>
        <h2>El archivo {target === 'credentials' ? 'del vault' : 'del catálogo'} está corrupto</h2>
        <p className="modal-sub">
          No se pisa el archivo roto. Si existe un .bak, se puede restaurar. Si no, no inventamos
          proyectos ni borramos tokens.
        </p>
        {needsPin && (
          <label>
            PIN de este equipo
            <input
              type="password"
              autoComplete="current-password"
              minLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            className="primary-button"
            type="button"
            disabled={busy || (needsPin && pin.trim().length < 6)}
            onClick={() => {
              setBusy(true)
              setError('')
              void onRestore(target, needsPin ? pin : undefined)
                .then((ok) => {
                  if (!ok) setError('No se pudo restaurar. Revisá el PIN o el .bak.')
                })
                .finally(() => setBusy(false))
            }}
          >
            Restaurar {target}.json.bak
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setError('')
              void onRestore(target === 'workspace' ? 'credentials' : 'workspace', pin || undefined)
                .then((ok) => {
                  if (!ok) setError('Ese backup no se pudo aplicar.')
                })
                .finally(() => setBusy(false))
            }}
          >
            Probar el otro backup
          </button>
        </div>
      </section>
    </div>
  )
}

function PinForm({
  mode,
  onSubmit,
}: {
  mode: 'setup' | 'unlock'
  onSubmit: (pin: string) => Promise<boolean>
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="lock-full">
      <form
        className="modal lock-card"
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          void onSubmit(pin)
            .then((ok) => {
              if (!ok) {
                setError(
                  mode === 'setup'
                    ? 'No se pudo guardar el PIN. Probá de nuevo.'
                    : 'PIN incorrecto.',
                )
              }
            })
            .finally(() => setBusy(false))
        }}
      >
        <div className="modal-kicker">
          <ShieldCheck size={15} />
          {mode === 'setup' ? 'Primer arranque' : 'Suite bloqueada'}
        </div>
        <h2>{mode === 'setup' ? 'Definí un PIN de este equipo' : 'Desbloqueá la suite'}</h2>
        <p className="modal-sub">
          {mode === 'setup'
            ? 'Mínimo 6 caracteres. Sin esto, revelar secretos y las APIs quedan cerradas. Se guarda hasheado en el vault.'
            : 'El PIN vive solo en este Windows. No hay recuperación remota.'}
        </p>
        <label>
          PIN
          <input
            type="password"
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            minLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="primary-button" type="submit" disabled={busy || pin.trim().length < 6}>
            {busy ? 'Comprobando…' : mode === 'setup' ? 'Guardar PIN' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
