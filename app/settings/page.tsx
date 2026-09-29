'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WatchdogPanel } from '@/components/watchdog-panel'
import { useWorkspace } from '@/lib/workspace'

export default function SettingsPage() {
  const { profile, credentials, saveProfile, setupPin, lockSession, importCatalog } = useWorkspace()
  const [name, setName] = useState(profile.name)
  const [initials, setInitials] = useState(profile.initials)
  const [label, setLabel] = useState(profile.label)
  const [scanRoots, setScanRoots] = useState((profile.scanRoots ?? []).join('\n'))
  const [pin, setPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [importError, setImportError] = useState('')

  useEffect(() => {
    setName(profile.name)
    setInitials(profile.initials)
    setLabel(profile.label)
    setScanRoots((profile.scanRoots ?? []).join('\n'))
  }, [profile])

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h1>Ajustes</h1>
          <p>
            Perfil, PIN y copia del catálogo. Las cuentas de los proveedores están en{' '}
            <Link href="/integrations">Cuentas</Link>.
          </p>
        </div>
      </section>

      <section>
        <h2>Perfil</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void saveProfile({
              name,
              initials,
              label,
              scanRoots: scanRoots
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }}
        >
          <label>
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Iniciales
            <input value={initials} onChange={(event) => setInitials(event.target.value)} maxLength={4} />
          </label>
          <label className="form-span">
            Etiqueta
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <div className="form-span modal-actions">
            <button className="primary-button" type="submit">
              Guardar perfil
            </button>
            <button className="ghost-button" type="button" onClick={() => void lockSession()}>
              Bloquear
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>PIN</h2>
        <p className="modal-sub">
          {credentials.hasPin ? 'Para cambiarlo, ingresá el actual.' : 'Todavía no hay PIN.'}
        </p>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void setupPin(pin, currentPin || undefined).then((ok) => {
              if (ok) {
                setPin('')
                setCurrentPin('')
              }
            })
          }}
        >
          {credentials.hasPin && (
            <label>
              PIN actual
              <input type="password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} />
            </label>
          )}
          <label>
            PIN nuevo
            <input type="password" minLength={6} value={pin} onChange={(event) => setPin(event.target.value)} />
          </label>
          <div className="form-span modal-actions">
            <button className="ghost-button" type="submit">
              Guardar PIN
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>Copia del catálogo</h2>
        <p className="modal-sub">El archivo no incluye tokens.</p>
        <div className="modal-actions">
          <a className="ghost-button" href="/api/export">
            Descargar
          </a>
          <label className="ghost-button">
            Importar
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((text) => {
                  try {
                    setImportError('')
                    void importCatalog(JSON.parse(text))
                  } catch {
                    setImportError('Ese archivo no es un JSON válido.')
                  }
                })
              }}
            />
          </label>
        </div>
        {importError && <p className="form-error">{importError}</p>}
      </section>

      <details className="fold">
        <summary>Ver detalles</summary>
        <label>
          Carpetas para buscar proyectos (una por línea)
          <textarea
            rows={3}
            value={scanRoots}
            onChange={(event) => setScanRoots(event.target.value)}
            placeholder={'D:\\\nD:\\trabajo'}
          />
        </label>
        <div className="quiet-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              void saveProfile({
                name,
                initials,
                label,
                scanRoots: scanRoots
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          >
            Guardar carpetas
          </button>
        </div>
        <WatchdogPanel />
      </details>
    </div>
  )
}
