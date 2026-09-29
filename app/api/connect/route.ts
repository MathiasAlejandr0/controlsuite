import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { credentialStatus, loadCredentials, saveCredentials } from '@/lib/credentials'
import { beginGithubAppRegistration, beginGithubState, githubInstallUrl, suitePublicOrigin } from '@/lib/github-app'
import { denyIfLocked } from '@/lib/guard'
import { harvestProvider, isLinkProvider, startLink } from '@/lib/local-link'
import { withLock } from '@/lib/lock'
import { connectSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = connectSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success || !isLinkProvider(parsed.data.provider)) {
    return NextResponse.json({ error: 'Proveedor inválido.' }, { status: 400 })
  }
  const { action, provider, projectId } = parsed.data

  if (action === 'start' && provider === 'github') {
    const origin = suitePublicOrigin(request)
    const existing = loadCredentials().githubApp
    if (existing?.slug && existing.pem) {
      beginGithubState(projectId)
      return NextResponse.json({
        ok: true,
        flow: 'github-app',
        redirect: githubInstallUrl(existing.slug),
        startUrl: `/api/connect/github/start${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
        detail: 'GitHub pide en qué repos instala Suite Control.',
        credentials: credentialStatus(),
      })
    }
    const started = beginGithubAppRegistration(origin, projectId)
    return NextResponse.json({
      ok: true,
      flow: 'github-app',
      action: started.action,
      manifest: started.manifest,
      startUrl: `/api/connect/github/start${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
      detail: 'GitHub pide crear Suite Control y autorizar repos. No inventamos tokens.',
      credentials: credentialStatus(),
    })
  }

  if (action === 'start') {
    const started = startLink(provider)
    return NextResponse.json({
      ok: true,
      ...started,
      credentials: credentialStatus(),
    })
  }

  return withLock(() => {
    const harvested = harvestProvider(provider)
    if (!harvested.ok) {
      return NextResponse.json(
        { error: harvested.error, credentials: credentialStatus() },
        { status: 409 },
      )
    }
    const current = loadCredentials()
    current.integrations[provider] = harvested.token
    saveCredentials(current)
    appendAudit({ type: 'integration.linked', label: `${provider} · ${harvested.source}` })
    return NextResponse.json({
      ok: true,
      source: harvested.source,
      credentials: credentialStatus(),
    })
  })
}
