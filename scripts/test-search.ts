/**
 * Find in files: matching, previews, caps and replacement.
 *
 * The search sheet is only as trustworthy as this module, so the rules are
 * pinned here without a DOM: exact positions, literal vs regex, the preview
 * window, the early stop, and a replacement that cannot be talked into
 * expanding `$1`.
 */
import type { ProjectFile } from '../src/types'
import {
  findMatches,
  MAX_MATCHES,
  MAX_PER_FILE,
  replaceAll,
  replaceProject,
  searchProject,
} from '../src/lib/search'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const file = (path: string, content: string): ProjectFile => ({ path, content })

const project: ProjectFile[] = [
  file(
    'src/utils.ts',
    ['export function loadProject(id: string) {', '  return db.get(id)', '}', '', 'export const loadProjectMeta = 1'].join('\n'),
  ),
  file('src/App.tsx', ['import { loadProject } from "./utils"', 'export default function App() {', '  loadProject("1")', '}'].join(
    '\n',
  )),
  file('README.md', '# Cody\nloadProject lives in src/utils.ts\n'),
]

/* ---------------- literal search ---------------- */
{
  const result = searchProject(project, 'loadProject')
  check('finds every file that contains the word', result.fileCount === 3, String(result.fileCount))
  check('counts every occurrence', result.total === 5, String(result.total))
  check('no error for a plain query', result.error === null)
  const app = result.files.find((entry) => entry.path === 'src/App.tsx')!
  check('one-based line numbers', app.matches[0].line === 1, JSON.stringify(app.matches[0].line))
  check('one-based columns', app.matches[0].column === 10, JSON.stringify(app.matches[0].column))
  check('second match on another line', app.matches[1].line === 3 && app.matches[1].column === 3, JSON.stringify(app.matches[1]))
  check('preview carries the line around the match', app.matches[1].before === '…' || app.matches[1].before.trim() === '', app.matches[1].before)
  check('the match text is exact', app.matches[0].match === 'loadProject', app.matches[0].match)
  check('absolute offsets are correct', app.matches[0].start === 9, String(app.matches[0].start))
}

/* ---------------- ordering and identity ---------------- */
{
  const result = searchProject(project, 'loadProject')
  check(
    'the busiest file comes first',
    result.files[0].matches.length === 2 && result.files[2].matches.length === 1,
    result.files.map((entry) => `${entry.path}:${entry.matches.length}`).join(','),
  )
  check(
    'ties are alphabetical',
    result.files[0].path === 'src/App.tsx' && result.files[1].path === 'src/utils.ts',
    result.files.map((entry) => entry.path).join(','),
  )
  const none = searchProject(project, 'nothingMatchesThis')
  check('a miss returns nothing', none.total === 0 && none.fileCount === 0)
  const empty = searchProject(project, '')
  check('an empty query returns nothing at all', empty.total === 0 && empty.files.length === 0)
}

/* ---------------- case sensitivity ---------------- */
{
  check('case-insensitive by default', searchProject(project, 'LOADPROJECT').total === 5, String(searchProject(project, 'LOADPROJECT').total))
  check('case-sensitive skips the misses', searchProject(project, 'LOADPROJECT', { caseSensitive: true }).total === 0)
  check('case-sensitive still finds exact text', searchProject(project, 'loadProject', { caseSensitive: true }).total === 5)
}

/* ---------------- regex ---------------- */
{
  const regex = searchProject(project, 'load\\w+', { regex: true })
  check('regex matches names', regex.total === 5, String(regex.total))
  const dotted = searchProject([file('a.txt', 'a.b axb a.b')], 'a.b')
  check('a dot is literal unless regex is on', dotted.total === 2, String(dotted.total))
  const dottedRegex = searchProject([file('a.txt', 'a.b axb')], 'a.b', { regex: true })
  check('a dot is a wildcard in regex mode', dottedRegex.total === 2, String(dottedRegex.total))
  const broken = searchProject(project, 'load(', { regex: true })
  check('an invalid pattern reports an error', broken.error !== null && broken.total === 0, String(broken.error))
  check('a literal parenthesis is fine', searchProject(project, 'load(', { regex: false }).error === null)
}

