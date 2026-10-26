import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

type Palette = {
  bg: string
  fg: string
  dim: string
  faint: string
  caret: string
  selection: string
  selectionMatch: string
  activeLine: string
  gutterFg: string
  gutterActive: string
  panel: string
  border: string
  /** The only hue in the editor. Same family as the app accent (mint). */
  key: string
  /** Softer step of the same hue, for strings and markup values. */
  keySoft: string
  /** One muted red, reserved for actual errors. */
  invalid: string
}

/** Two palettes, one hue.
 *
 *  A phone screen is small and a phone editor is read in glances, so the syntax
 *  palette is a neutral ink ramp: brightness and weight carry the structure,
 *  comments recede into italic grey, and a single mint — the same mint as the
 *  app's accent — marks the parts that drive a program (keywords, tags). One
 *  red exists only for invalid code. Nothing else is coloured. */
const DARK: Palette = {
  bg: '#0a0a0b',
  fg: '#dcdcdf',
  dim: '#8f8f97',
  faint: '#61616a',
  caret: '#5ce1b9',
  selection: 'rgba(150, 168, 255, 0.18)',
  selectionMatch: 'rgba(150, 168, 255, 0.1)',
  activeLine: 'rgba(255, 255, 255, 0.04)',
  gutterFg: '#4a4a51',
  gutterActive: '#c8c8cd',
  panel: '#141416',
  border: '#27272b',
  key: '#7ddcb8',
  keySoft: '#a9a9b0',
  invalid: '#e06c6c',
}

const LIGHT: Palette = {
  bg: '#ffffff',
  fg: '#1c1c1f',
  dim: '#5c5c64',
  faint: '#8e8e96',
  caret: '#0f9d76',
  selection: 'rgba(59, 88, 200, 0.16)',
  selectionMatch: 'rgba(59, 88, 200, 0.09)',
  activeLine: '#f6f6f7',
  gutterFg: '#b4b4bb',
  gutterActive: '#3d3d44',
  panel: '#f5f5f6',
  border: '#e4e4e7',
  key: '#0b7a5c',
  keySoft: '#5c5c64',
  invalid: '#b3403f',
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
        backgroundColor: p.bg,
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
        backgroundColor: dark ? '#26262b' : '#eeeeef',
        color: p.fg,
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
        backgroundColor: dark ? 'rgba(255, 255, 255, .14)' : 'rgba(0, 0, 0, .09)',
        outline: `1px solid ${p.faint}`,
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: dark ? 'rgba(125, 220, 184, .28)' : 'rgba(11, 122, 92, .18)',
      },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: dark ? 'rgba(125, 220, 184, .18)' : 'rgba(11, 122, 92, .14)',
        outline: `1px solid ${dark ? 'rgba(125,220,184,.45)' : 'rgba(11,122,92,.4)'}`,
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': { color: p.invalid },
      '.cm-placeholder': { color: p.faint, fontStyle: 'italic' },
      '.cm-selectionBackground': { borderRadius: '1px' },
    },
    { dark },
  )
}

function highlight(p: Palette) {
  return HighlightStyle.define([
    // the one hue: the words that shape the program
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.modifier], color: p.key },
    { tag: [t.tagName, t.angleBracket], color: p.key },
    // strings sit one step softer than keywords — same family, less volume
    { tag: [t.string, t.special(t.string), t.character, t.regexp, t.attributeValue], color: p.keySoft },
    // neutral ink: weight and tone do the work
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.faint, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: p.fg, fontWeight: '600' },
    { tag: [t.typeName, t.className, t.namespace, t.standard(t.name), t.definition(t.name)], color: p.fg, fontWeight: '600' },
    { tag: [t.propertyName, t.attributeName], color: p.dim },
    { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom], color: p.fg },
    { tag: [t.operator, t.operatorKeyword, t.derefOperator], color: p.dim },
    { tag: [t.punctuation, t.bracket, t.separator, t.squareBracket, t.paren, t.brace], color: p.faint },
    { tag: [t.meta, t.annotation, t.processingInstruction], color: p.faint },
    { tag: [t.variableName, t.name], color: p.fg },
    { tag: [t.heading, t.heading1, t.heading2, t.strong], color: p.fg, fontWeight: '700' },
    { tag: [t.link, t.url], color: p.fg, textDecoration: 'underline' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strikethrough], textDecoration: 'line-through' },
    { tag: [t.escape], color: p.keySoft },
    { tag: [t.invalid], color: p.invalid },
  ])
}

export const codyDarkTheme = theme(DARK, true)
export const codyLightTheme = theme(LIGHT, false)
export const codyHighlightDark = syntaxHighlighting(highlight(DARK))
export const codyHighlightLight = syntaxHighlighting(highlight(LIGHT))
