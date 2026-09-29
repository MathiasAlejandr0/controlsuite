import { describe, expect, it } from 'vitest'
import { projectImportSchema, projectPatchSchema, workspaceDataSchema } from './schemas'

describe('projectPatchSchema', () => {
  it('acepta un patch válido y rechaza el grafo de servicios', () => {
    expect(projectPatchSchema.safeParse({ localPath: 'D:\\RgMotors' }).success).toBe(true)
    expect(projectPatchSchema.safeParse({ githubRepo: 'mathi/demo' }).success).toBe(true)
    expect(projectPatchSchema.safeParse({ tag: 'casa', sentryProject: 'acme/web' }).success).toBe(true)
    expect(projectPatchSchema.safeParse({ id: 'hack' }).success).toBe(false)
    expect(projectPatchSchema.safeParse({ services: [] }).success).toBe(false)
  })
})

describe('workspaceDataSchema', () => {
  it('rechaza un JSON que no es catálogo', () => {
    expect(workspaceDataSchema.safeParse({}).success).toBe(false)
    expect(
      workspaceDataSchema.safeParse({
        profile: { name: 'M', initials: 'M', label: 'x' },
        projects: [],
        incidents: [],
        activities: [],
      }).success,
    ).toBe(true)
  })
})

describe('projectImportSchema', () => {
  it('pide al menos una carpeta', () => {
    expect(projectImportSchema.safeParse({ paths: ['D:\\RgMotors'] }).success).toBe(true)
    expect(projectImportSchema.safeParse({ paths: [] }).success).toBe(false)
    expect(projectImportSchema.safeParse({}).success).toBe(false)
  })
})
