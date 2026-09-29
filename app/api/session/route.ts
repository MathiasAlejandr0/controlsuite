import { NextResponse } from 'next/server'
import { allowRate } from '@/lib/rate-limit'
import { CredentialsCorruptError, loadCredentials, saveCredentials } from '@/lib/credentials'
import { hashPin, isPinStrong, verifyPin } from '@/lib/pin'
import { pinSchema } from '@/lib/schemas'
import {
  clearCookieHeader,
  cookieHeader,
  readSessionCookie,
  rotateSessionSecret,
  sessionSecret,
  signSession,
  verifySession,
} from '@/lib/session'

export const runtime = 'nodejs'

export function GET(request: Request) {
  try {
    const creds = loadCredentials()
    const unlocked = Boolean(creds.pinHash) && verifySession(readSessionCookie(request), sessionSecret())
    return NextResponse.json({
      hasPin: Boolean(creds.pinHash),
      unlocked,
    })
  } catch (error) {
    if (error instanceof CredentialsCorruptError) {
      return NextResponse.json({ hasPin: false, unlocked: false, corrupt: 'credentials' }, { status: 500 })
    }
    throw error
  }
}

export async function POST(request: Request) {
  if (!allowRate('session.unlock', 8, 60_000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
  }
  const parsed = pinSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 400 })
  }
  const creds = loadCredentials()
  if (!creds.pinHash) {
    return NextResponse.json({ error: 'Todavía no hay PIN. Crealo primero.', code: 'setup-pin' }, { status: 401 })
  }
  if (!verifyPin(parsed.data.pin, creds.pinHash)) {
    return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })
  }
  const token = signSession(sessionSecret())
  const response = NextResponse.json({ ok: true, hasPin: true, unlocked: true })
  response.headers.set('Set-Cookie', cookieHeader(token))
  return response
}

export async function PUT(request: Request) {
  if (!allowRate('session.pin', 5, 60_000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
  }
  const parsed = pinSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success || !isPinStrong(parsed.data.pin)) {
    return NextResponse.json({ error: 'El PIN debe tener al menos 6 caracteres.' }, { status: 400 })
  }
  return (async () => {
    const creds = loadCredentials()
    if (creds.pinHash) {
      if (!parsed.data.currentPin || !verifyPin(parsed.data.currentPin, creds.pinHash)) {
        return NextResponse.json({ error: 'PIN actual incorrecto.' }, { status: 401 })
      }
    }
    creds.pinHash = hashPin(parsed.data.pin)
    saveCredentials(creds)
    const token = signSession(rotateSessionSecret())
    const response = NextResponse.json({ ok: true, hasPin: true, unlocked: true })
    response.headers.set('Set-Cookie', cookieHeader(token))
    return response
  })()
}

export function DELETE() {
  const response = NextResponse.json({ ok: true, unlocked: false })
  response.headers.set('Set-Cookie', clearCookieHeader())
  return response
}
