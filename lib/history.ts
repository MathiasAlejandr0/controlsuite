import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { projectScore, projectStatus } from './health'
import { suiteDataDir, suiteDataFile } from './paths'
import { readJsonFile, readJsonWithBackup, writeJsonFile } from './json-file'
import type { HealthStatus, Project } from './types'

export type HistoryPoint = {
  projectId: string
  at: string
  status: HealthStatus
  score: number
}

const MAX_AGE_MS = 48 * 60 * 60 * 1000
const file = suiteDataFile('history.json')
const backupFile = `${file}.bak`

export function pruneHistory(points: HistoryPoint[], now = Date.now()) {
  const cutoff = now - MAX_AGE_MS
  return points.filter((point) => {
    const at = new Date(point.at).getTime()
    return Number.isFinite(at) && at >= cutoff
  })
}

export function pointsFromProjects(projects: Project[], at = new Date().toISOString()): HistoryPoint[] {
  return projects.map((project) => ({
    projectId: project.id,
    at,
    status: projectStatus(project),
    score: projectScore(project),
  }))
}

export function loadHistory(): HistoryPoint[] {
  if (!existsSync(file) && !existsSync(backupFile)) return []
  const parsed = existsSync(file)
    ? readJsonWithBackup<HistoryPoint[]>(file, backupFile)
    : readJsonFile<HistoryPoint[]>(backupFile)
  if (!parsed.ok || !Array.isArray(parsed.value)) return []
  return pruneHistory(parsed.value)
}

export function appendHistory(projects: Project[]) {
  const dir = suiteDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const next = pruneHistory([...loadHistory(), ...pointsFromProjects(projects)])
  writeJsonFile(file, next)
  try {
    copyFileSync(file, backupFile)
  } catch {
    // el principal ya se escribió
  }
  return next
}
