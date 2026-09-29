import { NextResponse } from 'next/server'
import { loadCredentials } from './credentials'
import { readSessionCookie, sessionBypassed, sessionSecret, verifySession } from './session'

export type SessionGate =
  | { ok: true }
  | { ok: false; code: 'setup-pin' | 'locked'; error: string }

export function evaluateGate(input: { hasPin: boolean; cookie?: string; secret: string; bypass?: boolean }) {
  if (input.bypass) return { ok: true } as const
  if (!input.hasPin) return { ok: false, code: 'setup-pin' as const, error: 'Definí un PIN para este equipo.' }
  if (!verifySession(input.cookie, input.secret)) {
    return { ok: false, code: 'locked' as const, error: 'Sesión bloqueada.' }
  }
  return { ok: true } as const
}

export function currentGate(request: Request): SessionGate {
  return evaluateGate({
    hasPin: Boolean(loadCredentials().pinHash),
    cookie: readSessionCookie(request),
    secret: sessionSecret(),
    bypass: sessionBypassed(),
  })
}

export function denyIfLocked(request: Request) {
  const gate = currentGate(request)
  if (gate.ok) return null
  return NextResponse.json({ error: gate.error, code: gate.code }, { status: 401 })
}
