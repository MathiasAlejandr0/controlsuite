import { NextResponse } from 'next/server'
import { CredentialsCorruptError, loadCredentials } from '@/lib/credentials'
import { authorizeRecover, canRestore, isTargetCorrupt, restoreFromBackup } from '@/lib/recover'
import { allowRate } from '@/lib/rate-limit'
import { verifyPin } from '@/lib/pin'
import { recoverSchema } from '@/lib/schemas'
import { readSessionCookie, rotateSessionSecret, sessionSecret, verifySession } from '@/lib/session'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({
    workspace: canRestore('workspace'),
    credentials: canRestore('credentials'),
  })
}

export async function POST(request: Request) {
  if (!allowRate('recover.restore', 8, 60_000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
  }
  const parsed = recoverSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'target requerido' }, { status: 400 })
  }

  const target = parsed.data.target
  const targetCorrupt = isTargetCorrupt(target)
  let credentialsCorrupt = false
  let pinOk = false
  try {
    const creds = loadCredentials()
    pinOk = Boolean(parsed.data.pin && verifyPin(parsed.data.pin, creds.pinHash))
  } catch (error) {
    credentialsCorrupt = error instanceof CredentialsCorruptError
  }

  const sessionOk = verifySession(readSessionCookie(request), sessionSecret())
  const allowed = authorizeRecover({
    target,
    targetCorrupt,
    credentialsCorrupt,
    sessionOk,
    pinOk,
  })
  if (!allowed) {
    return NextResponse.json(
      { error: 'Hace falta el PIN o una sesión abierta para restaurar.', code: 'locked' },
      { status: 401 },
    )
  }

  const result = restoreFromBackup(target)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }
  if (target === 'credentials') rotateSessionSecret()
  return NextResponse.json({ ok: true, target })
}
