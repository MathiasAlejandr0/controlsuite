import { describe, expect, it } from 'vitest'
import { repairMojibake, repairText } from './mojibake'

describe('repairMojibake', () => {
  it('repara texto latino roto por PowerShell', () => {
    expect(repairMojibake({ note: 'CÃ³digo y CampaÃ±as' })).toEqual({
      note: 'Código y Campañas',
    })
  })

  it('repara raya y flecha de Windows-1252', () => {
    expect(repairText('â€\u201d')).toBe('—')
    expect(repairText('â\u2020\u2019')).toBe('→')
    expect(repairText('Código sano')).toBe('Código sano')
  })
})
