import type { SecretRef, Service } from './types'

export function loginSecretId(service: Service) {
  return `${service.id}-login`
}

export function ensureAccountLogin(service: Service): SecretRef {
  const existing =
    service.secretRefs.find((secret) => secret.field === 'password' || secret.id.endsWith('-login')) ??
    service.secretRefs.find((secret) => secret.id === loginSecretId(service))
  if (existing) return existing
  const created: SecretRef = {
    id: loginSecretId(service),
    label: 'Usuario y contraseña',
    vaultUri: `local://${loginSecretId(service)}`,
    field: 'password',
    loginUrl: service.dashboardUrl,
  }
  service.secretRefs.unshift(created)
  return created
}

export function isAccountLogin(secret: SecretRef) {
  return secret.field === 'password' || secret.id.endsWith('-login')
}
