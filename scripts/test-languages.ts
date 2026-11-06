/**
 * The language registry.
 *
 * Every advertised language has to answer three questions honestly: which file
 * names reach it, where it can run, and how it is highlighted. A mistake here is
 * silent — a file opens with the wrong grammar, or the Run button reaches a
 * runtime that was never wired — so the table is pinned down without a DOM.
 */
import { LANGUAGES, RUNNABLE_EXTENSIONS, languageForPath, languageForId, loadLanguageExtension, runtimeLabel } from '../src/lib/languages'
import { SNIPPETS, snippetsFor } from '../src/lib/snippets'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const byId = new Map(LANGUAGES.map((lang) => [lang.id, lang]))

/* ---------------- table shape ---------------- */
{
  check('every language has a unique id', byId.size === LANGUAGES.length, `${byId.size}/${LANGUAGES.length}`)
  check('every language has a label and a glyph', LANGUAGES.every((l) => l.label.length > 0 && l.glyph.length > 0))
  check('every language claims at least one extension', LANGUAGES.every((l) => l.exts.length > 0), LANGUAGES.filter((l) => l.exts.length === 0).map((l) => l.id).join(','))
  check('plain text stays last so it can be the fallback', LANGUAGES[LANGUAGES.length - 1].id === 'text')

  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const lang of LANGUAGES) {
    for (const ext of lang.exts) {
      const owner = seen.get(ext)
      if (owner) clashes.push(`${ext}: ${owner} + ${lang.id}`)
      else seen.set(ext, lang.id)
    }
  }
  check('no two languages claim the same extension', clashes.length === 0, clashes.join(', '))
  check('extensions are lower-case and dotted', LANGUAGES.every((l) => l.exts.every((ext) => ext === ext.toLowerCase() && ext.startsWith('.'))))
  check('two languages share two extensions', seen.get('.ts') === 'typescript' && seen.get('.m') === 'octave', String(seen.get('.m')))
}

/* ---------------- routing a path to a language ---------------- */
{
  const cases: Array<[string, string]> = [
    ['index.html', 'html'],
    ['src/App.tsx', 'tsx'],
    ['src/lib/util.ts', 'typescript'],
    ['Dockerfile', 'dockerfile'],
    ['app/Dockerfile.dev', 'text'],
    ['.gitignore', 'text'],
    ['main.py', 'python'],
    ['styles.scss', 'css'],
    ['.env', 'text'],
    // second wave
    ['lib/Main.hs', 'haskell'],
    ['lib/Boot.lhs', 'haskell'],
    ['src/main.dart', 'dart'],
    ['build.sbt.scala', 'scala'],
    ['Main.hrl.scala', 'scala'],
    ['src/index.js', 'javascript'],
    ['greet.ex', 'text'],
    ['module/Main.erl', 'erlang'],
    ['src/app.jl', 'julia'],
    ['lib/parser.ml', 'ocaml'],
    ['lib/parser.mli', 'ocaml'],
    ['Program.fs', 'fsharp'],
    ['Program.fsx', 'fsharp'],
    ['script.pl', 'perl'],
    ['lib/Package.pm', 'perl'],
    ['analysis.R', 'r'],
    ['analysis.r', 'r'],
    ['Build.groovy', 'groovy'],
    ['core.cljc', 'clojure'],
    ['core.edn', 'clojure'],
    ['Main.elm', 'elm'],
    ['native.d', 'd'],
    ['math.pas', 'pascal'],
    ['solver.f90', 'fortran'],
    ['legacy.cob', 'cobol'],
    ['script.m', 'octave'],
    ['some.unknownext', 'text'],
    ['NOEXT', 'text'],
  ]
  for (const [path, id] of cases) {
    check(`${path} → ${id}`, languageForPath(path).id === id, languageForPath(path).id)
  }
  check('an unknown id falls back to plain text', languageForId('nope').id === 'text')
  check('a known id resolves', languageForId('haskell').id === 'haskell')
}

