/**
 * Code actions.
 *
 * Each case is a tiny project plus a caret position. The action must exist, and
 * — more importantly — applying its edits must produce the text a person would
 * have typed by hand. `apply()` below is the same edit engine the editor uses,
 * so these checks cover the real result, not just the label.
 */
import { codeActionsFor, importSpecifier, renameEdits } from '../src/lib/codeActions'
import type { CodeAction, TextEdit } from '../src/lib/codeActions'
import type { ProjectFile } from '../src/types'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Apply edits the way CodeMirror does: last-position first, then splice. */
function apply(content: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.from - a.from || b.to - a.to)
  let out = content
  for (const edit of ordered) out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to)
  return out
}

function actions(content: string, path: string, cursor: string | number, files?: ProjectFile[], selection?: [string, string]) {
  const pos =
    typeof cursor === 'number'
      ? cursor
      : (() => {
          const at = content.indexOf(cursor)
          if (at === -1) throw new Error(`caret marker ${cursor} not found`)
          return at
        })()
  const range = selection
    ? { from: content.indexOf(selection[0]), to: content.indexOf(selection[1]) + selection[1].length }
    : undefined
  return codeActionsFor({ path, content, pos, files, selection: range })
}

const find = (list: CodeAction[], id: string) => list.find((action) => action.id === id)

/* ---------------- quick fixes ---------------- */
{
  const content = 'function run() {\n  debugger\n  return 1\n}\n'
  const list = actions(content, 'src/app.js', 'debugger')
  const action = find(list, 'remove-debugger')
  check('leftover debugger offers a fix', Boolean(action))
  check('the fix removes the whole line', apply(content, action?.edits ?? []) === 'function run() {\n  return 1\n}\n', JSON.stringify(apply(content, action?.edits ?? [])))
}

{
  const content = 'if (count = 3) {\n  run()\n}\n'
  const action = find(actions(content, 'src/app.js', 'count'), 'assignment-in-condition')
  check('assignment in a condition offers ===', Boolean(action))
  check('the comparison is rewritten', apply(content, action?.edits ?? []).includes('if (count === 3)'), apply(content, action?.edits ?? []))
}

{
  const content = 'def greet(name)\n    return name\n'
  const action = find(actions(content, 'main.py', 'def'), 'python-colon')
  check('python header offers the missing colon', Boolean(action))
  check('the colon lands at the end of the line', apply(content, action?.edits ?? []).startsWith('def greet(name):'), apply(content, action?.edits ?? []))
}

{
  const content = '.card {\n  color: red\n  margin: 0;\n}\n'
  const action = find(actions(content, 'styles.css', 'red'), 'css-semicolon')
  check('css declaration offers a semicolon', Boolean(action))
  check('the semicolon is added once', apply(content, action?.edits ?? []).includes('color: red;'), apply(content, action?.edits ?? []))
}

{
  const content = 'const a = 1\n\tconst b = 2\n'
  const action = find(actions(content, 'src/app.js', 3), 'tabs-to-spaces')
  check('tab indentation offers a conversion', Boolean(action))
  check('tabs become two spaces', apply(content, action?.edits ?? []) === 'const a = 1\n  const b = 2\n', JSON.stringify(apply(content, action?.edits ?? [])))
}

{
  const content = 'const a = 1   \nconst b = 2\n'
  const action = find(actions(content, 'src/app.js', 3), 'trim-trailing-whitespace')
  check('trailing whitespace offers a trim', Boolean(action))
  check('the trailing spaces go', apply(content, action?.edits ?? []) === 'const a = 1\nconst b = 2\n', JSON.stringify(apply(content, action?.edits ?? [])))
}

/* ---------------- imports ---------------- */
{
  const files: ProjectFile[] = [
    { path: 'src/main.ts', content: "const total = clamp(1, 2, 3)\n" },
    { path: 'src/utils.ts', content: 'export function clamp(value: number, min: number, max: number) { return value }\n' },
  ]
  const action = find(actions(files[0].content, 'src/main.ts', 'clamp(', files), 'import-clamp')
  check('a used-but-missing symbol offers an import', Boolean(action), JSON.stringify(actions(files[0].content, 'src/main.ts', 'clamp(', files).map((a) => a.id)))
  check(
    'the import is added at the top with the right path',
    apply(files[0].content, action?.edits ?? []).startsWith("import { clamp } from './utils'"),
    JSON.stringify(apply(files[0].content, action?.edits ?? [])),
  )
}

{
  const files: ProjectFile[] = [
    { path: 'src/main.ts', content: 'const a = 1\nconst b = helper()\n' },
    { path: 'src/lib/helpers.ts', content: 'export default function helper() { return 2 }\n' },
  ]
  const action = find(actions(files[0].content, 'src/main.ts', 'helper(', files), 'import-helper')
  check(
    'a default export imports without braces and across folders',
    apply(files[0].content, action?.edits ?? []).startsWith("import helper from './lib/helpers'"),
    JSON.stringify(apply(files[0].content, action?.edits ?? [])),
  )
}

{
  const files: ProjectFile[] = [
    { path: 'app.py', content: 'print(greet("cody"))\n' },
    { path: 'lib/util.py', content: 'def greet(name):\n    return name\n' },
  ]
  const action = find(actions(files[0].content, 'app.py', 'greet(', files), 'import-greet')
  check(
    'python imports use dotted modules',
    apply(files[0].content, action?.edits ?? []).startsWith('from lib.util import greet'),
    JSON.stringify(apply(files[0].content, action?.edits ?? [])),
  )
}

