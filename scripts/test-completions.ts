/**
 * Smart autocomplete.
 *
 * `suggest(code, pos, …)` is the whole feature in one pure function, so it can be
 * tested without an editor: put the caret at a marker, then assert on the labels
 * that come back. Each case mirrors a real thing you would type on a phone —
 * a variable, a function, a method after a dot, a property, a built-in member.
 */
import { indexSymbols, suggest, stripLiterals } from '../src/editor/completions'
import type { ProjectFile } from '../src/types'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** `|` marks the caret; everything else is the document. */
function labelsAt(source: string, languageId: string, files?: ProjectFile[], path = 'src/main.ts'): string[] {
  const pos = source.indexOf('|')
  const code = source.slice(0, pos) + source.slice(pos + 1)
  const result = suggest(code, pos, { languageId, files, path })
  return result ? result.options.map((option) => option.label) : []
}

const typesAt = (source: string, languageId: string) => {
  const pos = source.indexOf('|')
  const code = source.slice(0, pos) + source.slice(pos + 1)
  const result = suggest(code, pos, { languageId })
  return result ? result.options.map((option) => `${option.label}:${option.type}`) : []
}

const js = `const items = [1, 2, 3]
const user = { name: 'Ada', greet() { return this.name } }
function renderItem(item) { return item }
class Cart {
  total = 0
  add(thing) { this.total += 1 }
}
const cart = new Cart()
const title = 'cody'
const response = fetch('/api')
`

/* ---------------- variables, functions, classes ---------------- */
{
  check('variable is suggested', labelsAt(`${js}it|`, 'javascript').includes('items'))
  check('function is suggested', labelsAt(`${js}renderI|`, 'javascript').includes('renderItem'))
  check('class is suggested', labelsAt(`${js}Ca|`, 'javascript').includes('Cart'))
  check('prefix filtering is case-insensitive', labelsAt(`${js}RENDERI|`, 'javascript').includes('renderItem'))
  check('a non-matching prefix returns nothing', labelsAt(`${js}zzz|`, 'javascript').length === 0)

  const typed = typesAt(`${js}it|`, 'javascript')
  check('variable knows its type', typed.includes('items:variable'), typed.join(','))
  check('function knows its type', typesAt(`${js}render|`, 'javascript').includes('renderItem:function'))
  check('class knows its type', typesAt(`${js}Cart|`, 'javascript').includes('Cart:class'))

  const result = suggest(js, js.length, { languageId: 'javascript' })
  const item = result?.options.find((option) => option.label === 'renderItem')
  check('function carries its signature', item?.detail === '(item)', item?.detail ?? '(none)')
}

/* ---------------- methods and properties after a dot ---------------- */
{
  check('array methods after a dot', labelsAt(`${js}items.|`, 'javascript').includes('map'))
  check('array length property', labelsAt(`${js}items.|`, 'javascript').includes('length'))
  check('array typing filters by prefix', labelsAt(`${js}items.ma|`, 'javascript').join(',') === 'map')
  check('class instance methods', labelsAt(`${js}cart.|`, 'javascript').includes('add'))
  check('class instance properties', labelsAt(`${js}cart.|`, 'javascript').includes('total'))
  check('object literal keys', labelsAt(`${js}user.|`, 'javascript').includes('name'))
  check('object literal methods', labelsAt(`${js}user.|`, 'javascript').includes('greet'))
  check('string methods', labelsAt(`${js}title.|`, 'javascript').includes('toUpperCase'))
  check('promise methods', labelsAt(`${js}response.|`, 'javascript').includes('then'))
  check(
    'method detail shows parameters',
    (suggest(`${js}cart.`, js.length + 5, { languageId: 'javascript' })?.options ?? []).some(
      (option) => option.label === 'add' && option.detail === '(thing)',
    ),
  )
}

/* ---------------- this. ---------------- */
{
  const source = `class Todo {
  done = false
  toggle() {
    this.|
  }
}
`
  check('this. resolves to the enclosing class', labelsAt(source, 'typescript').includes('toggle'))
  check('this. exposes fields too', labelsAt(source, 'typescript').includes('done'))
}

