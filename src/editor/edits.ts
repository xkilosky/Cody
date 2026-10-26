import type { EditorView } from '@codemirror/view'
import type { TextEdit } from '../lib/codeActions'

/**
 * Apply a set of absolute edits in one transaction. Sorted from the end of the
 * document backwards so earlier offsets stay valid while later ones land.
 */
export function applyTextEdits(view: EditorView, edits: TextEdit[]): void {
  if (edits.length === 0) return
  const changes = [...edits]
    .filter((edit) => edit.from <= edit.to)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((edit) => ({ from: edit.from, to: edit.to, insert: edit.insert }))
  view.dispatch({ changes, scrollIntoView: true })
}
