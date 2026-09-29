import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { resolveStoredLogin } from '@/lib/credentials'
import { denyIfLocked } from '@/lib/guard'
import { allowRate } from '@/lib/rate-limit'
import { revealSchema } from '@/lib/schemas'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  if (!allowRate('secrets.reveal', 12, 60_000)) {
    return NextResponse.json({ error: 'Demasiados revelados. Esperá un minuto.' }, { status: 429 })
  }
  const parsed = revealSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const { projectId, serviceId, secretId } = parsed.data
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === projectId)
  const service = project?.services.find((item) => item.id === serviceId)
  const secret = service?.secretRefs.find((item) => item.id === secretId)
  if (!project || !service || !secret) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const login = resolveStoredLogin(secret.id)
  appendAudit({ type: 'secret.revealed', label: `${project.name} · ${service.name} · ${secret.label}` })

  return NextResponse.json({
    label: secret.label,
    loginUrl: secret.loginUrl,
    mfa: secret.mfa,
    note: secret.note,
    vaultUri: secret.vaultUri,
    username: login.username,
    value: login.password,
    aliased: login.aliased,
    source: login.password || login.username ? 'secret' : null,
  })
}
