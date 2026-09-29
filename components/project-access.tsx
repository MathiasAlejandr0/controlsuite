'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, LockKeyhole } from 'lucide-react'
import { isAccountLogin } from '@/lib/access'
import { safeHttpUrl } from '@/lib/safe-url'
import type { Project, Service } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

const SKIP_KINDS = new Set(['uptime', 'docker'])

export function ProjectAccess({ project }: { project: Project }) {
  const { credentials, saveAccess, openReveal } = useWorkspace()
  const services = project.services.filter((service) => !SKIP_KINDS.has(service.kind))

  if (services.length === 0) {
    return (
      <section className="section-block">
        <h2>Accesos de cuenta</h2>
        <div className="empty-state">Este proyecto no tiene servicios con login.</div>
      </section>
    )
  }

  return (
    <section className="section-block">
      <h2>Accesos de cuenta</h2>
      <p className="modal-sub">
        Usuario y contraseña viven en este PC. La lista nunca muestra el valor: solo Revelar, con
        auditoría y cierre a los 20s.
      </p>
      <div className="access-list">
        {services.map((service) => (
          <AccessCard
            key={service.id}
            project={project}
            service={service}
            access={credentials.access}
            onSave={saveAccess}
            onReveal={() => {
              const secret =
                service.secretRefs.find(isAccountLogin) ?? service.secretRefs[0]
              if (!secret) return
              void openReveal({
                secret,
                projectName: project.name,
                serviceName: service.name,
                projectId: project.id,
                serviceId: service.id,
              })
            }}
          />
        ))}
      </div>
    </section>
  )
}

function AccessCard({
  project,
  service,
  access,
  onSave,
  onReveal,
}: {
  project: Project
  service: Service
  access: Record<string, { stored: boolean; username: boolean; aliased: boolean }>
  onSave: ReturnType<typeof useWorkspace>['saveAccess']
  onReveal: () => void
}) {
  const login = service.secretRefs.find(isAccountLogin)
  const flag = login ? access[login.id] : undefined
  const aliases = useMemo(
    () =>
      project.services
        .filter((item) => item.id !== service.id)
        .flatMap((item) => {
          const secret = item.secretRefs.find(isAccountLogin)
          return secret ? [{ service: item, secret }] : []
        }),
    [project.services, service.id],
  )
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginUrl, setLoginUrl] = useState(login?.loginUrl ?? service.dashboardUrl ?? '')
  const [mfa, setMfa] = useState(login?.mfa ?? '')
  const [note, setNote] = useState(login?.note ?? '')
  const [aliasOf, setAliasOf] = useState(flag?.aliased ? '' : '')
  const [busy, setBusy] = useState(false)

  const status = flag?.aliased
    ? 'Usa el acceso de otro servicio'
    : flag?.stored || flag?.username
      ? 'Guardado en este equipo'
      : 'Sin usuario ni clave'

  async function save(asAlias?: string) {
    setBusy(true)
    await onSave({
      projectId: project.id,
      serviceId: service.id,
      loginUrl,
      mfa,
      note,
      ...(asAlias
        ? { aliasOfSecretId: asAlias }
        : {
            username: username || undefined,
            password: password || undefined,
          }),
    })
    setPassword('')
    setUsername('')
    setBusy(false)
    setOpen(false)
  }

  return (
    <article className="access-card">
      <header>
        <div>
          <h3>{service.name}</h3>
          <p>{status}</p>
        </div>
        <div className="access-actions">
          {(flag?.stored || flag?.username || flag?.aliased) && (
            <button type="button" className="ghost-button" onClick={onReveal}>
              <LockKeyhole size={14} />
              Revelar
            </button>
          )}
          {safeHttpUrl(service.dashboardUrl) && (
            <a className="ghost-button" href={safeHttpUrl(service.dashboardUrl)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Entrar
            </a>
          )}
          <button type="button" className="primary-button" onClick={() => setOpen((value) => !value)}>
            {open ? 'Cerrar' : 'Configurar'}
          </button>
        </div>
      </header>

      {open && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>
            Usuario / email
            <input
              autoComplete="off"
              placeholder={flag?.username ? '••••  (dejar vacío para conservar)' : 'el que usás para entrar'}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="new-password"
              placeholder={flag?.stored ? '••••  (dejar vacío para conservar)' : 'no se lista en la UI'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            URL de login
            <input value={loginUrl} onChange={(event) => setLoginUrl(event.target.value)} />
          </label>
          <label>
            2FA / nota corta
            <input
              placeholder="Auth app, SMS…"
              value={mfa}
              onChange={(event) => setMfa(event.target.value)}
            />
          </label>
          <label className="form-span">
            Nota
            <input
              placeholder="Ej. Cloudflare entra con GitHub"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {aliases.length > 0 && (
            <label className="form-span">
              O usar el mismo acceso que
              <select value={aliasOf} onChange={(event) => setAliasOf(event.target.value)}>
                <option value="">Guardar usuario y clave propios</option>
                {aliases.map(({ service: other, secret }) => (
                  <option key={secret.id} value={secret.id}>
                    {other.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-span modal-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void save(aliasOf || undefined)}
            >
              {busy ? 'Guardando…' : 'Guardar en este equipo'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
