'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ActivityItem,
  AuditEvent,
  CredentialStatus,
  Incident,
  IntegrationId,
  Project,
  ProjectDraft,
  SecretRef,
  WorkspaceProfile,
} from './types'
import type { ProjectPatch } from './schemas'
import { defaultProfile } from './seed'

type Toast = { id: string; message: string; tone?: 'ok' | 'warn' }

type RevealState = {
  secret: SecretRef
  projectName: string
  serviceName: string
  projectId: string
  serviceId: string
  value: string | null
  username: string | null
  aliased: boolean
  source: 'secret' | null
}

type WorkspacePayload = {
  profile: WorkspaceProfile
  projects: Project[]
  incidents: Incident[]
  activities: ActivityItem[]
  lastSyncedAt?: string
  credentials: CredentialStatus
}

type WorkspaceContextValue = {
  ready: boolean
  refreshing: boolean
  query: string
  setQuery: (value: string) => void
  profile: WorkspaceProfile
  projects: Project[]
  incidents: Incident[]
  activities: ActivityItem[]
  lastSyncedAt?: string
  credentials: CredentialStatus
  toasts: Toast[]
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  reveal: RevealState | null
  openReveal: (input: {
    secret: SecretRef
    projectName: string
    serviceName: string
    projectId: string
    serviceId: string
  }) => Promise<void>
  closeReveal: () => void
  audit: AuditEvent[]
  reload: () => Promise<void>
  refresh: (projectId?: string) => Promise<void>
  createProject: (draft: ProjectDraft) => Promise<string | undefined>
  importProjects: (paths: string[]) => Promise<string[]>
  importGithubRepos: (repos: string[]) => Promise<string[]>
  updateProject: (id: string, patch: ProjectPatch) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  deleteProjects: (ids: string[]) => Promise<void>
  saveAccess: (input: {
    projectId: string
    serviceId: string
    username?: string
    password?: string
    loginUrl?: string
    mfa?: string
    note?: string
    aliasOfSecretId?: string
  }) => Promise<void>
  saveIntegrations: (input: {
    integrations?: Partial<Record<IntegrationId, string>>
    vercelTeamId?: string
    openaiKey?: string
    secrets?: Record<string, string>
  }) => Promise<void>
  openCursor: (projectId: string, incidentId?: string) => Promise<{
    ok: boolean
    prompt?: string
    injected?: boolean
  }>
  resolveIncident: (id: string, status?: 'open' | 'fixing' | 'resolved') => Promise<void>
  gate: 'loading' | 'setup' | 'locked' | 'open' | 'recover'
  recoverTarget: 'workspace' | 'credentials' | null
  unlock: (pin: string) => Promise<boolean>
  setupPin: (pin: string, currentPin?: string) => Promise<boolean>
  lockSession: () => Promise<void>
  restoreBackup: (target: 'workspace' | 'credentials', pin?: string) => Promise<boolean>
  saveProfile: (patch: Partial<WorkspaceProfile>) => Promise<void>
  importCatalog: (data: unknown) => Promise<boolean>
  loadAudit: () => Promise<void>
}

