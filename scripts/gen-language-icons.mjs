/**
 * Regenerates `src/lib/languageIcons.ts` from Simple Icons.
 *
 * Simple Icons (https://simpleicons.org, CC0 1.0) carries the official
 * monochrome mark and brand colour for each language. We only need the ones listed below,
 * so the shapes are inlined instead of shipping the whole package.
 *
 * Usage: node scripts/gen-language-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import * as icons from 'simple-icons'

const MAP = {
  javascript: 'siJavascript',
  typescript: 'siTypescript',
  tsx: 'siReact',
  jsx: 'siReact',
  html: 'siHtml5',
  css: 'siCss',
  json: 'siJson',
  markdown: 'siMarkdown',
  python: 'siPython',
  sql: 'siSqlite',
  xml: 'siXml',
  yaml: 'siYaml',
  toml: 'siToml',
  shell: 'siGnubash',
  c: 'siC',
  cpp: 'siCplusplus',
  java: 'siOpenjdk',
  csharp: 'siDotnet',
  go: 'siGo',
  rust: 'siRust',
  php: 'siPhp',
  ruby: 'siRuby',
  lua: 'siLua',
  swift: 'siSwift',
  kotlin: 'siKotlin',
  dockerfile: 'siDocker',
  diff: 'siGit',
  // second wave — COBOL and Pascal have no official mark, so they keep the
  // monogram badge rather than an invented logo.
  dart: 'siDart',
  scala: 'siScala',
  haskell: 'siHaskell',
  erlang: 'siErlang',
  julia: 'siJulia',
  ocaml: 'siOcaml',
  fsharp: 'siFsharp',
  perl: 'siPerl',
  r: 'siR',
  groovy: 'siApachegroovy',
  clojure: 'siClojure',
  elm: 'siElm',
  d: 'siD',
  octave: 'siOctave',
  fortran: 'siFortran',
}

/** Relative luminance, so near-black brands can be lifted on the dark theme. */
function luminance(hex) {
  const channels = [0, 2, 4]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const version = JSON.parse(readFileSync('node_modules/simple-icons/package.json', 'utf8')).version

const rows = Object.entries(MAP).map(([id, name]) => {
  const icon = icons[name]
  if (!icon) throw new Error(`simple-icons has no ${name}`)
  return { id, title: icon.title, hex: `#${icon.hex}`, lift: luminance(icon.hex) < 0.09, path: icon.path }
})

const body = rows
  .map(
    (row) => `  ${row.id}: {
    title: '${row.title}',
    hex: '${row.hex}',
    lift: ${row.lift},
    path: '${row.path}',
  },`,
  )
  .join('\n')

const out = `/**
 * Real language marks for Cody's file icons.
 *
 * Shapes and brand colours come from Simple Icons (https://simpleicons.org,
 * CC0 1.0): each entry is the official monochrome mark for the language on a
 * 24x24 grid. Generated from simple-icons@${version} by
 * \`node scripts/gen-language-icons.mjs\` — edit that script, not this file.
 *
 * \`lift\` flags brands that are almost black, so the icon can be mixed toward
 * the theme ink and stay visible on the dark theme. Languages without an entry
 * fall back to the monogram badge.
 */
export type LanguageMark = { title: string; hex: string; lift: boolean; path: string }

export const LANGUAGE_MARKS: Record<string, LanguageMark> = {
${body}
}
`

writeFileSync('src/lib/languageIcons.ts', out)
console.log(`wrote src/lib/languageIcons.ts with ${rows.length} marks (simple-icons@${version})`)
