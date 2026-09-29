'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { serviceMeta } from '@/lib/labels'
import type { HealthStatus, IntegrationId, ServiceKind } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

type GithubUser = {
  login: string
  name?: string | null
  htmlUrl: string
}

type AccountRepo = {
  fullName: string
  description: string
  private: boolean
  language?: string
  homepage?: string
  alreadyImported: boolean
}

type DockerSnapshot = {
  installed: boolean
  running: boolean
  version?: string
  containers: Array<{ name: string; image: string; status: string; running: boolean }>
  composeProjects: Array<{ name: string; status: string }>
}

type ToolStatus = {
  id: string
  label: string
  group: 'local' | 'cloud'
  status: HealthStatus
  detail: string
}

const CLOUD: Array<{ kind: ServiceKind; note: string; live?: IntegrationId | 'http' | 'docker' }> = [
  { kind: 'github', note: 'Cuenta + repos + Actions', live: 'github' },
  { kind: 'docker', note: 'Daemon local y compose', live: 'docker' },
  { kind: 'uptime', note: 'HTTP + TLS sin token', live: 'http' },
  { kind: 'vercel', note: 'Deploys, build, runtime, dominio y firewall', live: 'vercel' },
  { kind: 'cloudflare', note: 'Zona, SSL, WAF y picos', live: 'cloudflare' },
  { kind: 'supabase', note: 'Salud, advisors, backups y uso', live: 'supabase' },
  { kind: 'sentry', note: 'Issues abiertas y picos', live: 'sentry' },
]

function tone(status: HealthStatus) {
  if (status === 'healthy') return 'ok'
  if (status === 'down') return 'down'
  if (status === 'degraded') return 'warn'
  return 'unknown'
}

