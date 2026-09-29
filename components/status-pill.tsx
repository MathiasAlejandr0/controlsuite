import { statusLabel } from '@/lib/health'
import type { HealthStatus } from '@/lib/types'

export function StatusPill({ status }: { status: HealthStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  )
}
