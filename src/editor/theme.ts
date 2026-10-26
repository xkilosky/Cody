import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

type Palette = {
  bg: string
  fg: string
  caret: string
  selection: string
  selectionMatch: string
  activeLine: string
  gutterFg: string
  gutterActive: string
  gutterBg: string
  panel: string
  border: string
  keyword: string
  string: string
  number: string
  comment: string
  func: string
  type: string
  property: string
  tag: string
  attr: string
  operator: string
  invalid: string
  heading: string
}

/** Editor palettes modelled on the syntax colors phone editors ship (Spck/Acode),
 *  but with tighter punctuation and a calmer gutter so dense code stays readable. */
const DARK: Palette = {
  bg: '#0c0f14',
  fg: '#dfe6f1',
  caret: '#5ce1b9',
  selection: 'rgba(78, 128, 255, 0.28)',
  selectionMatch: 'rgba(78, 128, 255, 0.16)',
  activeLine: 'rgba(255, 255, 255, 0.035)',
  gutterFg: '#3d4a5e',
  gutterActive: '#8fa8c8',
  gutterBg: '#0c0f14',
  panel: '#131924',
  border: '#232c3a',
  keyword: '#c9a6ff',
  string: '#9be8b4',
  number: '#ffc37d',
  comment: '#5b6b83',
  func: '#7dc4ff',
  type: '#7ce0d3',
  property: '#c5d3ea',
  tag: '#ff8fa3',
  attr: '#ffd166',
  operator: '#93a4bd',
  invalid: '#ff6b6b',
  heading: '#7dc4ff',
}

const LIGHT: Palette = {
  bg: '#ffffff',
  fg: '#1a2230',
  caret: '#0f9d76',
  selection: 'rgba(59, 130, 246, 0.2)',
  selectionMatch: 'rgba(59, 130, 246, 0.12)',
  activeLine: '#f4f7fc',
  gutterFg: '#a9b4c6',
  gutterActive: '#4b5a70',
  gutterBg: '#ffffff',
  panel: '#f4f6fa',
  border: '#e3e8f0',
  keyword: '#8250df',
  string: '#0a7d4f',
  number: '#b4530a',
  comment: '#94a3b8',
  func: '#1e63c8',
  type: '#0b7285',
  property: '#334155',
  tag: '#c2185b',
  attr: '#9a6700',
  operator: '#64748b',
  invalid: '#dc2626',
  heading: '#1e63c8',
}

function theme(p: Palette, dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        color: p.fg,
        backgroundColor: p.bg,
        height: '100%',
        fontSize: 'inherit',
      },
      '.cm-scroller': {
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        fontFamily: 'var(--mono)',
      },
      '.cm-content': {
        caretColor: p.caret,
        padding: '8px 0 45vh 0',
        lineHeight: '1.62',
      },
      '.cm-line': { padding: '0 14px 0 6px' },
      '&.cm-focused': { outline: 'none' },
      // caret + selection
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: p.caret,
        borderLeftWidth: '2px',
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: p.selection },
      '.cm-selectionMatch': { backgroundColor: p.selectionMatch },
      '.cm-activeLine': { backgroundColor: p.activeLine },
      // gutter: quiet until the active line
      '.cm-gutters': {
        backgroundColor: p.gutterBg,
        color: p.gutterFg,
        border: 'none',
        paddingLeft: '2px',
        fontVariantNumeric: 'tabular-nums',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 6px',
        minWidth: '22px',
        fontSize: '0.82em',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: p.gutterActive,
        fontWeight: '600',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: p.panel,
        border: `1px solid ${p.border}`,
        color: p.gutterFg,
      },
      // autocomplete + tooltips
      '.cm-tooltip': {
        backgroundColor: p.panel,
        border: `1px solid ${p.border}`,
        borderRadius: '12px',
        color: p.fg,
        overflow: 'hidden',
        boxShadow: '0 12px 30px rgba(0,0,0,.4)',
      },
      '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '12.5px' },
      '.cm-tooltip-autocomplete > ul > li': { padding: '7px 10px' },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: dark ? '#243352' : '#dbeafe',
        color: dark ? '#fff' : '#0f172a',
      },
      '.cm-panels': { backgroundColor: p.panel, color: p.fg },
      '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${p.border}` },
      '.cm-panel.cm-search': {
        padding: '8px 10px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'center',
      },
      '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
        fontSize: '12px',
        borderRadius: '8px',
        fontFamily: 'var(--mono)',
      },
      '.cm-panel.cm-search input': {
        border: `1px solid ${p.border}`,
        backgroundColor: p.bg,
        color: p.fg,
        padding: '7px 9px',
        minWidth: '0',
        flex: '1 1 120px',
      },
      '.cm-panel.cm-search button': {
        border: `1px solid ${p.border}`,
        backgroundColor: p.panel,
        color: p.fg,
        padding: '7px 10px',
      },
      '.cm-panel.cm-search label': { color: p.gutterFg, fontSize: '11px' },
      '.cm-searchMatch': {
        backgroundColor: dark ? 'rgba(255, 209, 102, .3)' : 'rgba(250, 204, 21, .35)',
        outline: `1px solid ${dark ? 'rgba(255,209,102,.45)' : 'rgba(202,138,4,.4)'}`,
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: dark ? 'rgba(255, 209, 102, .55)' : 'rgba(250, 204, 21, .65)',
      },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: dark ? 'rgba(124, 196, 255, .18)' : 'rgba(59, 130, 246, .16)',
        outline: `1px solid ${dark ? 'rgba(124,196,255,.45)' : 'rgba(59,130,246,.45)'}`,
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': { color: p.invalid },
      '.cm-placeholder': { color: p.gutterFg, fontStyle: 'italic' },
      '.cm-selectionBackground': { borderRadius: '1px' },
    },
    { dark },
  )
}

function highlight(p: Palette) {
  return HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: p.keyword },
    { tag: [t.string, t.special(t.string), t.regexp, t.character], color: p.string },
    { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: p.number },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: p.func },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.name)], color: p.type },
    { tag: [t.propertyName, t.attributeValue], color: p.property },
    { tag: [t.tagName], color: p.tag },
    { tag: [t.attributeName], color: p.attr },
    { tag: [t.operator, t.operatorKeyword, t.derefOperator], color: p.operator },
    { tag: [t.punctuation, t.bracket, t.separator, t.squareBracket, t.paren, t.brace], color: p.operator },
    { tag: [t.meta, t.annotation, t.processingInstruction], color: p.comment },
    { tag: [t.definition(t.name), t.variableName, t.name], color: p.fg },
    { tag: [t.heading, t.heading1, t.heading2], color: p.heading, fontWeight: '700' },
    { tag: [t.link, t.url], color: p.func, textDecoration: 'underline' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.strikethrough], textDecoration: 'line-through' },
    { tag: [t.invalid], color: p.invalid },
    { tag: [t.escape], color: p.number },
  ])
}

export const codyDarkTheme = theme(DARK, true)
export const codyLightTheme = theme(LIGHT, false)
export const codyHighlightDark = syntaxHighlighting(highlight(DARK))
export const codyHighlightLight = syntaxHighlighting(highlight(LIGHT))
