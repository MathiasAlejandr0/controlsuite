import { describe, expect, it, vi } from 'vitest'
import { fetchJson } from './connectors/probe'

describe('fetchJson', () => {
  it('reintenta un 503 y se queda con la respuesta buena', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchJson('https://example.test/x')
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})
