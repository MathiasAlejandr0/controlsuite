import { describe, expect, it } from 'vitest'
import { inferProjectTag, projectTag } from './tag'

describe('inferProjectTag', () => {
  it('marca casa en Users/Desktop y trabajo en D:\\repos', () => {
    expect(inferProjectTag('C:\\Users\\mathi\\Documents\\foto')).toBe('casa')
    expect(inferProjectTag('D:\\suertu2s')).toBe('trabajo')
    expect(projectTag({ localPath: 'D:\\x', tag: 'casa' })).toBe('casa')
  })
})
