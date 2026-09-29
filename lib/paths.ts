import { join } from 'node:path'

export function suiteDataDir() {
  const fromEnv = process.env.SUITE_DATA_DIR?.trim()
  if (fromEnv) return fromEnv
  return join(process.cwd(), 'data')
}

export function suiteDataFile(...parts: string[]) {
  return join(suiteDataDir(), ...parts)
}
