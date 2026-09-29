import { NextResponse } from 'next/server'
import { ensureAccountLogin } from '@/lib/access'
import { denyIfLocked } from '@/lib/guard'
import { appendAudit } from '@/lib/audit'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import { withLock } from '@/lib/lock'
import { accessSaveSchema } from '@/lib/schemas'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { safeHttpUrl } from '@/lib/safe-url'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = accessSaveSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const body = parsed.data

  return withLock(() => {
    const data = loadWorkspace()
    const project = data.projects.find((item) => item.id === body.projectId)
    const service = project?.services.find((item) => item.id === body.serviceId)
    if (!project || !service) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const secret = ensureAccountLogin(service)
    if (body.loginUrl !== undefined) {
      const cleaned = body.loginUrl.trim() ? safeHttpUrl(body.loginUrl) : undefined
      if (body.loginUrl.trim() && !cleaned) {
        return NextResponse.json({ error: 'La URL de login tiene que ser http(s).' }, { status: 400 })
      }
      secret.loginUrl = cleaned || safeHttpUrl(service.dashboardUrl)
    }
    if (body.mfa !== undefined) secret.mfa = body.mfa.trim() || undefined
    if (body.note !== undefined) secret.note = body.note.trim() || undefined
    delete secret.username

    const knownIds = new Set(
      data.projects.flatMap((item) =>
        item.services.flatMap((entry) => entry.secretRefs.map((ref) => ref.id)),
      ),
    )
    knownIds.add(secret.id)

    const creds = loadCredentials()
    creds.logins = creds.logins ?? {}
    const current = creds.logins[secret.id] ?? {}
    if (body.aliasOfSecretId) {
      if (body.aliasOfSecretId === secret.id || !knownIds.has(body.aliasOfSecretId)) {
        return NextResponse.json({ error: 'El alias de acceso no es válido.' }, { status: 400 })
      }
      creds.logins[secret.id] = { ...current, aliasOf: body.aliasOfSecretId }
    } else {
      const next = { ...current }
      delete next.aliasOf
      if (body.username !== undefined) {
        if (body.username.trim()) next.username = body.username.trim()
        else delete next.username
      }
      creds.logins[secret.id] = next
      if (body.password !== undefined) {
        if (body.password) creds.secrets[secret.id] = body.password
        else delete creds.secrets[secret.id]
      }
    }
    if (!creds.logins[secret.id].username && !creds.logins[secret.id].aliasOf) {
      delete creds.logins[secret.id]
    }

    saveCredentials(creds)
    saveWorkspace(data)
    appendAudit({ type: 'access.saved', label: `${project.name} · ${service.name}` })
    return NextResponse.json(workspaceResponse(data))
  })
}
