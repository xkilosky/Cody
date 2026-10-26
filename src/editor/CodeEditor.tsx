import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  placeholder as cmPlaceholder,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
  indentMore,
  indentLess,
  copyLineDown,
  moveLineUp,
  moveLineDown,
  deleteLine,
  selectLine,
  redo as redoCommand,
  undo as undoCommand,
} from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { searchKeymap, openSearchPanel } from '@codemirror/search'
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { editorThemeFor } from './theme'
import { createCompletionSource, type CompletionOptions } from './completions'
import { languageForPath, loadLanguageExtension } from '../lib/languages'
import type { Diagnostic } from '../lib/diagnostics'
import type { ProjectFile } from '../types'
import type { Settings } from '../types'

export type CursorInfo = {
  line: number
  column: number
  lines: number
  selected: number
}

export type CodyEditorHandle = {
  cursor: () => CursorInfo
  focus: () => void
  insert: (text: string) => void
  wrapSelection: (before: string, after?: string) => void
  toggleComment: () => void
  indent: () => void
  outdent: () => void
  undo: () => void
  redo: () => void
  openSearch: () => void
  scrollToTop: () => void
  /** Jump to a 1-based line/column, e.g. from the problems list. */
  goto: (line: number, column?: number) => void
  /** Open the suggestion list (the rail has no Ctrl-Space on a phone). */
  complete: () => void
  getView: () => EditorView | null
}

type Props = {
  value: string
  path: string
  settings: Settings
  onChange: (value: string) => void
  onSave?: () => void
  onRun?: () => void
  readOnly?: boolean
  onReady?: (handle: CodyEditorHandle) => void
  onDestroy?: () => void
  onCursor?: (info: CursorInfo) => void
  onDirty?: () => void
  /** Returns the file's problems; used to draw squiggles and gutter markers. */
  lint?: (content: string) => Diagnostic[]
  /** Other files in the project, so exports can be suggested by name. */
  projectFiles?: ProjectFile[]
}

function readCursor(view: EditorView): CursorInfo {
  const { state } = view
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const sel = state.selection.ranges.reduce((sum, range) => sum + (range.to - range.from), 0)
  return {
    line: line.number,
    column: head - line.from + 1,
    lines: state.doc.lines,
    selected: sel,
  }
}

function baseExtensions(settings: Settings): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, maxRenderedOptions: 12 }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ]
}

