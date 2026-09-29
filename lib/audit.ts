import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suiteDataDir } from './paths'
import type { AuditEvent } from './types'

const dataDir = suiteDataDir()
const file = join(dataDir, 'audit.jsonl')
const MAX_AUDIT_LINES = 4000

function pruneAuditFile() {
  if (!existsSync(file)) return
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim())
  if (lines.length <= MAX_AUDIT_LINES) return
  writeFileSync(file, `${lines.slice(-MAX_AUDIT_LINES).join('\n')}\n`, 'utf8')
}

export function appendAudit(event: Omit<AuditEvent, 'id' | 'at'> & { id?: string; at?: string }) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  const row: AuditEvent = {
    id: event.id ?? randomUUID(),
    type: event.type,
    label: event.label,
    at: event.at ?? new Date().toISOString(),
  }
  appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8' })
  try {
    pruneAuditFile()
  } catch {
    // el evento ya quedó
  }
  return row
}

export function readAudit(limit = 80): AuditEvent[] {
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const rows: AuditEvent[] = []
  for (const line of lines.slice(-Math.max(1, limit))) {
    try {
      rows.push(JSON.parse(line) as AuditEvent)
    } catch {
      // línea rota, se salta
    }
  }
  return rows.reverse()
}
