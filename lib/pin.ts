import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const

export function normalizePin(value: string) {
  return value.trim()
}

export function isPinStrong(value: string) {
  return normalizePin(value).length >= 6
}

export function hashPin(pin: string) {
  const clean = normalizePin(pin)
  if (!isPinStrong(clean)) throw new Error('El PIN debe tener al menos 6 caracteres.')
  const salt = randomBytes(16)
  const hash = scryptSync(clean, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPin(pin: string, stored?: string) {
  if (!stored) return false
  const [alg, salt, digest] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !digest) return false
  try {
    const next = scryptSync(normalizePin(pin), Buffer.from(salt, 'base64'), SCRYPT.keylen, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
    })
    const expected = Buffer.from(digest, 'base64')
    if (next.length !== expected.length) return false
    return timingSafeEqual(next, expected)
  } catch {
    return false
  }
}
