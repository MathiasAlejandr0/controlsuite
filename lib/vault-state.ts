import { isAccountLogin } from './access'
import { linkTarget } from './link-target'
import type { CredentialStatus, Project, StackNeed, VaultState } from './types'

const BROKEN = /falta token|401|403|no es válido|no autorizado|no tiene acceso/i

export function vaultState(
  need: StackNeed,
  credentials: CredentialStatus,
  project?: Project,
): VaultState {
  if (need.provider === 'email') {
    const service = project?.services.find((item) => item.kind === 'email')
    const login = service?.secretRefs.find(isAccountLogin)
    return login && credentials.access[login.id]?.stored ? 'ready' : 'pending'
  }
  const provider = linkTarget(need)
  if (!provider) return 'pending'
  if (!credentials.integrations[provider]) return 'pending'
  const service = project?.services.find((item) => {
    if (item.kind === provider) return true
    if (need.provider === 'database') return item.kind === 'supabase' || item.kind === 'insforge'
    return false
  })
  if (service?.checks.some((check) => BROKEN.test(check.detail))) return 'broken'
  return 'ready'
}
