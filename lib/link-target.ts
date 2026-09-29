import type { LinkProvider, StackNeed } from './types'

export function linkTarget(need: StackNeed): LinkProvider | undefined {
  if (need.provider === 'database') return 'supabase'
  if (
    need.provider === 'github' ||
    need.provider === 'vercel' ||
    need.provider === 'cloudflare' ||
    need.provider === 'supabase' ||
    need.provider === 'insforge'
  ) {
    return need.provider
  }
  return undefined
}
