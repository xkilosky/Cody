/**
 * Bug detection.
 *
 * Two things have to be true for diagnostics to be useful on a phone:
 * they must find real mistakes, and they must never cry wolf. So every case
 * here comes in a pair — a broken file that must be flagged, and a correct
 * file that must stay silent.
 */
import { analyzeFile, analyzeProject, countBySeverity } from '../src/lib/diagnostics'
import type { Diagnostic, Severity } from '../src/lib/diagnostics'
import type { ProjectFile } from '../src/types'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const describe = (found: Diagnostic[]) =>
  found.map((d) => `${d.line}:${d.column} ${d.severity} ${d.rule} ${d.message}`).join(' | ') || '(none)'

function expectOne(path: string, content: string, rule: string, line?: number, severity: Severity = 'error', files?: ProjectFile[]) {
  const found = analyzeFile(path, content, files)
  const hit = found.filter((d) => d.rule === rule)
  return {
    found,
    ok: hit.length > 0 && hit[0].severity === severity && (line === undefined || hit[0].line === line),
  }
}

function silent(path: string, content: string, files?: ProjectFile[]) {
  const found = analyzeFile(path, content, files)
  return { found, ok: found.length === 0 }
}

/* ---------------- JavaScript / TypeScript ---------------- */
{
  const broken = `export function App() {
  const items = [1, 2, 3
  return items
}
`
  const { found, ok } = expectOne('src/App.tsx', broken, 'syntax')
  check('tsx: unbalanced call is a syntax error', ok, describe(found))
  check('tsx: error points at the right line', found[0]?.line === 3, describe(found))
}

{
  const { found, ok } = silent('src/App.tsx', `type Item = { id: number; label: string }

export default function App() {
  const items: Item[] = [{ id: 1, label: 'ship it' }]
  return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
}
`)
  check('tsx: valid component is clean', ok, describe(found))
}

{
  const { ok, found } = silent('src/util.ts', `export const add = (a: number, b: number): number => a + b\n`)
  check('ts: valid module is clean', ok, describe(found))
}

{
  const { found, ok } = expectOne('src/App.jsx', `export default () => <div className="x">\n`, 'syntax')
  check('jsx: unclosed element is a syntax error', ok, describe(found))
}

{
  const { found, ok } = expectOne('src/main.js', `if (x = 1) { run() }\n`, 'condition-assignment', 1, 'warning')
  check('js: assignment in a condition is a warning', ok, describe(found))
}

{
  const { found, ok } = expectOne('src/main.js', `debugger\nrun()\n`, 'debugger', 1, 'warning')
  check('js: leftover debugger is a warning', ok, describe(found))
}

{
  const { found, ok } = silent('src/main.js', `const value = 'a = b'\nif (value === 'a = b') { run() }\n`)
  check('js: assignment-looking strings are not flagged', ok, describe(found))
}

/* ---------------- JSON ---------------- */
{
  const broken = `{
  "name": "cody",
  "count": 3
  "ok": true
}
`
  const { found, ok } = expectOne('package.json', broken, 'json', 4)
  check('json: missing comma is reported on its line', ok, describe(found))
}
{
  const { found, ok } = silent('package.json', '{\n  "name": "cody",\n  "count": 3,\n  "ok": true\n}\n')
  check('json: valid file is clean', ok, describe(found))
}

