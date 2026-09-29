import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suiteDataDir } from './paths'
import { restrictDataFile } from './protect'

export const SESSION_COOKIE = 'suite_unlock'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const dataDir = suiteDataDir()
const secretFile = join(dataDir, '.session.key')

export function sessionSecret(): string {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(secretFile)) {
    const raw = randomBytes(32).toString('hex')
    writeFileSync(secretFile, raw, 'utf8')
    restrictDataFile(secretFile)
    return raw
  }
  return readFileSync(secretFile, 'utf8').trim()
}

export function signSession(secret: string, now = Date.now(), ttl = SESSION_TTL_MS) {
  const exp = String(now + ttl)
  const nonce = randomBytes(16).toString('hex')
  const payload = `${exp}.${nonce}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()) {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, nonce, sig] = parts
  if (!/^\d+$/.test(exp) || nonce.length < 16 || sig.length < 32) return false
  if (Number(exp) < now) return false
  const expected = createHmac('sha256', secret).update(`${exp}.${nonce}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function cookieHeader(token: string) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readSessionCookie(request: Request) {
  const raw = request.headers.get('cookie') ?? ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  return match?.[1]
}

export function rotateSessionSecret() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const raw = randomBytes(32).toString('hex')
  writeFileSync(secretFile, raw, 'utf8')
  restrictDataFile(secretFile)
  return raw
}

export function sessionBypassed() {
  return process.env.VITEST === 'true' && process.env.NODE_ENV !== 'production'
}
