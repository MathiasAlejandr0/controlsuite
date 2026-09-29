export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="empty-state" role="status">
      {children}
    </p>
  )
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="empty-state" role="status" aria-busy="true">
      {label}
    </p>
  )
}
