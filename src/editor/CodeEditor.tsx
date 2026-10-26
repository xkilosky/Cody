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
  redo as redoCommand,
  undo as undoCommand,
} from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { searchKeymap, openSearchPanel } from '@codemirror/search'
import { codyDarkTheme, codyLightTheme, codyHighlightDark, codyHighlightLight } from './theme'
import { loadLanguageExtension } from '../lib/languages'
import type { Settings } from '../types'

export type CodyEditorHandle = {
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
  const theme = settings.theme === 'dark' ? codyDarkTheme : codyLightTheme
  const highlight = settings.theme === 'dark' ? codyHighlightDark : codyHighlightLight
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
  const [langReady, setLangReady] = useState(false)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onRunRef.current = onRun
  onDestroyRef.current = onDestroy

  // Create the view once.
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions(settings),
        langCompartment.of([]),
        settingsCompartment.of(settingsExtensions(settings)),
        readOnlyCompartment.of(EditorState.readOnly.of(Boolean(readOnly))),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          if (update.docChanged && update.transactions.some((tr) => tr.isUserEvent('input'))) {
            document.dispatchEvent(new CustomEvent('cody:typing'))
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
        ]),
        cmPlaceholder('Start writing…'),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    const handle: CodyEditorHandle = {
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
      getView: () => view,
    }
    onReady?.(handle)
    return () => {
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