{
  const content = "import { a, b } from './x'\nconsole.log(a)\n"
  const action = find(actions(content, 'src/main.js', 'console'), 'remove-unused-imports')
  check('an unused import is offered for removal', Boolean(action), JSON.stringify(actions(content, 'src/main.js', 'console').map((a) => a.id)))
  check('only the unused name is removed', apply(content, action?.edits ?? []) === "import { a } from './x'\nconsole.log(a)\n", JSON.stringify(apply(content, action?.edits ?? [])))
}

{
  const content = "import { unused } from './x'\nconsole.log(1)\n"
  const action = find(actions(content, 'src/main.js', 'console'), 'remove-unused-imports')
  check('an import used nowhere loses its statement', apply(content, action?.edits ?? []) === 'console.log(1)\n', JSON.stringify(apply(content, action?.edits ?? [])))
}

/* ---------------- refactors ---------------- */
{
  const content = 'let count = 0\nconsole.log(count)\n'
  const action = find(actions(content, 'src/app.js', 'count ='), 'let-to-const')
  check('an unreassigned let offers const', Boolean(action))
  check('the keyword is swapped', apply(content, action?.edits ?? []).startsWith('const count'), apply(content, action?.edits ?? []))

  const reassigned = 'let count = 0\ncount = count + 1\n'
  check('a reassigned let is left alone', !find(actions(reassigned, 'src/app.js', 'count'), 'let-to-const'))
}

{
  const content = 'var total = 0\n'
  const action = find(actions(content, 'src/app.js', 'var'), 'var-to-let')
  check('var offers let', Boolean(action))
  check('var becomes let', apply(content, action?.edits ?? []) === 'let total = 0\n', JSON.stringify(apply(content, action?.edits ?? [])))
}

{
  const content = 'const label = "hello"\n'
  const action = find(actions(content, 'src/app.js', 'hello'), 'toggle-quotes')
  check('a string offers quote toggling', Boolean(action))
  check('the quotes are swapped', apply(content, action?.edits ?? []) === "const label = 'hello'\n", JSON.stringify(apply(content, action?.edits ?? [])))
}

{
  const content = 'const sum = 1 + 2\n'
  const list = actions(content, 'src/app.js', 'sum', undefined, ['1 + 2', '1 + 2'])
  const action = find(list, 'extract-variable')
  check('a selection offers extraction', Boolean(action), JSON.stringify(list.map((a) => a.id)))
  const result = apply(content, action?.edits ?? [])
  check('the expression moves into a const', result === 'const extracted = 1 + 2\nconst sum = extracted\n', JSON.stringify(result))
}

{
  const content = 'class Cart {\n  total = 0\n}\nconst c = new Cart()\n'
  const action = find(actions(content, 'src/app.js', 'Cart()'), 'rename-symbol')
  check('an identifier offers a rename', Boolean(action), JSON.stringify(actions(content, 'src/app.js', 'Cart()').map((a) => a.id)))
  check('rename is a command, not a blind edit', action?.command?.id === 'rename-symbol' && action.command.name === 'Cart')
  const edits = renameEdits(content, 'Cart', 'Basket')
  check('rename hits every whole-word occurrence', apply(content, edits) === 'class Basket {\n  total = 0\n}\nconst c = new Basket()\n', JSON.stringify(apply(content, edits)))
  check('rename does not touch longer identifiers', !apply('const CartItem = 1; Cart', renameEdits('const CartItem = 1; Cart', 'Cart', 'X')).includes('XItem'))
}

{
  const files: ProjectFile[] = [{ path: 'index.html', content: '<script src="./app.js"></script>\n' }]
  const action = find(actions(files[0].content, 'index.html', '<script', files), 'create-app.js')
  check('a missing script offers to create the file', Boolean(action), JSON.stringify(actions(files[0].content, 'index.html', '<script', files).map((a) => a.id)))
  check('the command names the file to create', action?.command?.id === 'create-file' && action.command.path === 'app.js')
}

/* ---------------- path maths ---------------- */
{
  check('same folder', importSpecifier('src/main.ts', 'src/utils.ts') === './utils', importSpecifier('src/main.ts', 'src/utils.ts'))
  check('down a folder', importSpecifier('src/main.ts', 'src/lib/x.ts') === './lib/x', importSpecifier('src/main.ts', 'src/lib/x.ts'))
  check('up a folder', importSpecifier('src/a/main.ts', 'src/utils.ts') === '../utils', importSpecifier('src/a/main.ts', 'src/utils.ts'))
  check('root to root', importSpecifier('main.js', 'helper.js') === './helper', importSpecifier('main.js', 'helper.js'))
  check('python uses dots', importSpecifier('app.py', 'lib/util.py') === 'lib.util', importSpecifier('app.py', 'lib/util.py'))
}

/* ---------------- restraint ---------------- */
{
  const clean = "import { clamp } from './utils'\nconst total = clamp(1, 2, 3)\nexport { total }\n"
  const files: ProjectFile[] = [
    { path: 'src/main.ts', content: clean },
    { path: 'src/utils.ts', content: 'export function clamp(a: number) { return a }\nexport function unusedHelper() {}\n' },
  ]
  const list = actions(clean, 'src/main.ts', 'total', files)
  check('a clean file has no quick fixes', !list.some((action) => action.kind === 'quickfix'), JSON.stringify(list.map((a) => a.id)))
  check('a clean file has no import actions', !list.some((action) => action.id.startsWith('import-')), JSON.stringify(list.map((a) => a.id)))
  check('unused exports elsewhere are not offered', !list.some((action) => action.id.includes('unusedHelper')))
}

console.log(failed === 0 ? '\nAll code action checks passed' : `\n${failed} code action check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
