import { describe, expect, it } from 'vitest'
import { parseDockerContainers } from './connectors/docker'

describe('parseDockerContainers', () => {
  it('lee JSON line a line', () => {
    const raw = [
      '{"Names":"n8n","Image":"n8nio/n8n","Status":"Up 2 hours","State":"running"}',
      '{"Names":"pyhole","Image":"pihole","Status":"Exited (0)","State":"exited"}',
    ].join('\n')
    const parsed = parseDockerContainers(raw)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].running).toBe(true)
    expect(parsed[1].running).toBe(false)
    expect(parsed[0].name).toBe('n8n')
  })
})
