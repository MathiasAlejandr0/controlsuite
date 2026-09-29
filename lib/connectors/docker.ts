import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { runTool } from '../exec'
import type { HealthCheck } from '../types'

export type DockerContainer = {
  name: string
  image: string
  status: string
  running: boolean
}

export type DockerSnapshot = {
  installed: boolean
  running: boolean
  version?: string
  containers: DockerContainer[]
  composeProjects: Array<{ name: string; status: string }>
}

function parseJsonLines<T>(raw: string): T[] {
  const text = raw.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as T | T[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => {
        try {
          return JSON.parse(line) as T
        } catch {
          return undefined
        }
      })
      .filter((item): item is T => Boolean(item))
  }
}

export function parseDockerContainers(raw: string): DockerContainer[] {
  return parseJsonLines<{ Names?: string; Image?: string; Status?: string; State?: string }>(raw).map((row) => {
    const state = (row.State ?? row.Status ?? '').toLowerCase()
    return {
      name: row.Names ?? '',
      image: row.Image ?? '',
      status: row.Status ?? row.State ?? '',
      running: state.includes('running') || state === 'up' || state.startsWith('up '),
    }
  })
}

export function composeFileFor(localPath: string) {
  const names = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
  return names.map((name) => join(localPath, name)).find((file) => existsSync(file))
}

export async function probeDocker(): Promise<DockerSnapshot> {
  const version = await runTool('docker', ['version', '--format', '{{.Server.Version}}'])
  if (version.missing) {
    return { installed: false, running: false, containers: [], composeProjects: [] }
  }
  if (!version.ok || !version.stdout) {
    return { installed: true, running: false, containers: [], composeProjects: [] }
  }

  const [ps, compose] = await Promise.all([
    runTool('docker', ['ps', '--format', '{{json .}}']),
    runTool('docker', ['compose', 'ls', '--format', 'json']),
  ])

  return {
    installed: true,
    running: true,
    version: version.stdout,
    containers: parseDockerContainers(ps.stdout),
    composeProjects: parseJsonLines<{ Name?: string; Status?: string }>(compose.stdout).map((row) => ({
      name: row.Name ?? '',
      status: row.Status ?? '',
    })),
  }
}

export async function checkDocker(localPath: string, projectName: string): Promise<HealthCheck[]> {
  const snapshot = await probeDocker()
  if (!snapshot.installed) {
    return [
      {
        id: 'chk-docker',
        label: 'Docker',
        weight: 12,
        status: 'unknown',
        detail: 'Docker no está instalado o no está en el PATH.',
        source: 'Docker',
      },
    ]
  }
  if (!snapshot.running) {
    return [
      {
        id: 'chk-docker',
        label: 'Docker',
        weight: 12,
        status: 'down',
        detail: 'Docker Desktop / el daemon no está corriendo.',
        source: 'Docker',
      },
    ]
  }

  const checks: HealthCheck[] = [
    {
      id: 'chk-docker',
      label: 'Docker daemon',
      weight: 8,
      status: 'healthy',
      detail: `Docker ${snapshot.version} · ${snapshot.containers.length} contenedores up`,
      source: 'Docker',
    },
  ]

  const compose = localPath && !localPath.startsWith('github://') ? composeFileFor(localPath) : undefined
  const needle = basename(localPath || projectName).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const related = snapshot.containers.filter((container) => {
    const name = container.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
    return needle.length > 2 && name.includes(needle)
  })
  const composeMatch = snapshot.composeProjects.find((item) => {
    const name = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
    return needle.length > 2 && name.includes(needle)
  })

  if (compose || related.length > 0 || composeMatch) {
    const running = related.filter((item) => item.running).length
    const composeUp = composeMatch?.status.toLowerCase().includes('running')
    checks.push({
      id: 'chk-compose',
      label: 'Compose / contenedores',
      weight: 10,
      status: running > 0 || composeUp ? 'healthy' : 'degraded',
      detail: composeMatch
        ? `${composeMatch.name}: ${composeMatch.status}`
        : related.length > 0
          ? `${running}/${related.length} contenedores de ${projectName} arriba`
          : `Hay compose en ${basename(compose ?? '')} pero ningún contenedor coincide.`,
      source: 'Docker',
    })
  }

  return checks
}
