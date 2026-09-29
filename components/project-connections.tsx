'use client'

import { useState } from 'react'
import type { Project } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

export function ProjectConnections({ project }: { project: Project }) {
  const { updateProject, refresh } = useWorkspace()
  const [productionUrl, setProductionUrl] = useState(project.productionUrl ?? '')
  const [localPath, setLocalPath] = useState(project.localPath)
  const [github, setGithub] = useState(
    project.services.find((service) => service.kind === 'github')?.externalId ?? '',
  )
  const [vercel, setVercel] = useState(
    project.services.find((service) => service.kind === 'vercel')?.externalId ?? '',
  )
  const [cloudflare, setCloudflare] = useState(
    project.services.find((service) => service.kind === 'cloudflare')?.externalId ?? '',
  )
  const [supabase, setSupabase] = useState(
    project.services.find((service) => service.kind === 'supabase')?.externalId ?? '',
  )
  const [sentry, setSentry] = useState(
    project.services.find((service) => service.kind === 'sentry')?.externalId ?? '',
  )
  const [tag, setTag] = useState(project.tag ?? 'trabajo')
  const [autoCompose, setAutoCompose] = useState(Boolean(project.autoCompose))
  const [autoPull, setAutoPull] = useState(Boolean(project.autoPull))

  async function save() {
    await updateProject(project.id, {
      productionUrl: productionUrl.trim() || undefined,
      localPath: localPath.trim(),
      githubRepo: github.trim(),
      vercelProject: vercel.trim(),
      cloudflareZone: cloudflare.trim(),
      supabaseRef: supabase.trim(),
      sentryProject: sentry.trim(),
      tag,
      autoCompose,
      autoPull,
    })
    await refresh(project.id)
  }

  return (
    <section className="section-block">
      <h2>Conexiones reales</h2>
      <div className="form-grid">
        <label>
          URL de producción
          <input value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} />
        </label>
        <label>
          Path local
          <input
            value={localPath}
            onChange={(event) => setLocalPath(event.target.value)}
            placeholder="D:\RgMotors o github://owner/repo"
          />
        </label>
        <label>
          GitHub owner/repo
          <input value={github} onChange={(event) => setGithub(event.target.value)} />
        </label>
        <label>
          Proyecto Vercel
          <input value={vercel} onChange={(event) => setVercel(event.target.value)} />
        </label>
        <label className="form-span">
          Zona Cloudflare
          <input value={cloudflare} onChange={(event) => setCloudflare(event.target.value)} />
        </label>
        <label>
          Ref de Supabase
          <input
            value={supabase}
            onChange={(event) => setSupabase(event.target.value)}
            placeholder="abcdefghijklmnop"
          />
        </label>
        <label>
          Sentry org/proyecto
          <input
            value={sentry}
            onChange={(event) => setSentry(event.target.value)}
            placeholder="mi-org/mi-proyecto"
          />
        </label>
        <label>
          Ámbito
          <select value={tag} onChange={(event) => setTag(event.target.value as 'trabajo' | 'casa')}>
            <option value="trabajo">Trabajo</option>
            <option value="casa">Casa</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={autoCompose} onChange={(event) => setAutoCompose(event.target.checked)} />
          Levantar compose solo si el watchdog ve el proyecto caído
        </label>
        <label>
          <input type="checkbox" checked={autoPull} onChange={(event) => setAutoPull(event.target.checked)} />
          git pull --ff-only en cada tick del watchdog
        </label>
      </div>
      <button type="button" className="primary-button" onClick={() => void save()}>
        Guardar y chequear
      </button>
    </section>
  )
}
