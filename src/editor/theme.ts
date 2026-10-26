import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'
import { paletteFor, type Palette } from './syntaxThemes'

/** Builds the CodeMirror theme + highlight style for one real editor scheme.
 *
 *  The token mapping is deliberately semantic, so it colours *all* languages:
 *  whatever grammar is loaded (Lezer for JS/TS/Python/HTML/CSS/JSON/Markdown/
 *  SQL/XML/Java/C++/Go/Rust/PHP, stream parsers for the rest) emits the same
 *  standard tags, and each tag lands on the same colour that editor would use. */
function highlightStyle(p: Palette) {
  return HighlightStyle.define([
    // keywords & control flow
    {
      tag: [t.keyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self, t.standard(t.name)],
      color: p.keyword,
    },
    {
      tag: [t.controlKeyword, t.controlOperator, t.definitionOperator, t.updateOperator],
      color: p.control,
    },
    // literals
    { tag: [t.string, t.special(t.string), t.character, t.docString], color: p.string },
    { tag: [t.regexp], color: p.regexp },
    {
      tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.name), t.literal, t.unit],
      color: p.number,
    },
    { tag: [t.escape], color: p.escape },
    // names
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName, t.macroName], color: p.func },
    { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: p.type },
    { tag: [t.propertyName], color: p.property },
    { tag: [t.variableName, t.definition(t.variableName), t.local(t.variableName), t.name], color: p.variable },
    // markup
    { tag: [t.tagName, t.angleBracket], color: p.tag },
    { tag: [t.attributeName], color: p.attr },
    { tag: [t.attributeValue], color: p.string },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4], color: p.heading, fontWeight: '700' },
    { tag: [t.link, t.url], color: p.link, textDecoration: 'underline' },
    { tag: [t.monospace], color: p.string },
    { tag: [t.list], color: p.keyword },
    // structural
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.operator, t.operatorKeyword, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.bitwiseOperator, t.compareOperator], color: p.operator },
    {
      tag: [t.punctuation, t.bracket, t.separator, t.squareBracket, t.paren, t.brace],
      color: p.punctuation,
    },
    { tag: [t.meta, t.annotation, t.processingInstruction, t.documentMeta], color: p.meta },
    // state
    { tag: [t.invalid], color: p.invalid },
    { tag: [t.deleted], color: p.invalid },
    { tag: [t.inserted, t.changed], color: p.string },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strikethrough], textDecoration: 'line-through' },
  ])
}

function editorTheme(p: Palette, dark: boolean) {
  return EditorView.theme(
    {
      '&': { color: p.fg, backgroundColor: p.bg, height: '100%', fontSize: 'inherit' },
      '.cm-scroller': {
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        fontFamily: 'var(--mono)',
      },
      '.cm-content': { caretColor: p.fg, padding: '8px 0 45vh 0', lineHeight: '1.62' },
      '.cm-line': { padding: '0 14px 0 6px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.fg, borderLeftWidth: '2px' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: p.selection },
      '.cm-selectionMatch': { backgroundColor: p.selection, opacity: '0.55' },
      '.cm-activeLine': { backgroundColor: p.activeLine },
      '.cm-gutters': {
        backgroundColor: p.bg,
        color: p.gutter,
        border: 'none',
        paddingLeft: '2px',
        fontVariantNumeric: 'tabular-nums',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 6px', minWidth: '22px', fontSize: '0.82em' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: p.gutterActive, fontWeight: '600' },
      '.cm-foldPlaceholder': { backgroundColor: p.panel, border: `1px solid ${p.border}`, color: p.gutter },
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
        backgroundColor: p.selection,
        color: p.fg,
      },
      '.cm-panels': { backgroundColor: p.panel, color: p.fg },
      '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${p.border}` },
      '.cm-panel.cm-search': { padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
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
      '.cm-panel.cm-search label': { color: p.gutter, fontSize: '11px' },
      '.cm-searchMatch': { backgroundColor: `${p.link}44`, outline: `1px solid ${p.link}88`, borderRadius: '2px' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: `${p.link}77` },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: `${p.link}33`,
        outline: `1px solid ${p.link}aa`,
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': { color: p.invalid },
      '.cm-placeholder': { color: p.gutter, fontStyle: 'italic' },
      '.cm-selectionBackground': { borderRadius: '1px' },
      // diagnostics: wavy underline in the text, a dot in the gutter
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${p.invalid}`,
        textUnderlineOffset: '3px',
      },
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: `underline wavy ${p.warning}`,
        textUnderlineOffset: '3px',
      },
      '.cm-gutter-lint': { width: '1.1em' },
      '.cm-lint-marker-error, .cm-lint-marker-warning': { width: '0.7em', height: '0.7em' },
      '.cm-tooltip-lint': { padding: '0', margin: '0' },
      '.cm-diagnostic': {
        padding: '7px 10px',
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        borderLeft: '3px solid transparent',
      },
      '.cm-diagnostic-error': { borderLeftColor: p.invalid },
      '.cm-diagnostic-warning': { borderLeftColor: p.warning },
      '.cm-diagnostic-source': { opacity: '0.7' },
    },
    { dark },
  )
}

export type EditorTheme = { theme: Extension; highlight: Extension }

const cache = new Map<string, EditorTheme>()

/** Memoised theme + highlight pair for a real syntax scheme. */
export function editorThemeFor(syntaxThemeId: string, mode: 'dark' | 'light'): EditorTheme {
  const key = `${syntaxThemeId}:${mode}`
  const hit = cache.get(key)
  if (hit) return hit
  const palette = paletteFor(syntaxThemeId, mode)
  const built: EditorTheme = {
    theme: editorTheme(palette, mode === 'dark'),
    highlight: syntaxHighlighting(highlightStyle(palette)),
  }
  cache.set(key, built)
  return built
}

export { highlightStyle as buildHighlightStyle, editorTheme as buildEditorTheme }
