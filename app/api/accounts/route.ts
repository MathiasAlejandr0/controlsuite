import { NextResponse } from 'next/server'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import { denyIfLocked } from '@/lib/guard'
import { githubAccessToken } from '@/lib/github-access'
import { withLock } from '@/lib/lock'
import { allowRate } from '@/lib/rate-limit'
import { serviceConnectSchema } from '@/lib/schemas'
import { validateServiceToken, type ConnectKind } from '@/lib/service-link'
import { listCloudflareZones } from '@/lib/connectors/cloudflare'
import { fetchInstallationRepos, listGithubRepos } from '@/lib/connectors/github'
import { listSentryProjects } from '@/lib/connectors/sentry'
import { listSupabaseProjects } from '@/lib/connectors/supabase'
import { listVercelProjects } from '@/lib/connectors/vercel'
import { appendAudit } from '@/lib/audit'

export const runtime = 'nodejs'

async function listFor(kind: ConnectKind, token: string, teamId?: string) {
  if (kind === 'github') {
    const repos = await listGithubRepos(token)
    if (repos.length > 0) return repos
    const installed = await fetchInstallationRepos(token).catch(() => [])
    return installed.map((repo) => ({ id: repo.fullName, label: repo.fullName }))
  }
  if (kind === 'vercel') return listVercelProjects(token, teamId)
  if (kind === 'cloudflare') return listCloudflareZones(token)
  if (kind === 'supabase') return listSupabaseProjects(token)
  return listSentryProjects(token)
}

export async function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const kind = new URL(request.url).searchParams.get('kind')
  const parsed = serviceConnectSchema.pick({ kind: true }).safeParse({ kind, phase: 'validate' })
  if (!parsed.success) return NextResponse.json({ error: 'Servicio inválido.' }, { status: 400 })
  const creds = loadCredentials()
  const token = parsed.data.kind === 'github' ? await githubAccessToken() : creds.integrations[parsed.data.kind]
  if (!token) return NextResponse.json({ connected: false, resources: [] })
  try {
    const resources = await listFor(parsed.data.kind, token, creds.vercelTeamId)
    return NextResponse.json({ connected: true, resources })
  } catch (error) {
    return NextResponse.json({
      connected: true,
      resources: [],
      error: error instanceof Error ? error.message : 'No se pudieron listar los recursos.',
    })
  }
}

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  if (!allowRate('account.connect', 20, 60_000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
  }
  const parsed = serviceConnectSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const { kind, phase, token } = parsed.data

  if (phase === 'forget') {
    await withLock(() => {
      const creds = loadCredentials()
      delete creds.integrations[kind]
      if (kind === 'github') delete creds.githubApp
      saveCredentials(creds)
      appendAudit({ type: 'integration.linked', label: `${kind} · cuenta olvidada` })
    })
    return NextResponse.json({ ok: true, connected: false })
  }

  const value = token?.trim()
  if (!value) return NextResponse.json({ error: 'Pegá el token.' }, { status: 400 })
  const result = await validateServiceToken(kind, value)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  if (phase === 'validate') {
    return NextResponse.json({
      ok: true,
      account: result.account,
      resources: result.resources,
      teamId: result.teamId,
    })
  }
  await withLock(() => {
    const creds = loadCredentials()
    creds.integrations[kind] = value
    if (kind === 'vercel' && result.teamId) creds.vercelTeamId = result.teamId
    saveCredentials(creds)
    appendAudit({ type: 'integration.linked', label: `${kind} · cuenta de este equipo` })
  })
  return NextResponse.json({ ok: true, connected: true, account: result.account })
}
