import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const dataDir = mkdtempSync(join(tmpdir(), 'suite-api-'))
const projectDir = mkdtempSync(join(tmpdir(), 'suite-proj-'))

function json(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3100' },
    body: JSON.stringify(body),
  })
}

describe('conexión y alertas', () => {
  let createPost: typeof import('@/app/api/projects/route').POST
  let connectPost: typeof import('@/app/api/projects/[id]/connect-service/route').POST
  let incidentPatch: typeof import('@/app/api/incidents/[id]/route').PATCH
  let projectId = ''

  beforeAll(async () => {
    vi.stubEnv('SUITE_DATA_DIR', dataDir)
    vi.resetModules()
    vi.doMock('@/lib/service-link', async () => {
      const actual = await vi.importActual<typeof import('@/lib/service-link')>('@/lib/service-link')
      return {
        ...actual,
        validateServiceToken: vi.fn(async (kind: string, token: string) => {
          if (token.includes('invalid')) return { ok: false, error: 'Token rechazado. Falta permiso de lectura.' }
          return {
            ok: true,
            account: 'acme',
            resources: [{ id: kind === 'github' ? 'acme/web' : 'web', label: 'web' }],
          }
        }),
      }
    })
    vi.doMock('@/lib/refresh', () => ({
      refreshWorkspace: vi.fn(async () => {
        const { loadWorkspace } = await import('@/lib/store')
        return loadWorkspace()
      }),
    }))
    createPost = (await import('@/app/api/projects/route')).POST
    connectPost = (await import('@/app/api/projects/[id]/connect-service/route')).POST
    incidentPatch = (await import('@/app/api/incidents/[id]/route')).PATCH
    const created = await createPost(
      json('http://127.0.0.1:3100/api/projects', 'POST', {
        name: 'Acme',
        kind: 'web',
        localPath: projectDir,
      }),
    )
    const payload = await created.json()
    projectId = payload.createdId
    expect(created.status).toBe(200)
  })

  it('valida, guarda, prueba y desconecta sin devolver el token', async () => {
    const rejected = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', {
        kind: 'github',
        phase: 'validate',
        token: 'invalid-token',
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(rejected.status).toBe(422)
    const rejectedBody = await rejected.json()
    expect(rejectedBody.error).toMatch(/permiso/)
    expect(JSON.stringify(rejectedBody)).not.toContain('invalid-token')

    const validated = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', {
        kind: 'github',
        phase: 'validate',
        token: 'suite-mock-ok-token',
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(validated.status).toBe(200)
    const validatedBody = await validated.json()
    expect(validatedBody.account).toBe('acme')
    expect(JSON.stringify(validatedBody)).not.toContain('suite-mock-ok-token')

    const saved = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', {
        kind: 'github',
        phase: 'save',
        token: 'suite-mock-ok-token',
        resourceId: 'acme/web',
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(saved.status).toBe(200)
    const savedBody = await saved.json()
    expect(JSON.stringify(savedBody)).not.toContain('suite-mock-ok-token')
    const github = savedBody.projects
      .find((item: { id: string }) => item.id === projectId)
      .services.find((item: { kind: string }) => item.kind === 'github')
    expect(github.externalId).toBe('acme/web')

    const tested = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', {
        kind: 'github',
        phase: 'test',
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(tested.status).toBe(200)

    const disconnected = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', {
        kind: 'github',
        phase: 'disconnect',
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(disconnected.status).toBe(200)
    const after = await disconnected.json()
    const unbound = after.projects
      .find((item: { id: string }) => item.id === projectId)
      .services.find((item: { kind: string }) => item.kind === 'github')
    expect(unbound.externalId ?? '').toBe('')
  })

  it('resuelve una alerta y no la duplica', async () => {
    const { loadWorkspace, saveWorkspace } = await import('@/lib/store')
    const data = loadWorkspace()
    data.incidents = [
      {
        id: 'alerta-1',
        projectId,
        title: 'Sitio caído',
        detail: 'HTTP 500',
        environment: 'production',
        status: 'open',
        severity: 'critical',
        detectedAt: new Date().toISOString(),
      },
    ]
    saveWorkspace(data)
    const resolved = await incidentPatch(
      json('http://127.0.0.1:3100/api/incidents/alerta-1', 'PATCH', { status: 'resolved' }),
      { params: Promise.resolve({ id: 'alerta-1' }) },
    )
    expect(resolved.status).toBe(200)
    const body = await resolved.json()
    const incident = body.incidents.find((item: { id: string }) => item.id === 'alerta-1')
    expect(incident.status).toBe('resolved')
    const again = await incidentPatch(
      json('http://127.0.0.1:3100/api/incidents/alerta-1', 'PATCH', { status: 'resolved' }),
      { params: Promise.resolve({ id: 'alerta-1' }) },
    )
    expect(again.status).toBe(200)
    const second = await again.json()
    expect(second.incidents.filter((item: { id: string }) => item.id === 'alerta-1')).toHaveLength(1)
  })

  it('rechaza un pedido de conexión inválido', async () => {
    const response = await connectPost(
      json(`http://127.0.0.1:3100/api/projects/${projectId}/connect-service`, 'POST', { kind: 'github' }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Pedido inválido.' })
  })
})
