import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suiteDataDir } from './paths'

const file = () => join(suiteDataDir(), 'watchdog.key')

export function ensureWatchdogKey() {
  const dir = suiteDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = file()
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString('hex'), 'utf8')
    try {
      chmodSync(path, 0o600)
    } catch {
      // Windows puede ignorar el mode
    }
  }
  return readFileSync(path, 'utf8').trim()
}

export function watchdogAuthorized(request: Request) {
  const provided = request.headers.get('x-suite-watchdog')?.trim()
  if (!provided) return false
  const expected = ensureWatchdogKey()
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
