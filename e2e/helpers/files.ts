// Comparing downloads with the original fixtures. Archives are read with Python's zipfile and
// tarfile (the same reference implementations make-fixtures.sh writes them with).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export const sha256 = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })

const LIST_ARCHIVE = `
import hashlib, json, sys, tarfile, zipfile
path, prefix, out = sys.argv[1], sys.argv[2], {}
if zipfile.is_zipfile(path):
    with zipfile.ZipFile(path) as z:
        # reading each member checks its CRC-32
        for i in z.infolist():
            if not i.is_dir() and i.filename.startswith(prefix):
                out[i.filename] = hashlib.sha256(z.read(i)).hexdigest()
else:
    with tarfile.open(path) as t:
        for m in t.getmembers():
            if m.isfile() and m.name.startswith(prefix):
                out[m.name] = hashlib.sha256(t.extractfile(m).read()).hexdigest()
print(json.dumps(out))
`

/**
 * SHA-256 of every file in a zip or tar(.gz/.bz2/.xz) whose path starts with `prefix`, by path;
 * zip members are CRC-checked while reading.
 */
export const archiveHashes = (path: string, prefix = ''): Record<string, string> =>
  JSON.parse(
    execFileSync('python3', ['-I', '-c', LIST_ARCHIVE, path, prefix], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  )
