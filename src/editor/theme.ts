import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

function palette(dark: boolean) {
  return {
    bg: dark ? '#0d1015' : '#ffffff',
    fg: dark ? '#dbe2ec' : '#1b2230',
    caret: dark ? '#7c9cff' : '#3b5bdb',
    selection: dark ? '#2b3b63' : '#cfe0ff',
    activeLine: dark ? '#151a22' : '#f5f7fb',
    gutterFg: dark ? '#43506a' : '#9aa4b8',
    gutterBg: dark ? '#0d1015' : '#ffffff',
    panel: dark ? '#131822' : '#f3f5f9',
    border: dark ? '#232b38' : '#e3e7ef',
    keyword: dark ? '#c792ea' : '#a626a4',
    string: dark ? '#93e6a9' : '#2f7d32',
    number: dark ? '#f5b778' : '#986801',
    comment: dark ? '#5c6b82' : '#94a3b8',
    func: dark ? '#7cc7ff' : '#1e6fd9',
    type: dark ? '#7ce0d3' : '#0f766e',
    property: dark ? '#9db4ff' : '#4b5563',
    tag: dark ? '#ff8fa3' : '#c2185b',
    operator: dark ? '#8fa3bf' : '#64748b',
    invalid: dark ? '#ff6b6b' : '#dc2626',
  }
}

export const codyDarkTheme = EditorView.theme(
  {
    '&': { color: palette(true).fg, backgroundColor: palette(true).bg, height: '100%' },
    '.cm-scroller': { overflow: 'auto', WebkitOverflowScrolling: 'touch' },
    '.cm-content': { caretColor: palette(true).caret, padding: '10px 0 40vh 0' },
    '.cm-line': { padding: '0 12px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
      { backgroundColor: palette(true).selection, opacity: 0.75 },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette(true).caret, borderLeftWidth: '2px' },
    '.cm-activeLine': { backgroundColor: palette(true).activeLine },
    '.cm-gutters': {
      backgroundColor: palette(true).gutterBg,
      color: palette(true).gutterFg,
      border: 'none',
      paddingLeft: '4px',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: palette(true).fg },
    '.cm-foldPlaceholder': { backgroundColor: palette(true).panel, border: 'none', color: palette(true).gutterFg },
    '.cm-tooltip': {
      backgroundColor: palette(true).panel,
      border: `1px solid ${palette(true).border}`,
      borderRadius: '10px',
      color: palette(true).fg,
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#25304a', color: '#fff' },
    '.cm-panels': { backgroundColor: palette(true).panel, color: palette(true).fg },
    '.cm-panel.cm-search': { padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      fontSize: '12px',
      borderRadius: '6px',
      border: `1px solid ${palette(true).border}`,
      backgroundColor: '#0d1015',
      color: palette(true).fg,
      padding: '6px 8px',
    },
    '.cm-panel.cm-search label': { fontSize: '11px', color: palette(true).gutterFg },
    '.cm-searchMatch': { backgroundColor: 'rgba(255, 209, 102, .35)', outline: '1px solid rgba(255,209,102,.5)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255, 209, 102, .6)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(124, 199, 255, .22)',
      outline: '1px solid rgba(124,199,255,.4)',
    },
    '.cm-placeholder': { color: palette(true).gutterFg },
  },
  { dark: true },
)

export const codyLightTheme = EditorView.theme(
  {
    '&': { color: palette(false).fg, backgroundColor: palette(false).bg, height: '100%' },
    '.cm-scroller': { overflow: 'auto', WebkitOverflowScrolling: 'touch' },
    '.cm-content': { caretColor: palette(false).caret, padding: '10px 0 40vh 0' },
    '.cm-line': { padding: '0 12px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
      { backgroundColor: palette(false).selection },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette(false).caret, borderLeftWidth: '2px' },
    '.cm-activeLine': { backgroundColor: palette(false).activeLine },
    '.cm-gutters': {
      backgroundColor: palette(false).gutterBg,
      color: palette(false).gutterFg,
      border: 'none',
      paddingLeft: '4px',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: palette(false).fg },
    '.cm-tooltip': {
      backgroundColor: palette(false).panel,
      border: `1px solid ${palette(false).border}`,
      borderRadius: '10px',
      color: palette(false).fg,
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#dbeafe', color: '#0f172a' },
    '.cm-panels': { backgroundColor: palette(false).panel, color: palette(false).fg },
    '.cm-panel.cm-search': { padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      fontSize: '12px',
      borderRadius: '6px',
      border: `1px solid ${palette(false).border}`,
      backgroundColor: '#fff',
      color: palette(false).fg,
      padding: '6px 8px',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(250, 204, 21, .35)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(59, 130, 246, .18)' },
    '.cm-placeholder': { color: palette(false).gutterFg },
  },
  { dark: false },
)

function makeHighlight(dark: boolean) {
  const p = palette(dark)
  return HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: p.keyword },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: p.fg },
    { tag: [t.propertyName], color: p.property },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: p.func },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: p.number },
    { tag: [t.definition(t.name), t.separator], color: p.fg },
    { tag: [t.typeName, t.className, t.namespace], color: p.type },
    { tag: [t.number, t.integer, t.float, t.bool, t.null], color: p.number },
    { tag: [t.operator, t.operatorKeyword, t.punctuation], color: p.operator },
    { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
    { tag: [t.meta, t.annotation, t.processingInstruction], color: p.comment },
    { tag: [t.comment, t.lineComment, t.blockComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.tagName], color: p.tag },
    { tag: [t.attributeName], color: p.type },
    { tag: [t.heading], color: p.func, fontWeight: '600' },
    { tag: [t.link, t.url], color: p.func, textDecoration: 'underline' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.invalid], color: p.invalid },
    { tag: [t.variableName], color: p.fg },
  ])
}

export const codyHighlightDark = syntaxHighlighting(makeHighlight(true))
export const codyHighlightLight = syntaxHighlighting(makeHighlight(false))
