/**
 * Real syntax colour schemes.
 *
 * These are the palettes of editors you already read every day — VS Code's
 * Dark+/Light+, One Dark, and GitHub's themes — with their published token
 * colours. Nothing here is invented: `keywords` are the same blue VS Code uses
 * for keywords, comments the same green, and so on for every one of the 27
 * languages Cody edits, because each theme is a token mapping rather than a
 * per-language table.
 */
export type TokenRole =
  | 'keyword'
  | 'control'
  | 'string'
  | 'number'
  | 'func'
  | 'type'
  | 'variable'
  | 'property'
  | 'tag'
  | 'attr'
  | 'operator'
  | 'punctuation'
  | 'comment'
  | 'regexp'
  | 'escape'
  | 'invalid'
  | 'warning'
  | 'meta'
  | 'heading'
  | 'link'

export type Palette = {
  /** Chrome */
  bg: string
  fg: string
  selection: string
  activeLine: string
  gutter: string
  gutterActive: string
  panel: string
  border: string
} & Record<TokenRole, string>

export type SyntaxTheme = {
  label: string
  credit: string
  dark: Palette
  light: Palette
}

const VSCODE_DARK: Palette = {
  bg: '#1e1e1e',
  fg: '#d4d4d4',
  selection: '#264f78',
  activeLine: 'rgba(255, 255, 255, 0.045)',
  gutter: '#858585',
  gutterActive: '#c6c6c6',
  panel: '#252526',
  border: '#3c3c3c',
  keyword: '#569cd6',
  control: '#c586c0',
  string: '#ce9178',
  number: '#b5cea8',
  func: '#dcdcaa',
  type: '#4ec9b0',
  variable: '#9cdcfe',
  property: '#9cdcfe',
  tag: '#569cd6',
  attr: '#9cdcfe',
  operator: '#d4d4d4',
  punctuation: '#d4d4d4',
  comment: '#6a9955',
  regexp: '#d16969',
  escape: '#d7ba7d',
  invalid: '#f44747',
  warning: '#cca700',
  meta: '#569cd6',
  heading: '#569cd6',
  link: '#3794ff',
}

const VSCODE_LIGHT: Palette = {
  bg: '#ffffff',
  fg: '#000000',
  selection: '#add6ff',
  activeLine: 'rgba(0, 0, 0, 0.04)',
  gutter: '#237893',
  gutterActive: '#0b216f',
  panel: '#f3f3f3',
  border: '#e5e5e5',
  keyword: '#0000ff',
  control: '#af00db',
  string: '#a31515',
  number: '#098658',
  func: '#795e26',
  type: '#267f99',
  variable: '#001080',
  property: '#001080',
  tag: '#800000',
  attr: '#e50000',
  operator: '#000000',
  punctuation: '#000000',
  comment: '#008000',
  regexp: '#811f3f',
  escape: '#ee0000',
  invalid: '#cd3131',
  warning: '#bf8803',
  meta: '#0000ff',
  heading: '#800000',
  link: '#006ab1',
}

const ONE_DARK: Palette = {
  bg: '#282c34',
  fg: '#abb2bf',
  selection: '#3e4451',
  activeLine: 'rgba(255, 255, 255, 0.045)',
  gutter: '#4b5263',
  gutterActive: '#abb2bf',
  panel: '#21252b',
  border: '#3a3f4b',
  keyword: '#c678dd',
  control: '#c678dd',
  string: '#98c379',
  number: '#d19a66',
  func: '#61afef',
  type: '#e5c07b',
  variable: '#e06c75',
  property: '#e06c75',
  tag: '#e06c75',
  attr: '#d19a66',
  operator: '#56b6c2',
  punctuation: '#abb2bf',
  comment: '#7f848e',
  regexp: '#98c379',
  escape: '#56b6c2',
  invalid: '#e06c75',
  warning: '#e5c07b',
  meta: '#c678dd',
  heading: '#e06c75',
  link: '#61afef',
}

