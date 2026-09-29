'use client'

import { useMemo, useState } from 'react'
import { Link2, RefreshCw, Unplug } from 'lucide-react'
import { connectionState, type LinkState } from '@/lib/connection-status'
import { serviceMeta } from '@/lib/labels'
import { TOKEN_GUIDES, type ConnectKind } from '@/lib/service-link'
import type { Project, Service } from '@/lib/types'
import { formatRelative } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'

const KINDS: ConnectKind[] = ['github', 'vercel', 'supabase', 'cloudflare', 'sentry']

type Resource = { id: string; label: string; hint?: string }

function placeholder(project: Project, kind: ConnectKind): Service {
  const guide = TOKEN_GUIDES[kind]
  return {
    id: `${project.id}-${kind}`,
    kind,
    name: guide.label,
    role: 'Sin enlazar',
    status: 'unknown',
    secretRefs: [],
    checks: [],
  }
}

export function ServiceConnect({ project }: { project: Project }) {
  const { credentials, refresh, refreshing, reload, pushToast } = useWorkspace()
  const [kind, setKind] = useState<ConnectKind | null>(null)
  const [token, setToken] = useState('')
  const [resources, setResources] = useState<Resource[]>([])
  const [resourceId, setResourceId] = useState('')
  const [teamId, setTeamId] = useState<string>()
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cards = useMemo(() => {
    return KINDS.map((item) => project.services.find((service) => service.kind === item) ?? placeholder(project, item))
  }, [project])

  function open(next: ConnectKind) {
    setKind(next)
    setToken('')
    setResources([])
    setResourceId('')
    setTeamId(undefined)
    setAccount('')
    setError('')
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/projects/${project.id}/connect-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? 'No se pudo conectar')
    return payload as {
      account?: string
      resources?: Resource[]
      teamId?: string
      projects?: Project[]
    }
  }

  async function validate() {
    if (!kind) return
    setBusy(true)
    setError('')
    try {
      const payload = await post({ kind, phase: 'validate', token })
      setAccount(payload.account ?? '')
      setResources(payload.resources ?? [])
      setTeamId(payload.teamId)
      setResourceId(payload.resources?.[0]?.id ?? '')
      if ((payload.resources ?? []).length === 0) {
        setError('El token es válido, pero no ve recursos. Revisá los scopes.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Token rechazado')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!kind || !resourceId) return
    setBusy(true)
    setError('')
    try {
      await post({ kind, phase: 'save', token: token.trim() || undefined, resourceId, teamId })
      setToken('')
      setKind(null)
      await reload()
      pushToast('Servicio enlazado')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  async function act(serviceKind: ConnectKind, phase: 'test' | 'disconnect' | 'forget') {
    setBusy(true)
    try {
      await post({ kind: serviceKind, phase })
      await reload()
      if (phase === 'test') pushToast('Chequeo listo')
      else pushToast(phase === 'forget' ? 'Token borrado de la bóveda' : 'Servicio desconectado')
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'No se pudo completar', 'warn')
    } finally {
      setBusy(false)
    }
  }

  const guide = kind ? TOKEN_GUIDES[kind] : null

  return (
    <section className="section-block">
      <div className="panel-header" style={{ padding: 0 }}>
        <div>
          <h2>Servicios del proyecto</h2>
          <p>Cada tarjeta se conecta como un plugin: token, validación y recurso. El estado sale del último chequeo.</p>
        </div>
      </div>
      <div className="connect-grid">
        {cards.map((service) => {
          const meta = serviceMeta[service.kind]
          const connectKind = service.kind as ConnectKind
          const link = connectionState({
            hasToken: Boolean(credentials.integrations[connectKind]),
            externalId: service.externalId,
            checks: service.checks,
          })
          return (
            <article key={service.kind} className="connect-card">
              <header>
                <div>
                  <span className={`chip icon-${meta.tone}`}>{meta.label}</span>
                  <h3>{service.name}</h3>
                </div>
                <LinkBadge state={link.state} />
              </header>
              <p>{service.role}</p>
              <p className="connect-detail">{service.externalId || link.detail}</p>
              <p className="connect-meta">
                Último chequeo {project.lastSyncedAt ? formatRelative(project.lastSyncedAt) : 'todavía no'}
              </p>
              <div className="service-actions">
                <button type="button" className="primary-button" onClick={() => open(connectKind)} disabled={busy}>
                  <Link2 size={14} />
                  Conectar
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy || refreshing}
                  onClick={() => void act(connectKind, 'test')}
                >
                  <RefreshCw size={14} />
                  Probar
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy || !service.externalId}
                  onClick={() => void act(connectKind, 'disconnect')}
                >
                  <Unplug size={14} />
                  Desconectar
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {guide && (
        <div className="modal-scrim" role="presentation" onClick={() => setKind(null)}>
          <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <p className="modal-kicker">Conectar {guide.label}</p>
              <h2>Token y recurso</h2>
              <p className="modal-sub">
                El token se valida contra la API del proveedor antes de entrar a la bóveda. No vuelve al navegador.
              </p>
            </div>
            <p>
              <a href={guide.tokenUrl} target="_blank" rel="noreferrer">
                Crear token en {guide.label}
              </a>
            </p>
            <ul className="scope-list">
              {guide.scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
            {guide.oauth && (
              <p>
                <a
                  href={`/api/connect/start?provider=github&projectId=${encodeURIComponent(project.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  O usar la GitHub App, como un plugin de Cursor
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
                placeholder="Se queda en este equipo"
              />
            </label>
            {account && <p className="connect-meta">Cuenta vista: {account}</p>}
            {resources.length > 0 && (
              <label>
                Recurso de este proyecto
                <select value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
                  {resources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.hint ? ` · ${item.hint}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setKind(null)}>
                Cerrar
              </button>
              {credentials.integrations[guide.kind] && (
                <button type="button" className="ghost-button" disabled={busy} onClick={() => void act(guide.kind, 'forget')}>
                  Olvidar token
                </button>
              )}
              <button type="button" className="ghost-button" disabled={busy || token.trim().length < 8} onClick={() => void validate()}>
                {busy ? 'Validando…' : 'Validar'}
              </button>
              <button type="button" className="primary-button" disabled={busy || !resourceId} onClick={() => void save()}>
                Guardar enlace
              </button>
            </div>
          </div>
        </div>
      )}
      <button type="button" className="ghost-button" disabled={refreshing} onClick={() => void refresh(project.id)}>
        <RefreshCw size={14} />
        {refreshing ? 'Chequeando…' : 'Chequear este proyecto'}
      </button>
    </section>
  )
}

function LinkBadge({ state }: { state: LinkState }) {
  const label = state === 'conectado' ? 'Conectado' : state === 'error' ? 'Error' : 'Sin conectar'
  return <span className={`link-badge link-${state === 'conectado' ? 'ok' : state === 'error' ? 'bad' : 'off'}`}>{label}</span>
}
