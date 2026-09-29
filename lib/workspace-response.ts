import { credentialStatus } from './credentials'
import { stripSecretUsernames } from './public-workspace'
import type { WorkspaceData } from './types'

export function workspaceResponse(data: WorkspaceData) {
  return {
    ...stripSecretUsernames(data),
    credentials: credentialStatus(),
  }
}
