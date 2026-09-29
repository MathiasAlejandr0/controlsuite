'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, FolderOpen, HardDrive, RefreshCw, X } from 'lucide-react'
import type { DiskAnalysis, DiskFolder, ProjectDraft, ProjectKind } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace'

const KINDS: Array<{ id: ProjectKind; label: string }> = [
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'backend', label: 'Backend' },
]

const KIND_LABEL: Record<ProjectKind, string> = {
  web: 'Web',
  mobile: 'Mobile',
  desktop: 'Desktop',
  backend: 'Backend',
}

export function ProjectForm({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'disk' | 'manual'>('disk')

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div className="modal modal-wide modal-disk" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-kicker">Nuevo proyecto</div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <h2>Sumar al catálogo</h2>
        <p className="modal-sub">
          Elegí carpetas del disco. Leemos el código, detectamos GitHub, Vercel, Cloudflare o
          base de datos y en el detalle te damos botones para enlazar sin inventar llaves.
        </p>
        <div className="form-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`filter-button ${tab === 'disk' ? 'active' : ''}`}
            aria-selected={tab === 'disk'}
            onClick={() => setTab('disk')}
          >
            Desde el disco
          </button>
          <button
            type="button"
            role="tab"
            className={`filter-button ${tab === 'manual' ? 'active' : ''}`}
            aria-selected={tab === 'manual'}
            onClick={() => setTab('manual')}
          >
            Carga manual
          </button>
        </div>
        {tab === 'disk' ? <DiskImporter onClose={onClose} /> : <ManualForm onClose={onClose} />}
      </div>
    </div>
  )
}