function settingsExtensions(settings: Settings): Extension {
  const { theme, highlight } = editorThemeFor(settings.syntaxTheme, settings.theme)
  const font = settings.fontFamily === 'serif' ? 'Georgia, "Iowan Old Style", "Times New Roman", serif' : 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
  return [
    theme,
    highlight,
    EditorView.theme({
      '&': { fontSize: `${settings.fontSize}px` },
      '.cm-content': { fontFamily: font, lineHeight: '1.65' },
      '.cm-gutters': { fontFamily: font },
    }),
    settings.showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    settings.lineWrap ? EditorView.lineWrapping : [],
    settings.tabSize
      ? EditorState.tabSize.of(settings.tabSize)
      : [],
    EditorView.contentAttributes.of({ spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
  ]
}

export default function CodeEditor({
  value,
  path,
  settings,
  onChange,
  onSave,
  onRun,
  readOnly,
  onReady,
  onDestroy,
  onCursor,
  lint,
  projectFiles,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useMemo(() => new Compartment(), [])
  const settingsCompartment = useMemo(() => new Compartment(), [])
  const readOnlyCompartment = useMemo(() => new Compartment(), [])
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onRunRef = useRef(onRun)
  const onDestroyRef = useRef(onDestroy)
  const onCursorRef = useRef(onCursor)
  const lintRef = useRef(lint)
  const completionOptions = useRef<CompletionOptions>({
    languageId: languageForPath(path).id,
    files: projectFiles,
    path,
  })
  const cursorFrame = useRef<number | null>(null)
  const [langReady, setLangReady] = useState(false)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onRunRef.current = onRun
  onDestroyRef.current = onDestroy
  onCursorRef.current = onCursor
  lintRef.current = lint
  completionOptions.current = { languageId: languageForPath(path).id, files: projectFiles, path }

  const completionSource = useMemo(
    () => createCompletionSource(() => completionOptions.current),
    [],
  )

  // Create the view once.
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions(settings),
        // register an extra autocomplete source; the language packages keep
        // their own (HTML tags, CSS properties) because this only adds data
        EditorState.languageData.of(() => [{ autocomplete: completionSource }]),
        langCompartment.of([]),
        settingsCompartment.of(settingsExtensions(settings)),
        readOnlyCompartment.of(EditorState.readOnly.of(Boolean(readOnly))),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          if (update.docChanged && update.transactions.some((tr) => tr.isUserEvent('input'))) {
            document.dispatchEvent(new CustomEvent('cody:typing'))
          }
          if (update.docChanged || update.selectionSet) {
            if (cursorFrame.current) cancelAnimationFrame(cursorFrame.current)
            cursorFrame.current = requestAnimationFrame(() => {
              cursorFrame.current = null
              onCursorRef.current?.(readCursor(update.view))
            })
          }
        }),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onSaveRef.current?.()
              return true
            },
          },
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              onRunRef.current?.()
              return true
            },
          },
          {
            key: 'Mod-/',
            preventDefault: true,
            run: toggleComment,
          },
          {
            key: 'Tab',
            preventDefault: true,
            run: indentMore,
          },
          {
            key: 'Shift-Tab',
            preventDefault: true,
            run: indentLess,
          },
          {
            key: 'Mod-d',
            preventDefault: true,
            run: copyLineDown,
          },
          {
            key: 'Alt-ArrowUp',
            preventDefault: true,
            run: moveLineUp,
          },
          {
            key: 'Alt-ArrowDown',
            preventDefault: true,
            run: moveLineDown,
          },
          {
            key: 'Mod-Shift-k',
            preventDefault: true,
            run: deleteLine,
          },
          {
            key: 'Mod-l',
            preventDefault: true,
            run: selectLine,
          },
        ]),
        lintGutter(),
        linter(
          (view): CmDiagnostic[] => {
            const source = lintRef.current
            if (!source) return []
            const doc = view.state.doc
            return source(doc.toString()).map((problem) => {
              const line = doc.line(Math.min(Math.max(1, problem.line), doc.lines))
              const from = Math.min(line.from + Math.max(0, problem.column - 1), line.to)
              const to = Math.min(line.from + Math.max(problem.endColumn - 1, problem.column), line.to)
              return {
                from,
                to: Math.max(from, to),
                severity: problem.severity,
                message: problem.message,
                source: `Cody · ${problem.rule}`,
              }
            })
          },
          { delay: 350 },
        ),
        cmPlaceholder('Start writing…'),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    const handle: CodyEditorHandle = {
      cursor: () => readCursor(view),
      focus: () => view.focus(),
      insert: (text: string) => {
        const { from, to } = view.state.selection.main
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        })
        view.focus()
      },
      wrapSelection: (before: string, after = before) => {
        const { from, to } = view.state.selection.main
        const selected = view.state.sliceDoc(from, to)
        view.dispatch({
          changes: { from, to, insert: `${before}${selected}${after}` },
          selection: { anchor: from + before.length, head: from + before.length + selected.length },
        })
        view.focus()
      },
      toggleComment: () => {
        toggleComment(view)
        view.focus()
      },
      indent: () => indentMore(view),
      outdent: () => indentLess(view),
      undo: () => undoCommand(view),
      redo: () => redoCommand(view),
      openSearch: () => openSearchPanel(view),
      scrollToTop: () => view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true }),
      complete: () => startCompletion(view),
      goto: (line: number, column = 1) => {
        const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
        const anchor = Math.min(target.from + Math.max(0, column - 1), target.to)
        view.dispatch({ selection: { anchor }, scrollIntoView: true })
        view.focus()
      },
      getView: () => view,
    }
    onReady?.(handle)
    return () => {
      if (cursorFrame.current) cancelAnimationFrame(cursorFrame.current)
      onDestroyRef.current?.()
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (file switch, undo from outside).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: [],
    })
  }, [value])

  // Load the language extension when the file changes.
  useEffect(() => {
    let cancelled = false
    setLangReady(false)
    const id = path.includes('.') ? undefined : undefined
    void id
    import('../lib/languages').then(async ({ languageForPath }) => {
      const lang = languageForPath(path)
      const ext = await loadLanguageExtension(lang.id)
      if (cancelled) return
      const view = viewRef.current
      if (!view) return
      view.dispatch({ effects: langCompartment.reconfigure(ext) })
      setLangReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, langCompartment])

  // Apply settings live.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: settingsCompartment.reconfigure(settingsExtensions(settings)) })
  }, [settings, settingsCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(Boolean(readOnly))) })
  }, [readOnly, readOnlyCompartment])

  return (
    <div
      className="editor-host"
      ref={hostRef}
      data-lang-ready={langReady ? 'true' : 'false'}
      data-testid="code-editor"
    />
  )
}
