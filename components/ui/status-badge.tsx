export type BadgeTone = 'ok' | 'warn' | 'bad' | 'off'

const LABEL: Record<BadgeTone, string> = {
  ok: 'Conectado',
  warn: 'Aviso',
  bad: 'Error',
  off: 'Falta conectar',
}

export function StatusBadge({ tone, label }: { tone: BadgeTone; label?: string }) {
  return <span className={`status-badge badge-${tone}`}>{label ?? LABEL[tone]}</span>
}

export function toneForLink(state: 'conectado' | 'error' | 'sin conectar'): BadgeTone {
  if (state === 'conectado') return 'ok'
  if (state === 'error') return 'bad'
  return 'off'
}
