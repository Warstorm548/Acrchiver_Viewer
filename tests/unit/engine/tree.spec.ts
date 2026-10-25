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

  it('keeps the last of duplicate paths, like the readers do', () => {
    const duplicate = buildIndex([
      { ...file('x.txt'), size: 1 },
      { ...file('y.txt'), size: 5 },
      { ...file('x.txt'), size: 2 }
    ])
    expect(duplicate.children('').map((e) => [e.path, e.size])).toEqual([
      ['x.txt', 2],
      ['y.txt', 5]
    ])
    expect(duplicate.get('x.txt')?.size).toBe(2)
    expect(duplicate.entries).toHaveLength(2)
  })

  it('keeps the first when a file and a folder share a path', () => {
    const mixed = buildIndex([
      { ...file('a'), size: 3 },
      { ...file('a'), isDirectory: true }
    ])
    expect(mixed.get('a')?.isDirectory).toBe(false)
    expect(mixed.get('a')?.size).toBe(3)
  })
})
