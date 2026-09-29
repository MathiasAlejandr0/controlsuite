import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonWithBackup, writeJsonFile } from './json-file'
import { suiteDataDir } from './paths'
import { restrictDataFile } from './protect'
import type { Incident, Remediation } from './types'

export type OpsState = {
  remediations: Remediation[]
  lastTickAt?: string
  lastStaleNotifyAt?: string
  tone?: 'healthy' | 'degraded' | 'down' | 'unknown'
  down?: number
  degraded?: number
}

const dataDir = suiteDataDir()
const file = join(dataDir, 'ops.json')
const backup = `${file}.bak`

function empty(): OpsState {
  return { remediations: [] }
}

export function loadOps(): OpsState {
  if (!existsSync(file)) return empty()
  const parsed = readJsonWithBackup<OpsState>(file, backup)
  if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.remediations)) return empty()
  return parsed.value
}

export function saveOps(next: OpsState) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  writeJsonFile(file, next)
  restrictDataFile(file)
}

export function queueRemediations(incidents: Incident[]) {
  const ops = loadOps()
  const known = new Set(ops.remediations.map((item) => item.incidentId).filter(Boolean))
  let added = 0
  for (const incident of incidents) {
    if (incident.status === 'resolved' || incident.environment !== 'production') continue
    if (incident.id && known.has(incident.id)) continue
    ops.remediations.unshift({
      id: `rem-${incident.id}`,
      projectId: incident.projectId,
      incidentId: incident.id,
      title: incident.title,
      detail: incident.detail,
      at: new Date().toISOString(),
      status: 'queued',
    })
    added += 1
  }
  ops.remediations = ops.remediations.slice(0, 80)
  if (added > 0) saveOps(ops)
  return added
}

export function patchRemediation(id: string, status: Remediation['status']) {
  const ops = loadOps()
  const row = ops.remediations.find((item) => item.id === id)
  if (!row) return undefined
  row.status = status
  saveOps(ops)
  return row
}

export function queuedRemediations(ops = loadOps()) {
  return ops.remediations.filter((item) => item.status === 'queued')
}