const ONE_LIGHT: Palette = {
  bg: '#fafafa',
  fg: '#383a42',
  selection: '#e5e5e6',
  activeLine: 'rgba(0, 0, 0, 0.035)',
  gutter: '#9d9d9f',
  gutterActive: '#383a42',
  panel: '#f0f0f1',
  border: '#e5e5e6',
  keyword: '#a626a4',
  control: '#a626a4',
  string: '#50a14f',
  number: '#986801',
  func: '#4078f2',
  type: '#c18401',
  variable: '#e45649',
  property: '#e45649',
  tag: '#e45649',
  attr: '#986801',
  operator: '#0184bc',
  punctuation: '#383a42',
  comment: '#a0a1a7',
  regexp: '#50a14f',
  escape: '#0184bc',
  invalid: '#e45649',
  warning: '#c18401',
  meta: '#a626a4',
  heading: '#e45649',
  link: '#4078f2',
}

const GITHUB_DARK: Palette = {
  bg: '#0d1117',
  fg: '#c9d1d9',
  selection: '#264f78',
  activeLine: 'rgba(255, 255, 255, 0.04)',
  gutter: '#484f58',
  gutterActive: '#c9d1d9',
  panel: '#161b22',
  border: '#30363d',
  keyword: '#ff7b72',
  control: '#ff7b72',
  string: '#a5d6ff',
  number: '#79c0ff',
  func: '#d2a8ff',
  type: '#ffa657',
  variable: '#79c0ff',
  property: '#79c0ff',
  tag: '#7ee787',
  attr: '#79c0ff',
  operator: '#ff7b72',
  punctuation: '#c9d1d9',
  comment: '#8b949e',
  regexp: '#a5d6ff',
  escape: '#79c0ff',
  invalid: '#ffa198',
  warning: '#d29922',
  meta: '#ff7b72',
  heading: '#1f6feb',
  link: '#58a6ff',
}

const GITHUB_LIGHT: Palette = {
  bg: '#ffffff',
  fg: '#24292f',
  selection: '#b6d7ff',
  activeLine: 'rgba(0, 0, 0, 0.035)',
  gutter: '#8c959f',
  gutterActive: '#24292f',
  panel: '#f6f8fa',
  border: '#d0d7de',
  keyword: '#cf222e',
  control: '#cf222e',
  string: '#0a3069',
  number: '#0550ae',
  func: '#8250df',
  type: '#953800',
  variable: '#0550ae',
  property: '#0550ae',
  tag: '#116329',
  attr: '#0550ae',
  operator: '#cf222e',
  punctuation: '#24292f',
  comment: '#6e7781',
  regexp: '#0a3069',
  escape: '#0550ae',
  invalid: '#cf222e',
  warning: '#9a6700',
  meta: '#cf222e',
  heading: '#0550ae',
  link: '#0969da',
}

export const SYNTAX_THEMES: Record<string, SyntaxTheme> = {
  vscode: { label: 'VS Code', credit: 'Dark+ / Light+', dark: VSCODE_DARK, light: VSCODE_LIGHT },
  onedark: { label: 'One Dark', credit: 'One Dark Pro', dark: ONE_DARK, light: ONE_LIGHT },
  github: { label: 'GitHub', credit: 'GitHub Dark / Light', dark: GITHUB_DARK, light: GITHUB_LIGHT },
}

export type SyntaxThemeId = keyof typeof SYNTAX_THEMES

export const DEFAULT_SYNTAX_THEME: SyntaxThemeId = 'vscode'

export function syntaxTheme(id: string): SyntaxTheme {
  return SYNTAX_THEMES[id] ?? SYNTAX_THEMES[DEFAULT_SYNTAX_THEME]
}

export function paletteFor(id: string, mode: 'dark' | 'light'): Palette {
  return syntaxTheme(id)[mode]
}
