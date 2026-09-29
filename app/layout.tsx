import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { AppShell } from '@/components/app-shell'
import { LockGate } from '@/components/lock-gate'
import { WorkspaceProvider } from '@/lib/workspace'
import './globals.css'

export const metadata: Metadata = {
  title: 'Suite Control 1.1',
  description: 'Centro de mando para la salud, el acceso y la remediación de tus proyectos.',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b1015',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        <WorkspaceProvider>
          <LockGate>
            <AppShell>{children}</AppShell>
          </LockGate>
        </WorkspaceProvider>
      </body>
    </html>
  )
}
