import { ArchiveEntry } from './types'

/** Normalizes an archive path: forward slashes, no leading `./` or `/`, no empty segments. */
export const normalizePath = (raw: string): string =>
  raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')

export const parentPath = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export interface ArchiveIndex {
  /** All entries including synthesized folders, in archive order. */
  entries: ArchiveEntry[]
  get(path: string): ArchiveEntry | undefined
  /** Direct children of a folder (`''` is the root). */
  children(folder: string): ArchiveEntry[]
  /** All files below a folder, at any depth. */
  filesBelow(folder: string): ArchiveEntry[]
}

/**
 * Builds the folder structure from a flat entry list. Archives often omit folder entries, so
 * missing parents are synthesized; duplicates keep the first occurrence.
 */
export const buildIndex = (rawEntries: ArchiveEntry[]): ArchiveIndex => {
  const byPath = new Map<string, ArchiveEntry>()
  const childrenOf = new Map<string, ArchiveEntry[]>([['', []]])

  const add = (entry: ArchiveEntry) => {
    if (!entry.path || byPath.has(entry.path)) {
      return
    }
    const parent = parentPath(entry.path)
    if (parent && !byPath.has(parent)) {
      add({ path: parent, name: baseName(parent), isDirectory: true, size: 0, supported: true })
    }
    byPath.set(entry.path, entry)
    if (!childrenOf.has(parent)) {
      childrenOf.set(parent, [])
    }
    childrenOf.get(parent).push(entry)
    if (entry.isDirectory && !childrenOf.has(entry.path)) {
      childrenOf.set(entry.path, [])
    }
  }

  rawEntries.forEach(add)

  const entries = [...byPath.values()]
  return {
    entries,
    get: (path) => byPath.get(path),
    children: (folder) => childrenOf.get(folder) ?? [],
    filesBelow: (folder) =>
      entries.filter(
        (entry) => !entry.isDirectory && (folder === '' || entry.path.startsWith(`${folder}/`))
      )
  }
}
