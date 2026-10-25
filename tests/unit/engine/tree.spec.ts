import { buildIndex, normalizePath, parentPath } from '../../../src/engine/tree'
import { ArchiveEntry } from '../../../src/engine/types'

const file = (path: string): ArchiveEntry => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  isDirectory: false,
  size: 1,
  supported: true
})

describe('normalizePath', () => {
  it.each([
    ['./a/b.txt', 'a/b.txt'],
    ['/a//b/', 'a/b'],
    ['a\\b\\c.txt', 'a/b/c.txt'],
    ['./', '']
  ])('%s -> %s', (raw, expected) => {
    expect(normalizePath(raw)).toBe(expected)
  })
})

describe('parentPath', () => {
  it('returns the folder part', () => {
    expect(parentPath('a/b/c.txt')).toBe('a/b')
    expect(parentPath('c.txt')).toBe('')
  })
})

describe('buildIndex', () => {
  const index = buildIndex([file('a/b/c.txt'), file('a/d.txt'), file('root.txt')])

  it('synthesizes missing folders', () => {
    expect(index.get('a')?.isDirectory).toBe(true)
    expect(index.get('a/b')?.isDirectory).toBe(true)
  })

  it('returns only direct children', () => {
    expect(index.children('').map((e) => e.path)).toEqual(['a', 'root.txt'])
    expect(index.children('a').map((e) => e.path)).toEqual(['a/b', 'a/d.txt'])
    expect(index.children('a/b').map((e) => e.path)).toEqual(['a/b/c.txt'])
  })

  it('lists all files below a folder', () => {
    expect(index.filesBelow('a').map((e) => e.path)).toEqual(['a/b/c.txt', 'a/d.txt'])
    expect(index.filesBelow('')).toHaveLength(3)
  })

  it('keeps the first of duplicate paths', () => {
    const duplicate = buildIndex([
      { ...file('x.txt'), size: 1 },
      { ...file('x.txt'), size: 2 }
    ])
    expect(duplicate.children('')).toHaveLength(1)
    expect(duplicate.get('x.txt')?.size).toBe(1)
  })
})
