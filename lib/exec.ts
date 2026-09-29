import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ToolRun = {
  ok: boolean
  stdout: string
  stderr: string
  missing: boolean
}

export async function runTool(command: string, args: string[], timeout = 8000): Promise<ToolRun> {
  try {
    const winScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
    const { stdout, stderr } = await execFileAsync(
      winScript ? 'cmd.exe' : command,
      winScript ? ['/d', '/s', '/c', command, ...args] : args,
      {
        timeout,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
    )
    return { ok: true, stdout: String(stdout).trim(), stderr: String(stderr).trim(), missing: false }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    if (err.code === 'ENOENT') {
      return { ok: false, stdout: '', stderr: '', missing: true }
    }
    return {
      ok: false,
      stdout: String(err.stdout ?? '').trim(),
      stderr: String(err.stderr ?? err.message ?? '').trim(),
      missing: false,
    }
  }
}
