import { describe, expect, it } from 'vitest'
import { buildPromptDeeplink, CURSOR_DEEPLINK_MAX } from './cursor-deeplink'

describe('buildPromptDeeplink', () => {
  it('arma el URI oficial de Cursor con el prompt', () => {
    const href = buildPromptDeeplink('Arreglá el 502 de producción')
    expect(href).toContain('cursor://anysphere.cursor-deeplink/prompt?text=')
    expect(href).toContain(encodeURIComponent('Arreglá el 502 de producción'))
  })

  it('rechaza prompts que no entran en 8000 caracteres de URL', () => {
    const huge = 'x'.repeat(CURSOR_DEEPLINK_MAX)
    expect(buildPromptDeeplink(huge)).toBeNull()
  })
})