const emptyCredentials: CredentialStatus = {
  integrations: {
    github: false,
    vercel: false,
    cloudflare: false,
    sentry: false,
    supabase: false,
    insforge: false,
  },
  secretCount: 0,
  openai: false,
  hasPin: false,
  access: {},
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState<WorkspaceProfile>(defaultProfile)
  const [projects, setProjects] = useState<Project[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const [credentials, setCredentials] = useState<CredentialStatus>(emptyCredentials)
  const [gate, setGate] = useState<WorkspaceContextValue['gate']>('loading')
  const [recoverTarget, setRecoverTarget] = useState<'workspace' | 'credentials' | null>(null)

  const pushToast = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = uid()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const applyPayload = useCallback((payload: WorkspacePayload) => {
    setProfile(payload.profile)
    setProjects(payload.projects)
    setIncidents(payload.incidents)
    setActivities(payload.activities)
    setLastSyncedAt(payload.lastSyncedAt)
    setCredentials(payload.credentials)
  }, [])

  const reload = useCallback(async () => {
    const response = await fetch('/api/workspace', { cache: 'no-store' })
    if (response.status === 401) {
      const payload = await response.json().catch(() => ({}))
      setGate(payload.code === 'setup-pin' ? 'setup' : 'locked')
      throw new Error(payload.error ?? 'Sesión bloqueada')
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      if (payload.code === 'corrupt-workspace' || payload.code === 'corrupt-credentials') {
        setRecoverTarget(payload.code === 'corrupt-credentials' ? 'credentials' : 'workspace')
        setGate('recover')
      }
      throw new Error(payload.error ?? 'No se pudo leer el workspace')
    }
    applyPayload(await response.json())
    setGate('open')
  }, [applyPayload])

  const refresh = useCallback(
    async (projectId?: string) => {
      setRefreshing(true)
      try {
        const response = await fetch('/api/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        if (!response.ok) throw new Error('Refresh falló')
        applyPayload(await response.json())
        pushToast(projectId ? 'Salud actualizada' : 'Workspace sincronizado')
      } catch (error) {
        pushToast(error instanceof Error ? error.message : 'Error al sincronizar', 'warn')
      } finally {
        setRefreshing(false)
      }
    },
    [applyPayload, pushToast],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await fetch('/api/session', { cache: 'no-store' })
        const payload = await session.json()
        if (cancelled) return
        if (payload.corrupt === 'credentials') {
          setRecoverTarget('credentials')
          setGate('recover')
          setReady(true)
          return
        }
        if (!payload.hasPin) {
          setGate('setup')
          setReady(true)
          return
        }
        if (!payload.unlocked) {
          setGate('locked')
          setReady(true)
          return
        }
        await reload()
      } catch {
        if (!cancelled) pushToast('No se pudo cargar el workspace', 'warn')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pushToast, reload])

  useEffect(() => {
    if (gate !== 'open' || lastSyncedAt) return
    void refresh()
  }, [gate, lastSyncedAt, refresh])

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (gate !== 'open') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }, 3 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [gate])

  const openReveal = useCallback(
    async (input: {
      secret: SecretRef
      projectName: string
      serviceName: string
      projectId: string
      serviceId: string
    }) => {
      const response = await fetch('/api/secrets/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: input.projectId,
          serviceId: input.serviceId,
          secretId: input.secret.id,
        }),
      })
      const payload = (await response.json()) as {
        value: string | null
        username: string | null
        aliased?: boolean
        source: 'secret' | null
      }
      setReveal({
        ...input,
        value: payload.value,
        username: payload.username,
        aliased: Boolean(payload.aliased),
        source: payload.source,
      })
      setAudit((current) => [
        {
          id: uid(),
          type: 'secret.revealed',
          label: `${input.serviceName} · ${input.secret.label}`,
          at: new Date().toISOString(),
        },
        ...current,
      ])
    },
    [],
  )

  const closeReveal = useCallback(() => setReveal(null), [])

  const createProject = useCallback(
    async (draft: ProjectDraft) => {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudo crear', 'warn')
        return undefined
      }
      applyPayload(payload)
      pushToast('Proyecto creado y chequeado')
      return payload.createdId as string
    },
    [applyPayload, pushToast],
  )

  const importProjects = useCallback(
    async (paths: string[]) => {
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudieron importar', 'warn')
        return []
      }
      applyPayload(payload)
      const createdIds = (payload.createdIds as string[]) ?? []
      const skipped = (payload.skipped as Array<{ reason: string }> | undefined)?.length ?? 0
      pushToast(
        skipped
          ? `${createdIds.length} importados, ${skipped} omitidos`
          : `${createdIds.length} proyecto${createdIds.length === 1 ? '' : 's'} al catálogo`,
      )
      return createdIds
    },
    [applyPayload, pushToast],
  )

  const importGithubRepos = useCallback(
    async (repos: string[]) => {
      const response = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudieron importar los repos', 'warn')
        return []
      }
      applyPayload(payload)
      const createdIds = (payload.createdIds as string[]) ?? []
      pushToast(`${createdIds.length} repo${createdIds.length === 1 ? '' : 's'} de GitHub al catálogo`)
      return createdIds
    },
    [applyPayload, pushToast],
  )

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch) => {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) {
        pushToast('No se pudo guardar el proyecto', 'warn')
        return
      }
      applyPayload(await response.json())
      pushToast('Conexiones guardadas')
    },
    [applyPayload, pushToast],
  )

  const deleteProjects = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      const response = await fetch('/api/projects/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) {
        pushToast('No se pudo borrar', 'warn')
        return
      }
      applyPayload(await response.json())
      pushToast(
        ids.length === 1 ? 'Proyecto eliminado del catálogo' : `${ids.length} proyectos eliminados`,
      )
    },
    [applyPayload, pushToast],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      await deleteProjects([id])
    },
    [deleteProjects],
  )

  const saveAccess = useCallback(
    async (input: {
      projectId: string
      serviceId: string
      username?: string
      password?: string
      loginUrl?: string
      mfa?: string
      note?: string
      aliasOfSecretId?: string
    }) => {
      const response = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudo guardar el acceso', 'warn')
        return
      }
      applyPayload(payload)
      pushToast('Acceso guardado en este equipo')
    },
    [applyPayload, pushToast],
  )

  const saveIntegrations = useCallback(
    async (input: {
      integrations?: Partial<Record<IntegrationId, string>>
      vercelTeamId?: string
      openaiKey?: string
      secrets?: Record<string, string>
    }) => {
      const response = await fetch('/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        pushToast('No se pudieron guardar las credenciales', 'warn')
        return
      }
      setCredentials(await response.json())
      pushToast('Credenciales guardadas en este equipo')
    },
    [pushToast],
  )

  const resolveIncident = useCallback(
    async (id: string, status: 'open' | 'fixing' | 'resolved' = 'resolved') => {
      const response = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        pushToast('No se pudo actualizar el incidente', 'warn')
        return
      }
      applyPayload(await response.json())
      pushToast(status === 'resolved' ? 'Incidente cerrado' : 'Incidente actualizado')
    },
    [applyPayload, pushToast],
  )

  const openCursor = useCallback(
    async (projectId: string, incidentId?: string) => {
      const response = await fetch('/api/cursor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, incidentId }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudo abrir Cursor', 'warn')
        return { ok: false as const }
      }
      pushToast(
        payload.injected
          ? 'Cursor abierto · el prompt está en el chat'
          : 'Cursor abierto · el prompt quedó en el portapapeles',
      )
      setAudit((current) => [
        {
          id: uid(),
          type: 'cursor.opened',
          label: projectId,
          at: new Date().toISOString(),
        },
        ...current,
      ])
      return {
        ok: true as const,
        prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
        injected: Boolean(payload.injected),
      }
    },
    [pushToast],
  )

  const unlock = useCallback(
    async (pin: string) => {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'PIN incorrecto', 'warn')
        return false
      }
      try {
        await reload()
        return true
      } catch {
        return false
      }
    },
    [pushToast, reload],
  )

  const setupPin = useCallback(
    async (pin: string, currentPin?: string) => {
      const response = await fetch('/api/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, currentPin }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudo guardar el PIN', 'warn')
        return false
      }
      setCredentials((current) => ({ ...current, hasPin: true }))
      try {
        await reload()
        pushToast('PIN guardado en este equipo')
        return true
      } catch {
        return false
      }
    },
    [pushToast, reload],
  )

  const lockSession = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' })
    setGate('locked')
    pushToast('Suite bloqueada')
  }, [pushToast])

  const restoreBackup = useCallback(
    async (target: 'workspace' | 'credentials', pin?: string) => {
      const response = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, pin }),
      })
      const payload = await response.json()
      if (!response.ok) {
        pushToast(payload.error ?? 'No se pudo restaurar', 'warn')
        return false
      }
      setRecoverTarget(null)
      try {
        await reload()
        pushToast('Backup restaurado')
        return true
      } catch {
        pushToast('Restaurado. Desbloqueá de nuevo si hace falta.', 'warn')
        return true
      }
    },
    [pushToast, reload],
  )

  const saveProfile = useCallback(
    async (patch: Partial<WorkspaceProfile>) => {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) {
        pushToast('No se pudo guardar el perfil', 'warn')
        return
      }
      applyPayload(await response.json())
      pushToast('Perfil actualizado')
    },
    [applyPayload, pushToast],
  )

  const importCatalog = useCallback(
    async (data: unknown) => {
      const response = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        pushToast('El archivo no es un catálogo válido', 'warn')
        return false
      }
      applyPayload(await response.json())
      pushToast('Catálogo importado')
      return true
    },
    [applyPayload, pushToast],
  )

  const loadAudit = useCallback(async () => {
    const response = await fetch('/api/audit', { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json()
    if (Array.isArray(payload.events)) setAudit(payload.events)
  }, [])

  const value = useMemo(
    () => ({
      ready,
      refreshing,
      query,
      setQuery,
      profile,
      projects,
      incidents,
      activities,
      lastSyncedAt,
      credentials,
      toasts,
      pushToast,
      dismissToast,
      reveal,
      openReveal,
      closeReveal,
      audit,
      reload,
      refresh,
      createProject,
      importProjects,
      importGithubRepos,
      updateProject,
      deleteProject,
      deleteProjects,
      saveAccess,
      saveIntegrations,
      openCursor,
      resolveIncident,
      gate,
      recoverTarget,
      unlock,
      setupPin,
      lockSession,
      restoreBackup,
      saveProfile,
      importCatalog,
      loadAudit,
    }),
    [
      activities,
      audit,
      closeReveal,
      createProject,
      importProjects,
      importGithubRepos,
      credentials,
      deleteProject,
      deleteProjects,
      saveAccess,
      updateProject,
      dismissToast,
      incidents,
      lastSyncedAt,
      openCursor,
      resolveIncident,
      openReveal,
      profile,
      projects,
      pushToast,
      query,
      ready,
      refresh,
      refreshing,
      reload,
      reveal,
      saveIntegrations,
      toasts,
      gate,
      recoverTarget,
      unlock,
      setupPin,
      lockSession,
      restoreBackup,
      saveProfile,
      importCatalog,
      loadAudit,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider')
  }
  return context
}