/* ---------------- runtimes ---------------- */
{
  const runnable = LANGUAGES.filter((l) => l.runtime !== 'none')
  const cloud = LANGUAGES.filter((l) => l.runtime === 'cloud')
  check('there are runnable languages in every path', ['web', 'python', 'cloud'].every((runtime) => LANGUAGES.some((l) => l.runtime === runtime)))
  check('cloud languages name a Piston runtime', cloud.every((l) => Boolean(l.cloud && l.cloud.length > 0)), cloud.filter((l) => !l.cloud).map((l) => l.id).join(','))
  check(
    'only cloud languages carry a cloud id',
    LANGUAGES.filter((l) => l.runtime !== 'cloud' && l.cloud).every((l) => l.id === 'javascript' || l.id === 'typescript' || l.id === 'python' || l.id === 'xml'),
    LANGUAGES.filter((l) => l.runtime !== 'cloud' && l.cloud).map((l) => l.id).join(','),
  )
  check('web languages run in the browser preview', ['html', 'css', 'javascript', 'typescript', 'tsx', 'jsx', 'xml'].every((id) => byId.get(id)?.runtime === 'web'))
  check('python runs locally in the worker', byId.get('python')?.runtime === 'python')
  check('runnable extensions are collected', RUNNABLE_EXTENSIONS.has('.hs') && RUNNABLE_EXTENSIONS.has('.scala') && RUNNABLE_EXTENSIONS.has('.py'))
  check('data files are not advertised as runnable', !RUNNABLE_EXTENSIONS.has('.json') && !RUNNABLE_EXTENSIONS.has('.md'))
  check('the labels say where it runs', runtimeLabel('cloud') === 'Cloud sandbox' && runtimeLabel('none') === 'Not runnable' && runtimeLabel('python').includes('Pyodide'))
  const notRunnable = LANGUAGES.filter((l) => l.runtime === 'none').map((l) => l.id)
  check(
    'only data and config formats are not runnable',
    notRunnable.every((id) => ['json', 'markdown', 'yaml', 'toml', 'dockerfile', 'diff', 'text'].includes(id)),
    notRunnable.join(','),
  )
  check('the rest really is runnable', `${runnable.length}/${LANGUAGES.length}` === '38/45', `${runnable.length}/${LANGUAGES.length}`)

  // A handful of mappings are the ones a Piston runner will actually look up.
  const piston: Array<[string, string]> = [
    ['haskell', 'haskell'],
    ['erlang', 'erlang'],
    ['julia', 'julia'],
    ['ocaml', 'ocaml'],
    ['fsharp', 'fsharp.net'],
    ['perl', 'perl'],
    ['r', 'rscript'],
    ['scala', 'scala'],
    ['groovy', 'groovy'],
    ['clojure', 'clojure'],
    ['elm', 'elm'],
    ['dart', 'dart'],
    ['pascal', 'pascal'],
    ['fortran', 'fortran'],
    ['cobol', 'cobol'],
    ['d', 'd'],
    ['octave', 'octave'],
  ]
  for (const [id, runtime] of piston) {
    check(`${id} asks the sandbox for “${runtime}”`, byId.get(id)?.cloud === runtime, String(byId.get(id)?.cloud))
  }
}

/* ---------------- grammars ---------------- */
{
  // Every language but plain text must resolve to a real extension (the syntax
  // suite then proves the grammar colours tokens).
  for (const lang of LANGUAGES) {
    if (lang.id === 'text') continue
    const ext = await loadLanguageExtension(lang.id)
    check(`${lang.id}: has a grammar`, Boolean(ext), 'no extension')
  }
  const empty = await loadLanguageExtension('not-a-language')
  check('an unknown language loads as a no-op, not a crash', Array.isArray(empty) && empty.length === 0, JSON.stringify(empty))
  check('plain text falls back to the empty grammar too', (await loadLanguageExtension('text')).length === 0)
}

/* ---------------- a starter snippet per new runtime ---------------- */
{
  const hellos = SNIPPETS.filter((snippet) => snippet.category === 'Hello')
  check('every language added in the second wave has a hello', hellos.length === 17, String(hellos.length))
  check('each hello targets a language that exists', hellos.every((hello) => byId.has(hello.languages[0])), hellos.filter((hello) => !byId.has(hello.languages[0])).map((hello) => hello.id).join(','))
  check(
    'each hello language can actually run',
    hellos.every((hello) => byId.get(hello.languages[0])?.runtime !== 'none'),
    hellos.filter((hello) => byId.get(hello.languages[0])?.runtime === 'none').map((hello) => hello.id).join(','),
  )
  check('a hello comes first for its own file', snippetsFor('haskell')[0].id === 'haskell-hello', snippetsFor('haskell')[0].id)
  check('a hello is real code, not a stub', hellos.every((hello) => hello.code.length > 40), String(Math.min(...hellos.map((hello) => hello.code.length))))
}

if (failed > 0) {
  console.log(`\n✗ ${failed} language check(s) failed`)
  process.exit(1)
}
console.log(`\n✓ ${LANGUAGES.length} languages`)
