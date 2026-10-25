import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import translations from '../../l10n/translations.json'

const LANGUAGES = ['de', 'es', 'fr']

const unquote = (value: string) => value.replace(/\\(.)/g, '$1')

/** msgids (and plural msgids) from the template written by `pnpm l10n:extract`. */
const templateIds = () => {
  const pot = readFileSync('l10n/template.pot', 'utf8')
  return [...pot.matchAll(/^msgid "(.+)"$/gm)].map((m) => unquote(m[1]))
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|vue)$/.test(name) ? [path] : []
  })

/** First string argument of every `$gettext(…)` / `$ngettext(…)` call in `src/`. */
const sourceIds = () =>
  sourceFiles('src').flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/\$n?gettext\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) =>
      unquote(m[1])
    )
  )

const placeholders = (text: string) => [...text.matchAll(/%\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  const table = translations as Record<string, Record<string, string | string[]>>
  const ids = templateIds()

  it('template.pot is up to date with the source (run `pnpm l10n:extract`)', () => {
    expect(new Set(sourceIds())).toEqual(new Set(ids))
  })

  it.each(LANGUAGES)('%s translates every string and keeps its placeholders', (language) => {
    const strings = table[language]
    expect(Object.keys(strings).sort()).toEqual([...ids].sort())
    for (const id of ids) {
      const forms = ([] as string[]).concat(strings[id])
      for (const form of forms) {
        expect(form, `${language}: "${id}"`).not.toBe('')
        expect(placeholders(form), `${language}: "${id}"`).toEqual(placeholders(id))
      }
    }
  })
})
