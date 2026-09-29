import { runTool } from './exec'
import { probeDocker, type DockerSnapshot } from './connectors/docker'
import { loadCredentials } from './credentials'
import type { HealthStatus, IntegrationId } from './types'

export type ToolStatus = {
  id: string
  label: string
  group: 'local' | 'cloud'
  status: HealthStatus
  detail: string
  version?: string
}

export type EnvironmentSnapshot = {
  tools: ToolStatus[]
  docker: DockerSnapshot
  githubConfigured: boolean
}

const WIN_SCRIPTS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'cursor', 'flutter', 'py'])

function commandsFor(command: string) {
  if (process.platform !== 'win32') return [command]
  if (command.endsWith('.cmd') || command.endsWith('.exe')) return [command]
  if (WIN_SCRIPTS.has(command)) return [`${command}.cmd`, command]
  return [command]
}

function looksLikeError(text: string) {
  return /spawn|einval|enoent|not recognized|no se reconoce/i.test(text)
}

async function firstVersion(
  candidates: Array<{ command: string; args: string[] }>,
  timeout = 8000,
) {
  for (const candidate of candidates) {
    for (const command of commandsFor(candidate.command)) {
      const result = await runTool(command, candidate.args, timeout)
      if (result.missing) continue
      const version = (result.stdout || result.stderr).split(/\r?\n/)[0]?.trim()
      if (version && looksLikeError(version)) continue
      if (result.ok && version) return { installed: true, version }
      if (version) return { installed: true, version }
    }
  }
  return { installed: false, version: undefined }
}

function localTool(
  id: string,
  label: string,
  installed: boolean,
  version?: string,
  missingDetail = 'No está en el PATH de este equipo.',
): ToolStatus {
  return {
    id,
    label,
    group: 'local',
    status: installed ? 'healthy' : 'unknown',
    detail: installed ? version ?? 'Detectado' : missingDetail,
    version,
  }
}

function cloudTool(id: IntegrationId, label: string, configured: boolean, hint: string): ToolStatus {
  return {
    id,
    label,
    group: 'cloud',
    status: configured ? 'healthy' : 'unknown',
    detail: configured ? 'Token guardado en este equipo.' : hint,
  }
}

export async function probeEnvironment(): Promise<EnvironmentSnapshot> {
  const creds = loadCredentials()
  const [git, node, npm, python, flutter, cursorProbe, docker] = await Promise.all([
    firstVersion([{ command: 'git', args: ['--version'] }]),
    firstVersion([{ command: 'node', args: ['-v'] }]),
    firstVersion([{ command: 'npm', args: ['-v'] }]),
    firstVersion([
      { command: 'python', args: ['--version'] },
      { command: 'py', args: ['--version'] },
    ]),
    firstVersion([{ command: 'flutter', args: ['--version'] }], 15000),
    firstVersion([{ command: 'cursor', args: ['--version'] }]),
    probeDocker(),
  ])

  let cursor = cursorProbe
  if (!cursor.installed && process.platform === 'win32') {
    const located = await runTool('where', ['cursor'])
    if (located.ok && located.stdout && !looksLikeError(located.stdout)) {
      cursor = { installed: true, version: 'CLI listo para abrir proyectos' }
    }
  }

  const tools: ToolStatus[] = [
    localTool('git', 'Git', git.installed, git.version),
    localTool('node', 'Node.js', node.installed, node.version),
    localTool('npm', 'npm', npm.installed, npm.version),
    localTool('python', 'Python', python.installed, python.version),
    localTool('flutter', 'Flutter', flutter.installed, flutter.version),
    localTool('cursor', 'Cursor', cursor.installed, cursor.version, 'No se detectó el CLI de Cursor.'),
    {
      id: 'docker',
      label: 'Docker',
      group: 'local',
      status: !docker.installed ? 'unknown' : docker.running ? 'healthy' : 'down',
      detail: !docker.installed
        ? 'Docker no está instalado o no está en el PATH.'
        : docker.running
          ? `Daemon ${docker.version} · ${docker.containers.length} contenedores`
          : 'Instalado, pero el daemon no responde. Abrí Docker Desktop.',
      version: docker.version,
    },
    cloudTool(
      'github',
      'GitHub',
      Boolean(creds.integrations.github || creds.githubApp?.installationId),
      creds.githubApp?.installationId
        ? 'Suite Control está autorizada. El sync lee Actions y checks.'
        : 'Enlazá GitHub para autorizar repos. El PAT en Ajustes es el respaldo.',
    ),
    cloudTool('vercel', 'Vercel', Boolean(creds.integrations.vercel), 'Token de cuenta para deployments.'),
    cloudTool('cloudflare', 'Cloudflare', Boolean(creds.integrations.cloudflare), 'API token de zona + TLS.'),
    cloudTool('supabase', 'Supabase', Boolean(creds.integrations.supabase), 'Access token del Management API.'),
    cloudTool('insforge', 'InsForge', Boolean(creds.integrations.insforge), 'Dashboard oficial para la base del proyecto.'),
    cloudTool('sentry', 'Sentry', Boolean(creds.integrations.sentry), 'Issues abiertas del org/proyecto.'),
  ]

  return {
    tools,
    docker,
    githubConfigured: Boolean(creds.integrations.github || creds.githubApp?.installationId),
  }
}
