import type { WorkspaceData } from './types'

export const defaultProfile = {
  name: 'Mathi',
  initials: 'MA',
  label: 'Workspace personal',
}

export function emptyWorkspace(): WorkspaceData {
  return {
    profile: defaultProfile,
    projects: [],
    incidents: [],
    activities: [],
  }
}
