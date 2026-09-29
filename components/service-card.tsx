'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge'

export type ServiceMenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
}

export function ServiceCard({
  title,
  hint,
  tone,
  badge,
  detail,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  menu = [],
  extra,
}: {
  title: string
  hint?: string
  tone: BadgeTone
  badge?: string
  detail?: string
  primaryLabel?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  menu?: ServiceMenuItem[]
  extra?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  return (
    <article ref={root} className="svc" data-service-card>
      <header className="svc-head">
        <h3 className="svc-title" title={title}>
          {title}
        </h3>
        <StatusBadge tone={tone} label={badge} />
      </header>
      <p className="svc-hint" title={hint || undefined}>
        {hint || 'Sin recurso'}
      </p>
      {detail ? (
        <p className="svc-detail" title={detail}>
          {detail}
        </p>
      ) : null}
      {extra}
      <div className="svc-actions">
        {primaryLabel && onPrimary ? (
          <Button variant="primary" disabled={primaryDisabled} onClick={onPrimary}>
            {primaryLabel}
          </Button>
        ) : (
          <span className="svc-spacer" />
        )}
        {menu.length > 0 && (
          <div className="svc-menu">
            <Button
              variant="icon"
              aria-label={`Más acciones de ${title}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
            >
              <MoreHorizontal size={16} />
            </Button>
            {open && (
              <div id={menuId} role="menu" className="svc-menu-list">
                {menu.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="svc-menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false)
                      item.onSelect()
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
