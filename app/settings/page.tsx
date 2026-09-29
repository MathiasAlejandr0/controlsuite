'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LinkIntegrations } from '@/components/link-integrations'
import { WatchdogPanel } from '@/components/watchdog-panel'
import { useWorkspace } from '@/lib/workspace'
import type { IntegrationId } from '@/lib/types'

const FIELDS: Array<{ id: IntegrationId; label: string; hint: string }> = [
  { id: 'github', label: 'GitHub PAT', hint: 'Respaldo si no usás Enlazar. Fine-grained: Contents + Actions + Metadata' },
  { id: 'vercel', label: 'Vercel token', hint: 'Account → Tokens' },
  { id: 'cloudflare', label: 'Cloudflare API token', hint: 'Zone.Read + SSL.Read' },
  { id: 'sentry', label: 'Sentry token', hint: 'Issues y proyectos' },
  { id: 'supabase', label: 'Supabase access token', hint: 'Account tokens del Management API' },
  { id: 'insforge', label: 'InsForge token', hint: 'Respaldo si no usás Autorizar en el proyecto' },
]

export default function SettingsPage() {
  const {
    profile,
    credentials,
    saveIntegrations,
    projects,
    saveProfile,
    setupPin,
    lockSession,
    importCatalog,
  } = useWorkspace()
  const [values, setValues] = useState<Partial<Record<IntegrationId, string>>>({})
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})
  const [teamId, setTeamId] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
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

  const secrets = projects.flatMap((project) =>
    project.services.flatMap((service) =>
      service.secretRefs.map((secret) => ({
        project,
        service,
        secret,
      })),
    ),
  )

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            Ajustes
          </div>
          <h1>
            Tokens en este equipo<span className="heading-period">.</span>
          </h1>
          <p>
            Se guardan cifrados en la carpeta de datos de este usuario de Windows (AES +
            DPAPI). En el instalador: <code>%LOCALAPPDATA%\SuiteControl\data</code>. La UI
            nunca lista el valor, solo si está configurado.
          </p>
        </div>
      </section>

      <WatchdogPanel />

      <section className="section-block">
        <h2>Operador</h2>
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
          <label className="form-span">
            Raíces de scan (una por línea)
            <textarea
              rows={3}
              value={scanRoots}
              onChange={(event) => setScanRoots(event.target.value)}
              placeholder={'D:\\\nD:\\trabajo'}
            />
          </label>
          <div className="form-span modal-actions">
            <button className="primary-button" type="submit">
              Guardar perfil
            </button>
            <button className="ghost-button" type="button" onClick={() => void lockSession()}>
              Bloquear suite
            </button>
          </div>
        </form>
      </section>

      <section className="section-block">
        <h2>PIN de este equipo</h2>
        <p className="modal-sub">
          {credentials.hasPin ? 'Ya hay un PIN. Para cambiarlo, ingresá el actual.' : 'Todavía no hay PIN.'}
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
            <button className="primary-button" type="submit">
              Guardar PIN
            </button>
          </div>
        </form>
      </section>

      <section className="section-block">
        <h2>Backup del catálogo</h2>
        <p className="modal-sub">Exporta workspace sin tokens. El vault no viaja en el JSON.</p>
        <div className="modal-actions">
          <a className="primary-button" href="/api/export">
            Descargar catálogo
          </a>
          <label className="ghost-button">
            Importar JSON
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

      <section className="section-block">
        <h2>Enlazar con el navegador</h2>
        <p className="modal-sub">
          Preferí esto antes de pegar un token. Cada botón abre el login oficial y después
          recoge la sesión que ya dejó el CLI en este Windows.
        </p>
        <LinkIntegrations />
      </section>

      <section className="section-block">
        <h2>Integraciones (conectores en vivo)</h2>
        <p className="modal-sub">
          GitHub personal carga tus repos. Docker no pide token: usa el daemon de este PC.
          El resto se ve en <Link href="/integrations">Entorno</Link>. Pegá un token solo si el
          enlace por navegador no alcanza.
        </p>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void saveIntegrations({
              integrations: values,
              vercelTeamId: teamId || undefined,
              openaiKey: openaiKey || undefined,
            })
            setValues({})
            setOpenaiKey('')
          }}
        >
          {FIELDS.map((field) => (
            <label key={field.id} className={field.id === 'github' ? 'form-span' : undefined}>
              {field.label}
              {credentials.integrations[field.id] ? ' · configurado' : ' · faltante'}
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  credentials.integrations[field.id] ? '••••••••  (dejar vacío para conservar)' : field.hint
                }
                value={values[field.id] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.id]: event.target.value }))
                }
              />
            </label>
          ))}
          <label>
            Vercel team id (opcional)
            <input value={teamId} onChange={(event) => setTeamId(event.target.value)} />
          </label>
          <label className="form-span">
            OpenAI API key (opcional · pulir prompts)
            {credentials.openai ? ' · configurado' : ' · usa el compositor local'}
            <input
              type="password"
              autoComplete="off"
              placeholder={
                credentials.openai
                  ? '••••••••  (dejar vacío para conservar)'
                  : 'sk-…  Solo si querés que GPT reescriba el brief'
              }
              value={openaiKey}
              onChange={(event) => setOpenaiKey(event.target.value)}
            />
          </label>
          <div className="form-span modal-actions">
            <button className="primary-button" type="submit">
              Guardar tokens
            </button>
            <Link href="/integrations" className="ghost-button">
              Cargar GitHub y Docker
            </Link>
          </div>
        </form>
      </section>

      <section className="section-block">
        <h2>Secretos por servicio (passwords, PATs puntuales)</h2>
        <p className="modal-sub">
          Instagram, Meta y cualquier acceso. Esto es lo que “Revelar” muestra de verdad.
        </p>
        <div className="secret-list">
          {secrets.map(({ project, service, secret }) => (
            <div key={secret.id} className="secret-row">
              <div>
                <strong>
                  {project.name} · {service.name} · {secret.label}
                </strong>
                <p>{secret.id}</p>
              </div>
              <input
                type="password"
                className="inline-secret"
                placeholder="Pegar valor"
                value={secretDrafts[secret.id] ?? ''}
                onChange={(event) =>
                  setSecretDrafts((current) => ({ ...current, [secret.id]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="primary-button"
          style={{ marginTop: 12 }}
          onClick={() => {
            const filled = Object.fromEntries(
              Object.entries(secretDrafts).filter(([, value]) => value.trim()),
            )
            void saveIntegrations({ secrets: filled })
            setSecretDrafts({})
          }}
        >
          Guardar secretos
        </button>
      </section>
    </>
  )
}
