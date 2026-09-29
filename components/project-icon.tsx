import { Box, Command, Globe2, Server, type LucideIcon } from 'lucide-react'
import type { ProjectKind } from '@/lib/types'

const ICONS: Record<ProjectKind, LucideIcon> = {
  web: Globe2,
  mobile: Box,
  desktop: Command,
  backend: Server,
}

const TONES: Record<ProjectKind, string> = {
  web: 'violet',
  mobile: 'orange',
  desktop: 'blue',
  backend: 'cyan',
}

export function ProjectIcon({
  kind,
  size = 18,
}: {
  kind: ProjectKind
  size?: number
}) {
  const Icon = ICONS[kind]
  return (
    <div className={`project-icon icon-${TONES[kind]}`}>
      <Icon size={size} strokeWidth={1.8} />
    </div>
  )
}
