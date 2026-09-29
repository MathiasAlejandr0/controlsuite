import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from './seed'

describe('emptyWorkspace', () => {
  it('no inventa proyectos de demo', () => {
    const data = emptyWorkspace()
    expect(data.projects).toEqual([])
    expect(data.incidents).toEqual([])
    expect(data.profile.name).toBeTruthy()
  })
})
