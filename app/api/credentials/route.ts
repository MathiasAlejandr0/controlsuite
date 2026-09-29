import { NextResponse } from 'next/server'
import { credentialStatus, loadCredentials, saveCredentials } from '@/lib/credentials'
import { denyIfLocked } from '@/lib/guard'
import { withLock } from '@/lib/lock'
import { credentialsSchema } from '@/lib/schemas'
import { loadWorkspace } from '@/lib/store'
import type { IntegrationId } from '@/lib/types'

export const runtime = 'nodejs'

const INTEGRATIONS: IntegrationId[] = ['github', 'vercel', 'cloudflare', 'sentry', 'supabase', 'insforge']

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json(credentialStatus())
}

export async function PUT(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const body = parsed.data
  return withLock(() => {
    const current = loadCredentials()
    if (body.integrations) {
      for (const [key, value] of Object.entries(body.integrations)) {
        if (!INTEGRATIONS.includes(key as IntegrationId)) continue
        if (value === '') delete current.integrations[key as IntegrationId]
        else current.integrations[key as IntegrationId] = value.trim()
      }
    }
    if (body.vercelTeamId !== undefined) {
      current.vercelTeamId = body.vercelTeamId.trim() || undefined
    }
    if (body.openaiKey !== undefined) {
      current.openaiKey = body.openaiKey.trim() || undefined
    }
    if (body.secrets) {
      const allowed = new Set([
        ...Object.keys(current.secrets),
        ...loadWorkspace().projects.flatMap((project) =>
          project.services.flatMap((service) => service.secretRefs.map((secret) => secret.id)),
        ),
      ])
      for (const [id, value] of Object.entries(body.secrets)) {
        if (!allowed.has(id)) continue
        if (value === '') delete current.secrets[id]
        else current.secrets[id] = value
      }
    }
    saveCredentials(current)
    return NextResponse.json(credentialStatus())
  })
}
