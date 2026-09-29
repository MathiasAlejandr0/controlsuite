import { describe, expect, it } from 'vitest'
import { repairMojibake } from './mojibake'

describe('repairMojibake', () => {
  it('repara texto latino roto por PowerShell', () => {
    expect(repairMojibake({ note: 'CÃ³digo y CampaÃ±as' })).toEqual({
      note: 'Código y Campañas',
    })
  })
})
