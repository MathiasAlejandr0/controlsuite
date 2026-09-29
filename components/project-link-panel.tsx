'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Link2, RefreshCw } from 'lucide-react'
import { isAccountLogin } from '@/lib/access'
import { linkTarget } from '@/lib/link-target'
import type { LinkProvider, StackNeed, VaultState } from '@/lib/types'
import { vaultState } from '@/lib/vault-state'
import { useWorkspace } from '@/lib/workspace'

type NeedsPayload = {
  analyzed?: boolean
  needs?: StackNeed[]
  harvestable?: Partial<Record<LinkProvider, boolean>>
  error?: string
}

function openPermissionWindow(url: string) {
  const popup = window.open(url, 'suite-permisos', 'width=560,height=780,noopener=yes')
  if (!popup) window.location.assign(url)
  return popup
}

export function ProjectLinkPanel({ projectId }: { projectId: string }) {
  const { credentials, projects, pushToast, reload, refresh, saveAccess } = useWorkspace()
  const project = projects.find((item) => item.id === projectId)
  const [needs, setNeeds] = useState<StackNeed[]>([])
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const [emailUser, setEmailUser] = useState('')
  const [emailPass, setEmailPass] = useState('')

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/needs`, { cache: 'no-store' })
    const payload = (await response.json()) as NeedsPayload
    if (!response.ok) {
      setError(payload.error ?? 'No se pudo analizar el repo.')
      return
    }
    setError('')
    setNeeds(payload.needs ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.suite !== 'linked') return
      void reload()
      void refresh(projectId)
      void load()
      pushToast('Acceso guardado en la bóveda')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load, projectId, pushToast, refresh, reload])

  async function applyDetected() {
    setBusy('apply')
    const response = await fetch(`/api/projects/${projectId}/apply-stack`, { method: 'POST' })
    const payload = await response.json()
    setBusy(undefined)
    if (!response.ok) {
      pushToast(payload.error ?? 'No se pudo aplicar lo detectado', 'warn')
      return
    }
    await reload()
    await load()
    pushToast('Servicios detectados en el código')
  }

  function authorize(need: StackNeed) {
    const provider = linkTarget(need)
    if (!provider) return
    const url = `/api/connect/start?provider=${encodeURIComponent(provider)}&projectId=${encodeURIComponent(projectId)}`
    openPermissionWindow(url)
    pushToast(`Autorizá ${need.label} en la ventana de permisos`)
  }

  async function saveEmail() {
    const service = project?.services.find((item) => item.kind === 'email')
    if (!service) {
      await applyDetected()
    }
    const latest = projects.find((item) => item.id === projectId)
    const email = (latest ?? project)?.services.find((item) => item.kind === 'email')
    const login = email?.secretRefs.find(isAccountLogin)
    if (!email || !login) {
      pushToast('Aplicá los IDs detectados para crear el correo en la bóveda', 'warn')
      return
    }
    setBusy('email')
    await saveAccess({
      projectId,
      serviceId: email.id,
      username: emailUser,
      password: emailPass,
    })
    setBusy(undefined)
    setEmailPass('')
    await reload()
    await load()
    pushToast('Correo guardado en la bóveda')
  }

  const rows = needs
    .filter((need) => need.provider !== 'docker' && need.provider !== 'sentry')
    .map((need) => ({ need, state: vaultState(need, credentials, project) as VaultState }))
  const pending = rows.filter((row) => row.state !== 'ready')

  if (rows.length === 0 && !error) return null

  return (
    <section className="section-block">
      <h2>Bóveda del proyecto</h2>
      <p className="modal-sub">
        {pending.length === 0
          ? 'Todo lo que este repo necesita ya está autorizado. El sync vigila sin volver a pedir el enlace.'
          : 'Cada botón abre la ventana de permisos oficial. Cuando el acceso funciona, el botón desaparece.'}
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="need-list">
        {rows.map(({ need, state }) => (
          <article key={`${need.provider}-${need.label}`} className="need-row">
            <div>
              <strong>
                {need.label}
                {state === 'ready' ? ' · en control' : state === 'broken' ? ' · acceso caído' : ''}
              </strong>
              <p>
                {state === 'ready'
                  ? 'Autorizado. Suite Control ya puede leer este servicio.'
                  : need.detail}
              </p>
              {need.evidence.length > 0 && state !== 'ready' && (
                <div className="need-evidence">{need.evidence.join(' · ')}</div>
              )}
              {need.provider === 'email' && state !== 'ready' && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>
                    Usuario / email
                    <input value={emailUser} onChange={(event) => setEmailUser(event.target.value)} autoComplete="off" />
                  </label>
                  <label>
                    Clave
                    <input
                      type="password"
                      value={emailPass}
                      onChange={(event) => setEmailPass(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="need-actions">
              {state === 'ready' && (
                <span className="ghost-button" style={{ pointerEvents: 'none' }}>
                  <Check size={14} />
                  En control
                </span>
              )}
              {state !== 'ready' && need.provider === 'email' && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy === 'email' || !emailUser || !emailPass}
                  onClick={() => void saveEmail()}
                >
                  Guardar en la bóveda
                </button>
              )}
              {state !== 'ready' && need.canLink && linkTarget(need) && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={Boolean(busy)}
                  onClick={() => authorize(need)}
                >
                  <Link2 size={14} />
                  {state === 'broken' ? `Reautorizar ${need.label}` : `Autorizar ${need.label}`}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="ghost-button" onClick={() => void load()}>
          <RefreshCw size={14} />
          Volver a leer el repo
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={busy === 'apply'}
          onClick={() => void applyDetected()}
        >
          Aplicar IDs detectados
        </button>
      </div>
    </section>
  )
}