/* ---------------- empty matches never loop ---------------- */
{
  const started = Date.now()
  const star = searchProject([file('a.ts', 'aaa bbb\nccc')], 'z*', { regex: true })
  const caret = searchProject([file('a.ts', 'one\ntwo')], '^', { regex: true })
  check('a pattern that can match nothing is harmless', star.total === 0 && caret.total === 0)
  check('and it returns immediately', Date.now() - started < 250, `${Date.now() - started}ms`)
}

/* ---------------- preview window ---------------- */
{
  const long = `${'a'.repeat(120)}NEEDLE${'b'.repeat(120)}`
  const [match] = findMatches(long, 'NEEDLE')
  check('the preview is trimmed on both sides', match.before.endsWith('…') === false && match.before.length <= 46, String(match.before.length))
  check('the trimmed preview opens with an ellipsis', match.before.startsWith('…'), match.before.slice(0, 6))
  check('the tail is trimmed too', match.after.endsWith('…'), match.after.slice(-6))
  check('the match itself is untouched', match.match === 'NEEDLE')

  const indented = '\t\tconst x = 1'
  const [tabbed] = findMatches(indented, 'const')
  check('a deep indent is dropped from the preview', tabbed.before === '', JSON.stringify(tabbed.before))
  check('tab indentation still reports the real column', tabbed.column === 3, String(tabbed.column))
}

/* ---------------- caps ---------------- */
{
  const many = Array.from({ length: MAX_PER_FILE + 25 }, (_, index) => `hit ${index}`).join('\n')
  const capped = searchProject([file('big.txt', many)], 'hit')
  check('a single file is capped', capped.total === MAX_PER_FILE, String(capped.total))
  check('and the cap is reported', capped.truncated === true)

  const files = Array.from({ length: 30 }, (_, index) => file(`f${index}.txt`, 'x\n'.repeat(30)))
  const bounded = searchProject(files, 'x')
  check('the whole search is capped', bounded.total <= MAX_MATCHES, String(bounded.total))
  check('the global cap is reported', bounded.truncated === true)
}

/* ---------------- replacement ---------------- */
{
  const replaced = replaceAll('const a = 1\nconst b = 2\n', 'const', 'let')
  check('every occurrence is replaced', replaced.text === 'let a = 1\nlet b = 2\n', JSON.stringify(replaced.text))
  check('the count is returned', replaced.count === 2, String(replaced.count))

  const literal = replaceAll('price $1 and $2', '$1', 'USD')
  check('a dollar in the replacement stays literal', literal.text === 'price USD and $2', JSON.stringify(literal.text))

  const numbered = replaceAll('a1 a2', 'a(\\d)', '$1', { regex: true })
  check('no group expansion happens', numbered.text === '$1 $1', JSON.stringify(numbered.text))

  const insensitive = replaceAll('LoadProject loadProject', 'loadproject', 'open', { caseSensitive: false })
  check('replacement follows the same case rules', insensitive.count === 2, String(insensitive.count))

  const none = replaceAll('abc', 'zzz', 'q')
  check('a miss leaves the text alone', none.text === 'abc' && none.count === 0)

  const bad = replaceAll('abc', '(', 'q', { regex: true })
  check('an invalid pattern replaces nothing', bad.text === 'abc' && bad.count === 0)
}

/* ---------------- project replacement ---------------- */
{
  const { changes, total } = replaceProject(project, 'loadProject', 'openProject')
  check('only changed files are returned', changes.length === 3, changes.map((change) => change.path).join(','))
  check('the total counts matches', total === 5, String(total))
  const untouched = changes.find((change) => change.path === 'README.md')!
  check('the replacement landed', untouched.content.includes('openProject lives in'), untouched.content)
  check('per-file counts are kept', untouched.count === 1, String(untouched.count))
  check('the original project was not mutated', project[0].content.includes('loadProject'))

  const empty = replaceProject(project, '', 'x')
  check('an empty query changes nothing', empty.changes.length === 0 && empty.total === 0)

  // Replacing something with itself is still a hit; the file is unchanged in
  // content but reported, which is what the sheet's count promises.
  const same = replaceProject([file('a.ts', 'keep')], 'keep', 'keep')
  check('replacing text with itself counts', same.total === 1, String(same.total))
}

/* ---------------- every language file is searchable ---------------- */
{
  const all = project.map((entry) => entry.path)
  check('paths are reported verbatim', searchProject(project, 'Cody').files[0].path === 'README.md', all.join(','))
}

if (failed > 0) {
  console.log(`\n✗ ${failed} search check(s) failed`)
  process.exit(1)
}
console.log('\n✓ find in files')