/* ---------------- HTML / XML ---------------- */
{
  const broken = `<main>\n  <h1>Hello\n</main>\n`
  const { found, ok } = expectOne('index.html', broken, 'tags')
  check('html: unclosed <h1> is reported', ok && found.some((d) => d.message.includes('h1')), describe(found))
}
{
  const { found, ok } = silent(
    'index.html',
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <img src="./logo.svg" alt="" />
    <ul>
      <li>one
      <li>two
    </ul>
    <script src="./app.js"></script>
  </body>
</html>
`,
    [
      { path: 'index.html', content: '' },
      { path: 'styles.css', content: '' },
      { path: 'logo.svg', content: '' },
      { path: 'app.js', content: '' },
    ],
  )
  check('html: valid page (void tags, optional <li>) is clean', ok, describe(found))
}
{
  const { found, ok } = expectOne('logo.svg', `<svg>\n  <circle r="4">\n</svg>\n`, 'tags')
  check('xml: unclosed element is reported', ok, describe(found))
}

/* ---------------- CSS ---------------- */
{
  const { found, ok } = expectOne('styles.css', `.card {\n  color: red;\n\n.footer {\n  color: blue;\n}\n`, 'brackets')
  check('css: unclosed block is reported', ok, describe(found))
}
{
  const { found, ok } = silent('styles.css', `.card {\n  color: red;\n  margin: 0 auto;\n}\n`)
  check('css: valid stylesheet is clean', ok, describe(found))
}

/* ---------------- Python ---------------- */
{
  const { found, ok } = expectOne('main.py', 'def greet(name)\n    return name\n', 'python-colon', 1)
  check('python: missing colon is reported', ok, describe(found))
}
{
  const { found, ok } = expectOne('main.py', 'def f():\n    x = 1\n\tif x:\n        pass\n', 'indentation', 3)
  check('python: mixed tabs and spaces is reported', ok, describe(found))
}
{
  const { found, ok } = expectOne('main.py', 'if x = 1:\n    print(x)\n', 'condition-assignment', 1, 'warning')
  check('python: assignment in a condition is a warning', ok, describe(found))
}
{
  const { found, ok } = silent(
    'main.py',
    `def greet(name: str) -> str:
    """Say hello."""
    return f"hi {name}"


if __name__ == "__main__":
    print(greet("cody"))
`,
  )
  check('python: valid module is clean', ok, describe(found))
}

/* ---------------- other languages ---------------- */
{
  const { found, ok } = expectOne('main.go', 'package main\n\nfunc main() {\n\tprintln("hi")\n\n', 'brackets')
  check('go: unclosed block is reported', ok, describe(found))
}
{
  const { found, ok } = silent('main.go', 'package main\n\nfunc main() {\n\tprintln("hi")\n}\n')
  check('go: valid file is clean', ok, describe(found))
}
{
  const { found, ok } = silent('lib.rs', "fn main() {\n    let s: &'static str = \"hi\";\n    println!(\"{}\", s);\n}\n")
  check('rust: lifetimes are not mistaken for strings', ok, describe(found))
}
{
  const { found, ok } = silent('config.yaml', 'name: cody\nitems:\n  - one\n  - two\n')
  check('yaml: indentation and lists stay clean', ok, describe(found))
}

/* ---------------- cross-file ---------------- */
{
  const files: ProjectFile[] = [
    { path: 'src/main.tsx', content: "import App from './App'\n" },
    { path: 'src/App.tsx', content: 'export default function App() { return null }\n' },
  ]
  const { found, ok } = silent('src/main.tsx', files[0].content, files)
  check('imports: existing relative import is clean', ok, describe(found))
}
{
  const files: ProjectFile[] = [
    { path: 'src/main.tsx', content: "import App from './Missing'\n" },
    { path: 'src/App.tsx', content: 'export default function App() { return null }\n' },
  ]
  const found = analyzeFile('src/main.tsx', files[0].content, files)
  check(
    'imports: missing module is reported with its path',
    found.some((d) => d.rule === 'missing-import' && d.message.includes('./Missing')),
    describe(found),
  )
}
{
  const files: ProjectFile[] = [
    { path: 'index.html', content: '<script src="./app.js"></script>\n' },
    { path: 'app.js', content: 'console.log(1)\n' },
  ]
  const found = analyzeFile('index.html', files[0].content, files)
  check('imports: existing <script src> is clean', found.every((d) => d.rule !== 'missing-import'), describe(found))
  const broken = analyzeFile('index.html', '<script src="./nope.js"></script>\n', files)
  check(
    'imports: missing <script src> is reported',
    broken.some((d) => d.rule === 'missing-import'),
    describe(broken),
  )
}

/* ---------------- project roll-up ---------------- */
{
  const files: ProjectFile[] = [
    { path: 'src/App.tsx', content: 'export default () => <div>\n' },
    { path: 'styles.css', content: '.a { color: red; }\n' },
    { path: 'main.py', content: 'def f()\n    pass\n' },
  ]
  const all = analyzeProject(files)
  const { errors } = countBySeverity(all)
  check('project: rolls up diagnostics from every file', all.length >= 2 && errors >= 2, describe(all))
  check('project: errors sort before warnings', all.every((d, i) => i === 0 || all[i - 1].severity === d.severity || d.severity === 'warning'), describe(all))
}

/* ---------------- no false positives on the syntax samples ------- */
{
  const samples: [string, string][] = [
    ['app.js', "const greet = (who) => `hi ${who}`\nconsole.log(greet('cody'), 42)\n"],
    ['app.ts', 'type Point = { x: number; y: number }\nconst at = (p: Point): string => `${p.x}`\n'],
    ['task.tsx', 'const App = () => <div className="card">hi {42}</div>\nexport default App\n'],
    ['styles.css', '/* theme */\n.card {\n  color: #5ce1b9;\n  margin: 2rem;\n}\n'],
    ['data.json', '{\n  "name": "cody",\n  "count": 3\n}\n'],
    ['main.py', "def greet(name):\n    # say hi\n    return f'hi {name}'\n"],
    ['query.sql', 'SELECT id, name FROM users WHERE age > 18;\n'],
    ['config.yaml', 'name: cody\ncount: 3\n'],
    ['build.sh', 'for f in *.ts; do echo "$f"; done\n'],
    ['main.c', 'int main(void) { return 0; }\n'],
    ['main.cpp', 'class Dog { public: int age = 3; };\n'],
    ['Main.java', 'public class Main { static void main(String[] a) { } }\n'],
    ['Main.cs', 'public class Main { static void Run() { var x = 1; } }\n'],
    ['main.go', 'package main\nfunc main() { println("hi") }\n'],
    ['lib.rs', 'fn main() { let s = "hi"; println!("{}", s); }\n'],
    ['index.php', "<?php\n$name = 'cody';\necho $name;\n"],
    ['app.rb', "def greet(name)\n  puts \"hi #{name}\"\nend\n"],
    ['init.lua', "local function greet(name)\n  print('hi ' .. name)\nend\n"],
    ['main.swift', 'let name = "cody"\nfunc greet(_ who: String) -> String { return "hi" }\n'],
    ['Main.kt', 'fun greet(name: String): String { return "hi $name" }\n'],
    ['Dockerfile', 'FROM node:22\nRUN npm install\n'],
    ['notes.md', '# Cody\n\nSome **bold** text.\n'],
  ]
  for (const [path, content] of samples) {
    const { found, ok } = silent(path, content)
    check(`no false positives: ${path}`, ok, describe(found))
  }
}

/* ---------------- shape of a diagnostic ---------------- */
{
  const found = analyzeFile('bad.js', 'const x = \n')
  const first = found[0]
  check('diagnostics carry path, line, column and a rule', Boolean(first && first.path === 'bad.js' && first.line >= 1 && first.column >= 1 && first.rule), JSON.stringify(first))
  check('endColumn is always after column', Boolean(first && first.endColumn > first.column), JSON.stringify(first))
}

console.log(failed === 0 ? '\nAll diagnostics checks passed' : `\n${failed} diagnostics check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
