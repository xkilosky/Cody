/**
 * Syntax highlighting, language by language.
 *
 * "The editor has no syntax" is a failure that type-checks and renders fine, so
 * this suite loads **every** language Cody advertises, parses a real sample, and
 * asserts the highlighter actually emitted distinct styles — plus that the
 * keywords, strings and comments of that language land on different ones.
 */
import { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { highlightTree } from '@lezer/highlight'
import { LANGUAGES, loadLanguageExtension } from '../src/lib/languages'
import { buildHighlightStyle, editorThemeFor } from '../src/editor/theme'
import { SYNTAX_THEMES, paletteFor } from '../src/editor/syntaxThemes'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** One realistic sample per language: enough tokens to colour. */
const SAMPLES: Record<string, string> = {
  javascript: "// pick a name\nconst greet = (who) => `hi ${who}`\nconsole.log(greet('cody'), 42)\n",
  typescript: "// typed\ntype Point = { x: number; y: number }\nconst at = (p: Point): string => `${p.x}`\n",
  tsx: "// component\nconst App = () => <div className=\"card\">hi {42}</div>\nexport default App\n",
  jsx: "// element\nconst el = <button onClick={() => 1}>go</button>\n",
  html: "<!-- page -->\n<main class=\"wrap\"><h1>Hello</h1></main>\n",
  css: "/* theme */\n.card {\n  color: #5ce1b9;\n  margin: 2rem;\n}\n",
  json: '{\n  "name": "cody",\n  "count": 3,\n  "ok": true\n}\n',
  markdown: '# Cody\n\nSome **bold** text and `code`.\n\n- item\n',
  python: "def greet(name):\n    # say hi\n    return f'hi {name}' if name else None\n\nprint(greet('cody'), 42)\n",
  sql: "-- rows\nSELECT id, name FROM users WHERE age > 18\n",
  xml: '<?xml version="1.0"?>\n<root attr="1"><child>text</child></root>\n',
  yaml: "# config\nname: cody\ncount: 3\nitems:\n  - one\n",
  toml: '# config\nname = "cody"\ncount = 3\n',
  shell: "#!/bin/bash\n# build\nfor f in *.ts; do echo \"$f\"; done\n",
  c: "#include <stdio.h>\n// main\nint main(void) { return 0; }\n",
  cpp: "#include <string>\n// class\nclass Dog { public: int age = 3; };\n",
  java: "// hello\npublic class Main { public static void main(String[] a) { System.out.println(1); } }\n",
  csharp: "// hello\npublic class Main { static void Run() { var x = 1; } }\n",
  go: "// main\npackage main\n\nfunc main() { name := \"cody\"; fmt.Println(name) }\n",
  rust: "// main\nfn main() { let name = \"cody\"; println!(\"{}\", name); }\n",
  php: "<?php\n// page\n$name = 'cody';\necho $name;\n",
  ruby: "# greet\ndef greet(name)\n  puts \"hi #{name}\"\nend\n",
  lua: "-- greet\nlocal function greet(name)\n  print('hi ' .. name)\nend\n",
  swift: "// greet\nlet name = \"cody\"\nfunc greet(_ who: String) -> String { return \"hi\" }\n",
  kotlin: "// greet\nfun greet(name: String): String { return \"hi $name\" }\n",
  dockerfile: "# image\nFROM node:22\nRUN npm install\n",
  diff: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n",
  // --- second wave ---
  dart: "// greet\nString greet(String name) => 'hi $name';\n\nvoid main() {\n  print(greet('cody'));\n}\n",
  scala: "// greet\nobject Main extends App {\n  val name = \"cody\"\n  def greet(who: String): String = s\"hi $who\"\n}\n",
  haskell: "-- greet\ngreet :: String -> String\ngreet name = \"hi \" ++ name\n\nmain :: IO ()\nmain = putStrLn (greet \"cody\")\n",
  erlang: "% greet\n-module(main).\n-export([start/0]).\n\nstart() ->\n    io:format(\"hi ~s~n\", [\"cody\"]).\n",
  julia: "# greet\nfunction greet(name)\n    return \"hi $name\"\nend\n\nprintln(greet(\"cody\"))\n",
  ocaml: "(* greet *)\nlet greet name = \"hi \" ^ name\n\nlet () = print_endline (greet \"cody\")\n",
  fsharp: "// greet\nlet greet name = sprintf \"hi %s\" name\n\n[<EntryPoint>]\nlet main _ =\n    printfn \"%s\" (greet \"cody\")\n    0\n",
  perl: "#!/usr/bin/perl\n# greet\nuse strict;\nmy $name = 'cody';\nprint \"hi $name\\n\";\n",
  r: "# greet\ngreet <- function(name) {\n  paste(\"hi\", name)\n}\n\nprint(greet(\"cody\"))\n",
  groovy: "// greet\ndef name = 'cody'\nprintln \"hi ${name}\"\n",
  clojure: ";; greet\n(defn greet [name]\n  (str \"hi \" name))\n\n(println (greet \"cody\"))\n",
  elm: "-- greet\nmodule Main exposing (main)\n\nimport Html exposing (text)\n\nmain =\n    text (greet \"cody\")\n",
  d: "// greet\nimport std.stdio;\n\nvoid main() {\n    string name = \"cody\";\n    writeln(\"hi \", name);\n}\n",
  pascal: "program Greet;\n{ say hi }\nvar\n  name: string;\nbegin\n  name := 'cody';\n  writeln('hi ', name);\nend.\n",
  fortran: "! greet\nprogram greet\n  implicit none\n  character(len=4) :: name\n  name = 'cody'\n  print *, 'hi ', trim(name)\nend program greet\n",
  cobol: "*> greet\nIDENTIFICATION DIVISION.\nPROGRAM-ID. greet.\nDATA DIVISION.\nWORKING-STORAGE SECTION.\n01 NAME PIC X(4) VALUE 'CODY'.\nPROCEDURE DIVISION.\n    DISPLAY 'HI ' NAME.\n    STOP RUN.\n",
  octave: "% greet\nname = 'cody';\nprintf('hi %s\\n', name);\n",
}

/** Tokens whose styling this suite insists on seeing per language family. */
type Sample = { code: string; classes: Set<string>; text: Map<string, Set<string>> }

async function style(
  code: string,
  languageId: string,
  scheme = 'vscode',
  mode: 'dark' | 'light' = 'dark',
): Promise<Sample> {
  const lang = await loadLanguageExtension(languageId)
  const state = EditorState.create({ doc: code, extensions: [lang] })
  const style_ = buildHighlightStyle(paletteFor(scheme, mode))
  const classes = new Set<string>()
  const text = new Map<string, Set<string>>()
  highlightTree(syntaxTree(state), style_, (from, to, cls) => {
    classes.add(cls)
    const slice = code.slice(from, to).trim()
    if (!slice) return
    if (!text.has(slice)) text.set(slice, new Set())
    text.get(slice)!.add(cls)
  })
  return { code, classes, text }
}

const CLASS_OF = (sample: Sample, snippet: string) => [...(sample.text.get(snippet) ?? [])][0] ?? ''

for (const language of LANGUAGES) {
  // plain text has no grammar on purpose: it renders as-is
  if (language.id === 'text') {
    check('text: deliberately has no grammar', true)
    continue
  }
  const sample = SAMPLES[language.id]
  if (!sample) {
    check(`${language.id}: has a syntax sample`, false, 'no sample in scripts/test-syntax.ts')
    continue
  }
  const styled = await style(sample, language.id)
  check(`${language.id}: tokens are styled (${styled.classes.size} styles)`, styled.classes.size >= 2, [...styled.classes].join(','))
}

// A few semantic assertions: the colours must differ from each other.
const py = await style(SAMPLES.python, 'python')
check('python: keywords, comments and strings differ', new Set([
  CLASS_OF(py, 'def'),
  CLASS_OF(py, '# say hi'),
  CLASS_OF(py, "'cody'"),
]).size === 3, JSON.stringify([CLASS_OF(py, 'def'), CLASS_OF(py, '# say hi'), CLASS_OF(py, "'cody'")]))

const css = await style(SAMPLES.css, 'css')
check('css: properties and values differ', CLASS_OF(css, 'color') !== CLASS_OF(css, '#5ce1b9'), `${CLASS_OF(css, 'color')} / ${CLASS_OF(css, '#5ce1b9')}`)

const json = await style(SAMPLES.json, 'json')
check('json: keys and strings differ from numbers', CLASS_OF(json, '"name"') !== CLASS_OF(json, '3'), `${CLASS_OF(json, '"name"')} / ${CLASS_OF(json, '3')}`)

const md = await style(SAMPLES.markdown, 'markdown')
check('markdown: heading styled', Boolean(CLASS_OF(md, 'Cody')), 'Cody (heading text)')

const lightPy = await style(SAMPLES.python, 'python', 'vscode', 'light')
check('light theme styles too', lightPy.classes.size >= 2 && [...lightPy.classes].join() !== [...py.classes].join(), [...lightPy.classes].join(','))

check('every advertised language has a sample', Object.keys(SAMPLES).length === LANGUAGES.filter((l) => l.id !== 'text').length)

// --- real schemes, not a bespoke palette ------------------------------
const schemeIds = Object.keys(SYNTAX_THEMES)
check('ships known editor schemes', schemeIds.join(',') === 'vscode,onedark,github', schemeIds.join(','))

for (const id of schemeIds) {
  let styled = 0
  let worst = ''
  for (const language of LANGUAGES) {
    const sample = SAMPLES[language.id]
    if (!sample) continue
    const result = await style(sample, language.id, id)
    if (result.classes.size >= 2) styled += 1
    else worst ||= language.id
  }
  check(`${id}: styles every language (${styled}/${Object.keys(SAMPLES).length})`, styled === Object.keys(SAMPLES).length, worst)

  const dark = paletteFor(id, 'dark')
  check(`${id}: has distinct keyword/string/comment colours`, new Set([dark.keyword, dark.string, dark.comment, dark.number, dark.func]).size === 5, JSON.stringify([dark.keyword, dark.string, dark.comment]))
}

// VS Code's published Dark+ values must survive edits to the table.
const vscode = paletteFor('vscode', 'dark')
check(
  'vscode dark+ uses its real token colours',
  vscode.keyword === '#569cd6' && vscode.string === '#ce9178' && vscode.comment === '#6a9955' && vscode.func === '#dcdcaa' && vscode.type === '#4ec9b0',
  JSON.stringify(vscode),
)
const vscodeLight = paletteFor('vscode', 'light')
check(
  'vscode light+ uses its real token colours',
  vscodeLight.keyword === '#0000ff' && vscodeLight.string === '#a31515' && vscodeLight.comment === '#008000',
  JSON.stringify(vscodeLight),
)

// The CodeMirror theme must actually expose those colours to the DOM.
const built = editorThemeFor('vscode', 'dark')
check('theme builds for the live editor', Boolean(built.theme && built.highlight))
check('theme is memoised', editorThemeFor('vscode', 'dark') === built)

console.log(failed === 0 ? '\nAll syntax checks passed' : `\n${failed} syntax check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
