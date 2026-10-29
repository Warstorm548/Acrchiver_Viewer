import { readFileSync } from 'node:fs'
import { isSupportedHelperVersion, SUPPORTED_HELPER_RANGE } from '../../src/helper/gate'

// The viewer and the helper have their own versions; these checks keep the repository's pair
// usable together, so a release can't ship a helper its own viewer refuses.
const read = (path: string) => readFileSync(path, 'utf8')

const helperVersion = /^const Version = "(.+)"$/m.exec(read('server/internal/api/api.go'))?.[1]

describe('helper version', () => {
  it(`the helper in this repository is in the viewer's range (${SUPPORTED_HELPER_RANGE})`, () => {
    expect(helperVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(isSupportedHelperVersion(helperVersion)).toBe(true)
  })

  it('the compose file pulls that helper version by default', () => {
    const tag = /archive-helper:\$\{ARCHIVE_HELPER_TAG:-(.+?)\}/.exec(
      read('deploy/compose/archive-helper.yml')
    )?.[1]
    expect(tag).toBe(helperVersion)
  })

  it('both changelogs have an entry for the current versions', () => {
    const { version } = JSON.parse(read('package.json'))
    expect(read('ArchiveViewerChangelog.md')).toContain(`## [${version}]`)
    expect(read('ArchiveHelperChangelog.md')).toContain(`## [${helperVersion}]`)
  })
})
