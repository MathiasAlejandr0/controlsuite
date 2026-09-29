import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import { githubAccessToken } from '@/lib/github-access'
import { denyIfLocked } from '@/lib/guard'
import { withLock } from '@/lib/lock'
import { applyProjectPatch } from '@/lib/project-patch'
import type { ProjectPatch } from '@/lib/schemas'
import { allowRate } from '@/lib/rate-limit'
import { refreshWorkspace } from '@/lib/refresh'
import { serviceConnectSchema } from '@/lib/schemas'
import { patchFieldFor, validateServiceToken, type ConnectKind } from '@/lib/service-link'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

function patchFor(kind: ConnectKind, resourceId: string): ProjectPatch {
  const field = patchFieldFor(kind)
  if (field === 'githubRepo') return { githubRepo: resourceId }
  if (field === 'vercelProject') return { vercelProject: resourceId }
  if (field === 'cloudflareZone') return { cloudflareZone: resourceId }
  if (field === 'supabaseRef') return { supabaseRef: resourceId }
  return { sentryProject: resourceId }
}

function bind(projectId: string, kind: ConnectKind, resourceId: string) {
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === projectId)
  if (!project) return null
  const next = applyProjectPatch(project, patchFor(kind, resourceId))
  const index = data.projects.findIndex((item) => item.id === projectId)
  data.projects[index] = next
  saveWorkspace(data)
  return data
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  if (!allowRate('service.connect', 30, 60_000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
  }
  const { id } = await params
  const parsed = serviceConnectSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const { kind, phase, token, resourceId, teamId } = parsed.data
  const project = loadWorkspace().projects.find((item) => item.id === id)
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })

  if (phase === 'validate') {
    const value = token?.trim()
    if (!value) return NextResponse.json({ error: 'Pegá el token para validarlo.' }, { status: 400 })
    const result = await validateServiceToken(kind, value)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    return NextResponse.json({
      ok: true,
      account: result.account,
      resources: result.resources,
      teamId: 'teamId' in result ? result.teamId : undefined,
    })
  }

  if (phase === 'test') {
    const data = await refreshWorkspace(id)
    return NextResponse.json(workspaceResponse(data))
  }

  if (phase === 'disconnect' || phase === 'forget') {
    await withLock(() => {
      bind(id, kind, '')
      if (phase === 'forget') {
        const creds = loadCredentials()
        delete creds.integrations[kind]
        saveCredentials(creds)
      }
      appendAudit({
        type: 'integration.linked',
        label: phase === 'forget' ? `${kind} · token olvidado` : `${kind} · desconectado de ${project.name}`,
      })
    })
    return NextResponse.json(workspaceResponse(loadWorkspace()))
  }

  const value = token?.trim()
  let resolvedTeam = teamId?.trim()
  if (value) {
    const result = await validateServiceToken(kind, value)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    if (!resolvedTeam && 'teamId' in result && result.teamId) resolvedTeam = result.teamId
  } else if (kind === 'github') {
    const existing = await githubAccessToken()
    if (!existing && !loadCredentials().integrations.github) {
      return NextResponse.json({ error: 'Conectá GitHub con la app o pegá un token.' }, { status: 422 })
    }
  } else if (!loadCredentials().integrations[kind]) {
    return NextResponse.json({ error: 'Falta un token válido.' }, { status: 422 })
  }

  const resource = resourceId?.trim()
  if (!resource) return NextResponse.json({ error: 'Elegí el recurso de este proyecto.' }, { status: 400 })

  const saved = await withLock(() => {
    if (value) {
      const creds = loadCredentials()
      creds.integrations[kind] = value
      if (kind === 'vercel' && resolvedTeam) creds.vercelTeamId = resolvedTeam
      saveCredentials(creds)
    }
    const bound = bind(id, kind, resource)
    if (bound) appendAudit({ type: 'integration.linked', label: `${kind} · ${resource} · ${project.name}` })
    return bound
  })
  if (!saved) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
  const refreshed = await refreshWorkspace(id)
  return NextResponse.json(workspaceResponse(refreshed))
}