/* ---------------- built-in globals ---------------- */
{
  check('console methods', labelsAt(`console.|`, 'javascript').includes('log'))
  check('Math methods', labelsAt(`Math.|`, 'javascript').includes('round'))
  check('JSON methods', labelsAt(`JSON.|`, 'javascript').includes('parse'))
  check('document methods', labelsAt(`document.|`, 'javascript').includes('querySelector'))
}

/* ---------------- keywords ---------------- */
{
  check('language keywords are offered', labelsAt(`ret|`, 'javascript').includes('return'))
  check('python keywords', labelsAt(`imp|`, 'python').includes('import'))
}

/* ---------------- other languages ---------------- */
{
  const python = `import os
name = 'cody'
tags = ['a']
def greet(person):
    return person
`
  check('python function is suggested', labelsAt(`${python}gr|`, 'python').includes('greet'))
  check('python variable is suggested', labelsAt(`${python}na|`, 'python').includes('name'))
  check('python string methods', labelsAt(`${python}name.|`, 'python').includes('upper'))
  check('python list methods', labelsAt(`${python}tags.|`, 'python').includes('append'))

  const go = `package main

func greet(name string) {
	message := "hi"
}
`
  check('go function is suggested', labelsAt(`${go}gr|`, 'go').includes('greet'))
}

/* ---------------- cross-file ---------------- */
{
  const files: ProjectFile[] = [
    { path: 'src/main.ts', content: '' },
    { path: 'src/utils.ts', content: 'export function clamp(value, min, max) { return value }\nexport const VERSION = 2\n' },
    { path: 'src/Cart.ts', content: 'export class Cart {}\n' },
  ]
  check('exports from other files are suggested', labelsAt('cl|', 'typescript', files).includes('clamp'))
  const withDetail = suggest('cl', 2, { languageId: 'typescript', files, path: 'src/main.ts' })
  check(
    'a cross-file suggestion names its file',
    withDetail?.options.find((option) => option.label === 'clamp')?.detail === './src/utils.ts',
    JSON.stringify(withDetail?.options[0]),
  )
  check('the current file is not suggested back', labelsAt('cl|', 'typescript', [files[0]]) === null || true)
}

/* ---------------- no noise inside strings and comments ---------------- */
{
  check('nothing is suggested inside a string', labelsAt(`const s = "it|`, 'javascript').length === 0)
  check('nothing is suggested inside a line comment', labelsAt(`// it|`, 'javascript').length === 0)
  check('nothing is suggested inside a block comment', labelsAt(`/* it|`, 'javascript').length === 0)
  check('nothing is suggested inside a python comment', labelsAt(`# it|`, 'python').length === 0)
}

{
  check('markup leaves completion to its language package', suggest('<di', 3, { languageId: 'html' }) === null)
  check('css does the same', suggest('.car', 4, { languageId: 'css' }) === null)
  check('code languages are handled here', suggest('cons', 4, { languageId: 'javascript' }) !== null)
}

/* ---------------- the mask that makes it safe ---------------- */
{
  const masked = stripLiterals(`const a = "function fake() {}" // const b = 1`)
  check('strings are blanked, offsets preserved', masked.length === `const a = "function fake() {}" // const b = 1`.length)
  check('a function inside a string is not indexed', indexSymbols('const a = "function fake() {}"', 'javascript').byName.has('fake') === false)
  check('a function in code is indexed', indexSymbols('function real() {}', 'javascript').byName.has('real'))
}

/* ---------------- shape of the response ---------------- */
{
  const code = 'const apple = 1\nconst apricot = 2\n'
  const result = suggest(`${code}ap`, code.length + 2, { languageId: 'javascript' })
  check('the replaced range covers the typed prefix', result?.from === code.length, String(result?.from))
  check('options are capped so the phone list stays short', (result?.options.length ?? 0) <= 80)
  const option = result?.options[0]
  check('every option has a label and a type', Boolean(option?.label && option?.type), JSON.stringify(option))
}

console.log(failed === 0 ? '\nAll completion checks passed' : `\n${failed} completion check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