export default function IntegrationsPage() {
  const { credentials, importGithubRepos } = useWorkspace()
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [docker, setDocker] = useState<DockerSnapshot | null>(null)
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<AccountRepo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [envBusy, setEnvBusy] = useState(true)
  const [ghBusy, setGhBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectable = useMemo(
    () => repos.filter((repo) => !repo.alreadyImported).map((repo) => repo.fullName),
    [repos],
  )

  async function loadEnvironment() {
    setEnvBusy(true)
    try {
      const response = await fetch('/api/environment')
      const payload = await response.json()
      setTools(payload.tools ?? [])
      setDocker(payload.docker ?? null)
    } finally {
      setEnvBusy(false)
    }
  }

  async function loadGithub() {
    if (!credentials.integrations.github) {
      setUser(null)
      setRepos([])
      return
    }
    setGhBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/github/account')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo leer GitHub')
      setUser(payload.user)
      setRepos(payload.repos ?? [])
      setSelected(
        (payload.repos as AccountRepo[])
          .filter((repo) => !repo.alreadyImported)
          .map((repo) => repo.fullName),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer GitHub')
    } finally {
      setGhBusy(false)
    }
  }

  useEffect(() => {
    void loadEnvironment()
  }, [])

  useEffect(() => {
    void loadGithub()
    // credentials.integrations.github
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials.integrations.github])

  function toggle(fullName: string) {
    setSelected((current) =>
      current.includes(fullName) ? current.filter((item) => item !== fullName) : [...current, fullName],
    )
  }

  async function importSelected() {
    setImporting(true)
    const ids = await importGithubRepos(selected)
    setImporting(false)
    if (ids.length > 0) await loadGithub()
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Entorno
          </div>
          <h1>
            Todo lo que usás para programar<span className="heading-period">.</span>
          </h1>
          <p>
            Herramientas de este PC, Docker local y tu GitHub personal. Los tokens se pegan en
            Ajustes.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={envBusy}
            onClick={() => {
              void loadEnvironment()
              void loadGithub()
            }}
          >
            <RefreshCw size={16} />
            {envBusy ? 'Leyendo…' : 'Releer entorno'}
          </button>
          <Link href="/settings" className="primary-button">
            Enlazar cuentas
          </Link>
        </div>
      </section>

      <section className="section-block">
        <h2>Este equipo</h2>
        <div className="env-grid">
          {tools.map((tool) => (
            <article key={tool.id} className={`env-card env-${tone(tool.status)}`}>
              <header>
                <strong>{tool.label}</strong>
                <span>{tool.group === 'local' ? 'Local' : 'Nube'}</span>
              </header>
              <p>{tool.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <h2>Docker</h2>
        {!docker || !docker.installed ? (
          <div className="empty-state">
            No encontramos Docker en el PATH. Instalá Docker Desktop y volvé a leer el entorno.
          </div>
        ) : !docker.running ? (
          <div className="empty-state">
            Docker está instalado pero el daemon no responde. Abrí Docker Desktop.
          </div>
        ) : (
          <>
            <p className="modal-sub">
              Daemon {docker.version} · {docker.containers.length} contenedores ·{' '}
              {docker.composeProjects.length} proyectos compose
            </p>
            <div className="disk-list">
              {docker.containers.length === 0 && (
                <div className="empty-state">Ningún contenedor arriba ahora.</div>
              )}
              {docker.containers.map((container) => (
                <div key={container.name} className="disk-row">
                  <span className={`status-dot status-${container.running ? 'healthy' : 'down'}`} />
                  <div>
                    <strong>{container.name}</strong>
                    <span>
                      {container.image} · {container.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="section-block">
        <h2>GitHub personal</h2>
        {!credentials.integrations.github ? (
          <div className="empty-state">
            Pegá un PAT en <Link href="/settings">Ajustes</Link> y acá aparecen tus repos para
            importarlos al catálogo.
          </div>
        ) : (
          <>
            <p className="modal-sub">
              {ghBusy
                ? 'Leyendo la cuenta…'
                : user
                  ? `${user.name || user.login} · ${repos.length} repos · ${user.htmlUrl}`
                  : 'Token presente. Releé el entorno si no carga la cuenta.'}
            </p>
            {error && <div className="disk-error">{error}</div>}
            <div className="disk-list">
              {repos.map((repo) => (
                <label
                  key={repo.fullName}
                  className={`disk-row ${repo.alreadyImported ? 'is-imported' : ''} ${selected.includes(repo.fullName) ? 'is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(repo.fullName)}
                    disabled={repo.alreadyImported}
                    onChange={() => toggle(repo.fullName)}
                  />
                  <div>
                    <strong>{repo.fullName}</strong>
                    <span>
                      {repo.private ? 'Privado' : 'Público'}
                      {repo.language ? ` · ${repo.language}` : ''}
                      {repo.homepage ? ` · ${repo.homepage}` : ''}
                      {repo.alreadyImported ? ' · ya en el catálogo' : ''}
                    </span>
                    <em>{repo.description}</em>
                  </div>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={selectable.length === 0}
                onClick={() => setSelected(selectable)}
              >
                Elegir todos
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={importing || selected.length === 0}
                onClick={() => void importSelected()}
              >
                {importing ? 'Importando…' : `Importar ${selected.length || ''}`}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="section-block">
        <h2>Conectores</h2>
        <div className="service-grid">
          {CLOUD.map((item) => {
            const meta = serviceMeta[item.kind]
            const configured =
              item.live === 'http' ||
              item.live === 'docker' ||
              (item.live ? credentials.integrations[item.live] : false)
            return (
              <article key={item.kind} className="service-card">
                <header>
                  <div>
                    <h3>{item.live === 'http' ? 'HTTP uptime' : meta.label}</h3>
                    <p>{item.note}</p>
                  </div>
                  <span className="chip">{configured ? 'Listo' : 'Falta token'}</span>
                </header>
                <p>
                  {item.live === 'http'
                    ? 'Activo ahora. No requiere token.'
                    : item.live === 'docker'
                      ? docker?.running
                        ? 'Daemon en este equipo.'
                        : 'Usa Docker Desktop local.'
                      : configured
                        ? 'Token presente en este equipo.'
                        : 'Falta token en Ajustes.'}
                </p>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}
