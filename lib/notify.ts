import { spawn } from 'node:child_process'
import type { Incident } from './types'

export function newProductionIncidents(previous: Incident[], next: Incident[]) {
  const seen = new Set(previous.filter((item) => item.status !== 'resolved').map((item) => item.id))
  return next.filter(
    (item) => item.status !== 'resolved' && item.environment === 'production' && !seen.has(item.id),
  )
}

export function notifyWindows(title: string, body: string) {
  if (process.platform !== 'win32') return false
  const safeTitle = title.replace(/'/g, "''").slice(0, 80)
  const safeBody = body.replace(/'/g, "''").slice(0, 180)
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Error
$n.Visible = $true
$n.ShowBalloonTip(8000, '${safeTitle}', '${safeBody}', [System.Windows.Forms.ToolTipIcon]::Error)
Start-Sleep -Seconds 8
$n.Dispose()
`
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return true
}

export function notifyNewIncidents(previous: Incident[], next: Incident[]) {
  const fresh = newProductionIncidents(previous, next)
  for (const item of fresh.slice(0, 3)) {
    notifyWindows(`Suite Control · ${item.title}`, item.detail)
  }
  return fresh.length
}
