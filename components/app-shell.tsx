'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Box,
  Check,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  X,
  Zap,
} from 'lucide-react'
import { openIncidents } from '@/lib/incidents'
import { APP_VERSION } from '@/lib/version'
import { useWorkspace } from '@/lib/workspace'
import { SecretReveal } from './secret-reveal'

const NAV = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: Box },
  { href: '/incidents', label: 'Alertas', icon: AlertTriangle, alert: true },
  { href: '/integrations', label: 'Cuentas', icon: Zap },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function pageTitle(pathname: string) {
  if (pathname.startsWith('/projects/')) return 'Proyecto'
  if (pathname.startsWith('/projects')) return 'Proyectos'
  if (pathname.startsWith('/incidents')) return 'Alertas'
  if (pathname.startsWith('/integrations')) return 'Cuentas'
  if (pathname.startsWith('/settings')) return 'Ajustes'
  return 'Inicio'
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { query, setQuery, toasts, dismissToast, profile, projects, incidents, lockSession } = useWorkspace()
  const [mobileNav, setMobileNav] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const incidentCount = openIncidents(incidents).length

  useEffect(() => {
    setMobileNav(false)
  }, [pathname])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <Activity size={18} />
          </div>
          <span>
            suite<span className="brand-accent">control</span>
            <small className="brand-version">v{APP_VERSION}</small>
          </span>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Cerrar menú"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-group" aria-label="Principal">
          <p className="nav-label">Workspace</p>
          {NAV.map(({ href, label, icon: Icon, alert }) => {
            const count =
              href === '/incidents'
                ? String(incidentCount).padStart(2, '0')
                : href === '/projects'
                  ? String(projects.length).padStart(2, '0')
                  : null
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${isActive(pathname, href) ? 'nav-active' : ''}`}
              >
                <Icon size={17} />
                <span>{label}</span>
                {count && (
                  <span className={`nav-count ${alert && incidentCount > 0 ? 'nav-alert' : ''}`}>
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <Link href="/settings" className={`nav-item ${isActive(pathname, '/settings') ? 'nav-active' : ''}`}>
            <Settings size={17} />
            <span>Ajustes</span>
          </Link>
          <button type="button" className="user-card" onClick={() => void lockSession()}>
            <div className="user-avatar">{profile.initials}</div>
            <div>
              <strong>{profile.name}</strong>
              <small>Bloquear</small>
            </div>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      {mobileNav && (
        <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Cerrar navegación" />
      )}

      <div className="main-content">
        <header className="topbar">
          <button
            className="icon-button menu-trigger"
            onClick={() => setMobileNav(true)}
            aria-label="Abrir menú"
            type="button"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Escritorio</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{pageTitle(pathname)}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={16} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar proyectos…"
                aria-label="Filtrar proyectos"
              />
              <kbd>Ctrl K</kbd>
            </label>
          </div>
        </header>

        <div className="page-wrap">{children}</div>
      </div>

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone ?? 'ok'}`}>
            {toast.tone === 'warn' ? <AlertTriangle size={16} /> : <Check size={16} />}
            {toast.message}
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Cerrar aviso">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <SecretReveal />
    </div>
  )
}