function DiskImporter({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { importProjects } = useWorkspace()
  const [path, setPath] = useState('D:\\')
  const [roots, setRoots] = useState<string[]>(['D:\\'])
  const [folders, setFolders] = useState<DiskFolder[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [projects, setProjects] = useState<DiskAnalysis[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'scan' | 'browse'>('scan')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectable = useMemo(
    () => projects.filter((item) => !item.alreadyImported).map((item) => item.path),
    [projects],
  )

  async function loadScan(target = path) {
    setBusy(true)
    setError(null)
    setMode('scan')
    try {
      const response = await fetch(`/api/disk/scan?path=${encodeURIComponent(target)}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo escanear')
      setPath(payload.path)
      setRoots(payload.roots ?? roots)
      setProjects(payload.projects ?? [])
      setSelected(
        (payload.projects as DiskAnalysis[])
          .filter((item) => !item.alreadyImported)
          .map((item) => item.path),
      )
      setFolders([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo escanear')
      setProjects([])
    } finally {
      setBusy(false)
    }
  }

  async function loadBrowse(target = path) {
    setBusy(true)
    setError(null)
    setMode('browse')
    try {
      const response = await fetch(`/api/disk/browse?path=${encodeURIComponent(target)}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo listar')
      setPath(payload.path)
      setParent(payload.parent)
      setRoots(payload.roots ?? roots)
      setFolders(payload.folders ?? [])
      setProjects([])
      setSelected([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo listar')
      setFolders([])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void loadScan('D:\\')
    // Primera carga: D:\ es donde están los repos del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(pathValue: string) {
    setSelected((current) =>
      current.includes(pathValue) ? current.filter((item) => item !== pathValue) : [...current, pathValue],
    )
  }

  async function importSelected() {
    if (selected.length === 0) return
    setImporting(true)
    const ids = await importProjects(selected)
    setImporting(false)
    if (ids.length === 0) return
    onClose()
    if (ids.length === 1) router.push(`/projects/${ids[0]}`)
    else router.push('/projects')
  }

  async function importFolder(folder: DiskFolder) {
    if (!folder.isProject) {
      await loadBrowse(folder.path)
      return
    }
    setImporting(true)
    const ids = await importProjects([folder.path])
    setImporting(false)
    if (ids.length === 1) {
      onClose()
      router.push(`/projects/${ids[0]}`)
    }
  }

  return (
    <>
      <div className="disk-toolbar">
        <label className="disk-path">
          Carpeta
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void loadScan(path)
            }}
          />
        </label>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => void loadScan(path)}>
          <RefreshCw size={15} />
          Escanear
        </button>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => void loadBrowse(path)}>
          <FolderOpen size={15} />
          Explorar
        </button>
      </div>
      <div className="disk-roots">
        {roots.map((root) => (
          <button
            key={root}
            type="button"
            className={`filter-button ${path.toLowerCase() === root.toLowerCase() ? 'active' : ''}`}
            onClick={() => void loadScan(root)}
          >
            <HardDrive size={13} />
            {root}
          </button>
        ))}
      </div>

      {error && <div className="disk-error">{error}</div>}
      {busy && <div className="empty-state">Leyendo el disco…</div>}

      {!busy && mode === 'scan' && (
        <div className="disk-list" role="list">
          {projects.length === 0 && (
            <div className="empty-state">
              No encontramos proyectos acá. Probá otra carpeta o explorá a mano.
            </div>
          )}
          {projects.map((item) => (
            <label
              key={item.path}
              className={`disk-row ${item.alreadyImported ? 'is-imported' : ''} ${selected.includes(item.path) ? 'is-selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(item.path)}
                disabled={item.alreadyImported}
                onChange={() => toggle(item.path)}
              />
              <div>
                <strong>{item.draft.name}</strong>
                <span>{item.path}</span>
                <em>
                  {KIND_LABEL[item.draft.kind]}
                  {item.draft.githubRepo ? ` · ${item.draft.githubRepo}` : ''}
                  {item.draft.productionUrl ? ` · ${item.draft.productionUrl}` : ''}
                  {item.needs?.length ? ` · ${item.needs.map((need) => need.label).join(', ')}` : ''}
                  {item.alreadyImported ? ' · ya en el catálogo' : ''}
                </em>
              </div>
              <small>{item.markers.slice(0, 3).join(' · ')}</small>
            </label>
          ))}
        </div>
      )}

      {!busy && mode === 'browse' && (
        <div className="disk-list" role="list">
          {parent && (
            <button type="button" className="disk-row disk-row-button" onClick={() => void loadBrowse(parent)}>
              <ChevronLeft size={16} />
              <div>
                <strong>Subir un nivel</strong>
                <span>{parent}</span>
              </div>
            </button>
          )}
          {folders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              className={`disk-row disk-row-button ${folder.isProject ? 'is-project' : ''}`}
              onClick={() => void importFolder(folder)}
            >
              <FolderOpen size={16} />
              <div>
                <strong>{folder.name}</strong>
                <span>{folder.isProject ? 'Proyecto · clic para importar' : 'Carpeta · clic para entrar'}</span>
              </div>
              <small>{folder.markers.slice(0, 3).join(' · ')}</small>
            </button>
          ))}
          {folders.length === 0 && <div className="empty-state">Esta carpeta no tiene subcarpetas visibles.</div>}
        </div>
      )}

      <div className="modal-actions">
        {mode === 'scan' && (
          <>
            <button
              className="ghost-button"
              type="button"
              disabled={selectable.length === 0}
              onClick={() => setSelected(selectable)}
            >
              Elegir todos
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={importing || selected.length === 0}
              onClick={() => void importSelected()}
            >
              {importing ? 'Importando…' : `Importar ${selected.length || ''}`}
            </button>
          </>
        )}
        <button className="ghost-button" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </>
  )
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { createProject } = useWorkspace()
  const [draft, setDraft] = useState<ProjectDraft>({
    name: '',
    kind: 'web',
    localPath: '',
    branch: 'main',
  })
  const [busy, setBusy] = useState(false)

  function set<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const id = await createProject(draft)
    setBusy(false)
    if (id) {
      onClose()
      router.push(`/projects/${id}`)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label>
          Nombre
          <input required value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Tipo
          <select value={draft.kind} onChange={(e) => set('kind', e.target.value as ProjectKind)}>
            {KINDS.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-span">
          Path local del repo
          <input
            required
            placeholder="D:\RgMotors"
            value={draft.localPath}
            onChange={(e) => set('localPath', e.target.value)}
          />
        </label>
        <label>
          URL de producción
          <input
            placeholder="https://..."
            value={draft.productionUrl ?? ''}
            onChange={(e) => set('productionUrl', e.target.value)}
          />
        </label>
        <label>
          Branch
          <input value={draft.branch ?? 'main'} onChange={(e) => set('branch', e.target.value)} />
        </label>
        <label>
          GitHub owner/repo
          <input
            placeholder="mathi/suertudos"
            value={draft.githubRepo ?? ''}
            onChange={(e) => set('githubRepo', e.target.value)}
          />
        </label>
        <label>
          Proyecto Vercel
          <input
            placeholder="suertudos"
            value={draft.vercelProject ?? ''}
            onChange={(e) => set('vercelProject', e.target.value)}
          />
        </label>
        <label className="form-span">
          Zona Cloudflare
          <input
            placeholder="suertudos.cl"
            value={draft.cloudflareZone ?? ''}
            onChange={(e) => set('cloudflareZone', e.target.value)}
          />
        </label>
        <label className="form-span">
          Resumen
          <input value={draft.summary ?? ''} onChange={(e) => set('summary', e.target.value)} />
        </label>
      </div>
      <div className="modal-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Crear y chequear'}
        </button>
        <button className="ghost-button" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
