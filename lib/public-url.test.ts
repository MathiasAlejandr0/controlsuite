import { describe, expect, it } from 'vitest'
import { assertPublicHttpUrl, isPrivateHostname, isPrivateIp } from './public-url'

describe('isPrivateIp / hostname', () => {
  it('marca loopback, RFC1918 y link-local', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('10.0.0.8')).toBe(true)
    expect(isPrivateIp('192.168.1.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('169.254.1.1')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateHostname('localhost')).toBe(true)
    expect(isPrivateHostname('suertu2s.cl')).toBe(false)
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateIp('::')).toBe(true)
    expect(isPrivateIp('2130706433')).toBe(true)
    expect(assertPublicHttpUrl('http://[::ffff:127.0.0.1]/').ok).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  it('acepta https público y rechaza file, localhost y credenciales', () => {
    expect(assertPublicHttpUrl('https://suertu2s.cl').ok).toBe(true)
    expect(assertPublicHttpUrl('file:///etc/passwd').ok).toBe(false)
    expect(assertPublicHttpUrl('http://127.0.0.1:3100/api/workspace').ok).toBe(false)
    expect(assertPublicHttpUrl('https://user:pass@example.com').ok).toBe(false)
  })
})
