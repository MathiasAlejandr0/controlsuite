import { connect } from 'node:tls'
import { resolvePublicHttpUrl } from '../public-url'
import type { HealthCheck } from '../types'

export async function checkTls(url: string): Promise<HealthCheck> {
  const allowed = await resolvePublicHttpUrl(url)
  if (!allowed.ok) {
    return Promise.resolve({
      id: 'chk-tls',
      code: 'tls.expiry',
      label: 'TLS y dominio',
      weight: 10,
      status: 'unknown',
      detail: `${url} · ${allowed.error}`,
      source: 'TLS',
    })
  }
  const host = allowed.url.hostname
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      const expires = cert.valid_to ? new Date(cert.valid_to) : null
      if (!expires || Number.isNaN(expires.getTime())) {
        resolve({
          id: 'chk-tls',
          code: 'tls.expiry',
          label: 'TLS y dominio',
          weight: 10,
          status: 'healthy',
          detail: `${host} · certificado presente`,
          source: 'TLS',
        })
        return
      }
      const days = Math.round((expires.getTime() - Date.now()) / 86_400_000)
      resolve({
        id: 'chk-tls',
        code: 'tls.expiry',
        label: 'TLS y dominio',
        weight: 10,
        status: days < 0 ? 'down' : days < 14 ? 'degraded' : 'healthy',
        detail:
          days < 0
            ? `${host} · certificado vencido`
            : `${host} · TLS vence en ${days} días`,
        source: 'TLS',
      })
    })
    socket.on('error', (error) => {
      resolve({
        id: 'chk-tls',
        code: 'tls.expiry',
        label: 'TLS y dominio',
        weight: 10,
        status: 'down',
        detail: `${host} · ${error.message}`,
        source: 'TLS',
      })
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve({
        id: 'chk-tls',
        code: 'tls.expiry',
        label: 'TLS y dominio',
        weight: 10,
        status: 'down',
        detail: `${host} · timeout TLS`,
        source: 'TLS',
      })
    })
  })
}
