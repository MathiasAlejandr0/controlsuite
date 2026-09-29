import { NextResponse } from 'next/server'
import { browseDirectory, isUnderAllowedRoot, resolveDirectory, resolveScanRoots } from '@/lib/disk'
import { denyIfLocked } from '@/lib/guard'
import { diskPathSchema } from '@/lib/schemas'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const roots = resolveScanRoots(loadWorkspace().profile.scanRoots)
  const url = new URL(request.url)
  const raw = url.searchParams.get('path')?.trim() || roots[0] || 'D:\\'
  const parsed = diskPathSchema.safeParse({ path: raw })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Path inválido.', roots }, { status: 400 })
  }
  const resolved = resolveDirectory(parsed.data.path)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, roots }, { status: 400 })
  }
  if (!isUnderAllowedRoot(resolved.path, roots)) {
    return NextResponse.json({ error: 'Esa carpeta está fuera de las raíces permitidas.', roots }, { status: 400 })
  }
  try {
    return NextResponse.json({
      ...browseDirectory(resolved.path),
      roots,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo listar la carpeta.', roots },
      { status: 400 },
    )
  }
}
