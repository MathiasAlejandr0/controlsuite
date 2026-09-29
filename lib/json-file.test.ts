import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJsonWithBackup } from './json-file'

describe('readJsonWithBackup', () => {
  it('no pisa el archivo si el principal y el backup están rotos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-json-'))
    const path = join(dir, 'workspace.json')
    writeFileSync(path, '{roto')
    const result = readJsonWithBackup(path, `${path}.bak`)
    expect(result.ok).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('{roto')
  })

  it('restaura el backup y deja copia .corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-json-'))
    const path = join(dir, 'workspace.json')
    writeFileSync(path, '{roto')
    writeFileSync(`${path}.bak`, JSON.stringify({ ok: true }))
    const result = readJsonWithBackup<{ ok: boolean }>(path, `${path}.bak`)
    expect(result).toEqual({ ok: true, value: { ok: true }, restored: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ ok: true })
    expect(readFileSync(`${path}.corrupt`, 'utf8')).toBe('{roto')
  })
})
