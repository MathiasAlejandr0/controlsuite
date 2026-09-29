import { describe, expect, it } from 'vitest'
import { POST as cursorPost } from '@/app/api/cursor/route'
import { PUT as credentialsPut } from '@/app/api/credentials/route'
import { POST as importPost } from '@/app/api/projects/import/route'
import { POST as createPost } from '@/app/api/projects/route'
import { PATCH as patchProject } from '@/app/api/projects/[id]/route'
import { POST as recoverPost } from '@/app/api/recover/route'
import { POST as sessionPost } from '@/app/api/session/route'
import { POST as revealPost } from '@/app/api/secrets/reveal/route'
import { resolveCursorTarget } from '@/lib/cursor'
import { connectSchema, credentialsSchema } from '@/lib/schemas'

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('API handlers', () => {
  it('cursor exige projectId y no abre un id inexistente', async () => {
    const missing = await cursorPost(jsonRequest('http://127.0.0.1:3100/api/cursor', {}))
    expect(missing.status).toBe(400)
    const unknown = await cursorPost(
      jsonRequest('http://127.0.0.1:3100/api/cursor', { projectId: 'no-existe-xyz' }),
    )
    expect(unknown.status).toBe(404)
  })

  it('reveal rechaza un pedido incompleto', async () => {
    const response = await revealPost(jsonRequest('http://127.0.0.1:3100/api/secrets/reveal', { projectId: 'x' }))
    expect(response.status).toBe(400)
  })

  it('credentials PUT rechaza un cuerpo inválido', async () => {
    const response = await credentialsPut(
      new Request('http://127.0.0.1:3100/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets: 12 }),
      }),
    )
    expect(response.status).toBe(400)
    expect(credentialsSchema.safeParse({ openaiKey: 'sk-test' }).success).toBe(true)
    expect(connectSchema.safeParse({ action: 'import', provider: 'supabase' }).success).toBe(true)
    expect(connectSchema.safeParse({ action: 'start', provider: 'dropbox' }).success).toBe(false)
  })

  it('import exige carpetas', async () => {
    const response = await importPost(jsonRequest('http://127.0.0.1:3100/api/projects/import', { paths: [] }))
    expect(response.status).toBe(400)
  })

  it('create bloquea paths de sistema', async () => {
    const response = await createPost(
      jsonRequest('http://127.0.0.1:3100/api/projects', {
        name: 'Hack',
        kind: 'web',
        localPath: 'C:\\Windows\\System32',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('PATCH rechaza reemplazar services', async () => {
    const response = await patchProject(
      new Request('http://127.0.0.1:3100/api/projects/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [] }),
      }),
      { params: Promise.resolve({ id: 'x' }) },
    )
    expect(response.status).toBe(400)
  })

  it('session y recover rechazan cuerpos inválidos', async () => {
    expect((await sessionPost(jsonRequest('http://127.0.0.1:3100/api/session', { pin: '12' }))).status).toBe(400)
    expect((await recoverPost(jsonRequest('http://127.0.0.1:3100/api/recover', {}))).status).toBe(400)
  })

  it('resolveCursorTarget no abre github remoto ni paths bloqueados', () => {
    expect(resolveCursorTarget('github://owner/repo').ok).toBe(false)
    expect(resolveCursorTarget('C:\\Windows').ok).toBe(false)
    expect(resolveCursorTarget('').ok).toBe(false)
  })
})
