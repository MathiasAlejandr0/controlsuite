import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPromptDeeplink } from './cursor-deeplink'
import { isBlockedPath } from './disk'
import { suiteDataFile } from './paths'

const UNSAFE_PATH = /[&|<>^\r\n]/

export function resolveCursorTarget(localPath: string) {
  const path = localPath.trim()
  if (!path) {
    return { ok: false as const, error: 'El proyecto no tiene path local.' }
  }
  if (path.startsWith('github://')) {
    return { ok: false as const, error: 'Este repo solo está en GitHub. Asigná un path local en Conexiones.' }
  }
  if (UNSAFE_PATH.test(path)) {
    return { ok: false as const, error: 'Ese path tiene caracteres que no se pueden abrir.' }
  }
  if (isBlockedPath(path)) {
    return { ok: false as const, error: 'Ese path del sistema no se puede abrir.' }
  }
  if (!existsSync(path)) {
    return { ok: false as const, error: `No existe ${path} en este equipo.` }
  }
  return { ok: true as const, path }
}

function cursorExecutable() {
  const local = process.env.LOCALAPPDATA ?? ''
  const home = process.env.USERPROFILE ?? ''
  return [
    join(local, 'Programs', 'cursor', 'Cursor.exe'),
    join(local, 'Programs', 'Cursor', 'Cursor.exe'),
    join(home, 'AppData', 'Local', 'Programs', 'cursor', 'Cursor.exe'),
  ].find((item) => item && existsSync(item))
}

function spawnDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  })
  child.unref()
}

function copyClipboard(text: string) {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'],
      { input: text, encoding: 'utf8', windowsHide: true, timeout: 10_000 },
    )
    return result.status === 0
  }
  const result = spawnSync('pbcopy', {
    input: text,
    encoding: 'utf8',
    timeout: 4000,
  })
  return result.status === 0
}

function openUri(uri: string) {
  if (process.platform === 'win32') {
    const escaped = uri.replace(/'/g, "''")
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${escaped}'`],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    child.unref()
    return
  }
  spawnDetached(process.platform === 'darwin' ? 'open' : 'xdg-open', [uri])
}

export function writeCursorTaskFile(projectId: string, prompt: string) {
  const dir = suiteDataFile('prompts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const safe = projectId.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'proyecto'
  const file = join(dir, `${safe}.md`)
  writeFileSync(file, `${prompt.trim()}\n`, 'utf8')
  return file
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function openInCursor(
  localPath: string,
  options?: { prompt?: string; compactPrompt?: string; projectId?: string },
) {
  const target = resolveCursorTarget(localPath)
  if (!target.ok) return { ...target, injected: false, taskFile: undefined as string | undefined }

  const prompt = options?.prompt?.trim()
  let taskFile: string | undefined
  let clipboard = false
  if (prompt) {
    try {
      taskFile = writeCursorTaskFile(options?.projectId ?? 'proyecto', prompt)
    } catch {
      taskFile = undefined
    }
    clipboard = copyClipboard(prompt)
  }

  const bin = process.platform === 'win32' ? cursorExecutable() : 'cursor'
  if (!bin) {
    return { ok: false as const, error: 'No encontramos Cursor.exe en este usuario.', injected: false, taskFile }
  }
  spawnDetached(bin, ['--new-window', target.path])

  let injected = false
  if (prompt) {
    const compact = options?.compactPrompt?.trim() || prompt
    const deeplink = buildPromptDeeplink(compact) ?? buildPromptDeeplink(prompt)
    await wait(2200)
    if (deeplink) {
      openUri(deeplink)
      injected = true
    }
  }

  return { ok: true as const, injected, clipboard, taskFile }
}
