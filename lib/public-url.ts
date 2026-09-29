import { lookup } from 'node:dns/promises'

const PRIVATE_V4_PREFIXES = ['10.', '127.', '0.', '169.254.', '192.168.']

function ipv4Octets(host: string): number[] | undefined {
  const parts = host.split('.')
  if (parts.length !== 4) return undefined
  const octets = parts.map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined
  return octets
}

function mappedIpv4(host: string) {
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
  if (dotted) return dotted
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return undefined
  const hi = Number.parseInt(hex[1], 16)
  const lo = Number.parseInt(hex[2], 16)
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

function dwordToIpv4(host: string) {
  if (!/^\d+$/.test(host)) return undefined
  const value = Number(host)
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) return undefined
  return [24, 16, 8, 0].map((shift) => String((value >>> shift) & 255)).join('.')
}

export function isPrivateIp(host: string) {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase()
  const mapped = mappedIpv4(bare)
  if (mapped) return isPrivateIp(mapped)
  const dword = dwordToIpv4(bare)
  if (dword) return isPrivateIp(dword)
  const ipv4 = ipv4Octets(bare)
  if (ipv4) {
    const [a, b] = ipv4
    if (PRIVATE_V4_PREFIXES.some((prefix) => bare === prefix.slice(0, -1) || bare.startsWith(prefix))) {
      return true
    }
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }
  if (bare === '::1' || bare === '::' || bare === '0:0:0:0:0:0:0:1' || bare === '0:0:0:0:0:0:0:0') return true
  if (bare.startsWith('fc') || bare.startsWith('fd') || bare.startsWith('fe80:')) return true
  return false
}

export function isPrivateHostname(host: string) {
  const hostname = host.trim().toLowerCase().replace(/\.+$/, '')
  if (!hostname) return true
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true
  if (hostname === 'metadata.google.internal') return true
  return isPrivateIp(hostname)
}

export function assertPublicHttpUrl(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return { ok: false, error: 'URL inválida.' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Solo se chequean URLs http(s) públicas.' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'La URL no puede llevar usuario ni clave.' }
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, error: 'No se chequean hosts locales ni de red privada.' }
  }
  return { ok: true, url }
}

export async function resolvePublicHttpUrl(
  value: string,
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  const allowed = assertPublicHttpUrl(value)
  if (!allowed.ok) return allowed
  try {
    const { address } = await lookup(allowed.url.hostname, { all: false })
    if (isPrivateIp(address) || isPrivateHostname(address)) {
      return { ok: false, error: 'El DNS resolvió a una IP privada.' }
    }
  } catch {
    return { ok: false, error: 'No se resolvió el DNS del host.' }
  }
  return allowed
}
