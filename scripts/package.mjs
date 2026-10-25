// Packs dist/ into release/archive-viewer-<version>.zip (top folder "archive-viewer/", the layout
// OpenCloud's apps folder expects) plus a .sha256 file. Run `pnpm build` first.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  BlobWriter,
  configure,
  Uint8ArrayReader,
  ZipWriter
} from '@zip.js/zip.js/lib/zip-native.js'

const APP_ID = 'archive-viewer'
const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')
const releaseDir = join(root, 'release')

const fail = (message) => {
  console.error(`package: ${message}`)
  process.exit(1)
}

if (!existsSync(join(dist, 'manifest.json'))) {
  fail('dist/manifest.json not found, run `pnpm build` first')
}
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
if (manifest.version !== version) {
  fail(`dist/ is version ${manifest.version}, package.json is ${version}; rebuild first`)
}

const listFiles = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? listFiles(path) : [path]
    })

configure({ useWebWorkers: false })
const writer = new ZipWriter(new BlobWriter('application/zip'))
const files = listFiles(dist)
for (const file of files) {
  const name = `${APP_ID}/${relative(dist, file).split(sep).join('/')}`
  await writer.add(name, new Uint8ArrayReader(readFileSync(file)), {
    lastModDate: statSync(file).mtime
  })
}
const zip = Buffer.from(await (await writer.close()).arrayBuffer())

mkdirSync(releaseDir, { recursive: true })
const zipName = `${APP_ID}-${version}.zip`
writeFileSync(join(releaseDir, zipName), zip)
const sha256 = createHash('sha256').update(zip).digest('hex')
writeFileSync(join(releaseDir, `${zipName}.sha256`), `${sha256}  ${zipName}\n`)

console.log(`release/${zipName}: ${files.length} files, ${zip.length} bytes`)
console.log(`sha256 ${sha256}`)
