import { useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from '../types'
import { draftProgress, draftTitle } from '../lib/drafts'
import { relativeTime } from '../lib/utils'
import Icon from './Icons'

type Props = {
  drafts: Draft[]
  /** Returns the id of the new draft so the pane can open it straight away. */
  onCreateDraft: (title: string) => string
  onUpdateDraft: (draft: Draft) => void
  onDeleteDraft: (id: string) => void
  /** Turn the draft into a workspace (README = the plan) and open it. */
  onBuildWorkspace: (draft: Draft) => void
  /** Drop the plan into the open workspace as PLAN.md. */
  onAddToProject: (draft: Draft) => void
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

/**
 * Drafts — plan before you build.
 *
 * Two states, one pane: the list of ideas, and one idea opened to be written.
 * Everything saves as you type; the only buttons that do something irreversible
 * say so. Steps are drawn as `[x]` / `[ ]` because this app already speaks in
 * bracket keys.
 */
export default function DraftsPane({
  drafts,
  onCreateDraft,
  onUpdateDraft,
  onDeleteDraft,
  onBuildWorkspace,
  onAddToProject,
  onNotify,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stepDraft, setStepDraft] = useState('')
  const titleRef = useRef<HTMLInputElement | null>(null)
  const stepRef = useRef<HTMLInputElement | null>(null)

  const open = openId ? drafts.find((draft) => draft.id === openId) ?? null : null

  // A draft can disappear from under the editor (deleted from another screen).
  useEffect(() => {
    if (openId && !drafts.some((draft) => draft.id === openId)) setOpenId(null)
  }, [drafts, openId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return drafts
    return drafts.filter((draft) =>
      `${draft.title} ${draft.pitch} ${draft.notes} ${draft.steps.map((step) => step.text).join(' ')}`
        .toLowerCase()
        .includes(q),
    )
  }, [drafts, query])

  const openSteps = drafts.reduce((sum, draft) => {
    const { done, total } = draftProgress(draft)
    return sum + (total - done)
  }, 0)

  const start = () => {
    const id = onCreateDraft('Untitled plan')
    setOpenId(id)
    setQuery('')
    // The title field mounts in this same commit; focus it after paint.
    setTimeout(() => titleRef.current?.select(), 50)
  }

  const patch = (fields: Partial<Draft>) => {
    if (!open) return
    onUpdateDraft({ ...open, ...fields })
  }

  const addStep = () => {
    const text = stepDraft.trim()
    if (!open || !text) return
    const step = { id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, done: false }
    patch({ steps: [...open.steps, step] })
    setStepDraft('')
    stepRef.current?.focus()
  }

  /* ---------------------------------------------------------------- */
  /* one draft                                                         */
  /* ---------------------------------------------------------------- */

  if (open) {
    const { done, total } = draftProgress(open)
    return (
      <div className="pane drafts-pane">
        <div className="pane-toolbar">
          <button
            className="btn small ghost icon-only"
            onClick={() => setOpenId(null)}
            aria-label="Back to drafts"
            title="Back to drafts"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <input
            ref={titleRef}
            className="draft-title-input"
            value={open.title}
            aria-label="Draft title"
            placeholder="Name this plan"
            autoCapitalize="sentences"
            onChange={(event) => patch({ title: event.target.value })}
          />
          <span className="draft-progress mono">
            {total > 0 ? `${done}/${total}` : '—'}
          </span>
        </div>

        <div className="draft-scroll">
          <label className="field-label" htmlFor="draft-pitch">
            one line
          </label>
          <input
            id="draft-pitch"
            className="text-input draft-pitch-input"
            value={open.pitch}
            placeholder="What is it, in a sentence?"
            aria-label="Draft pitch"
            onChange={(event) => patch({ pitch: event.target.value })}
          />

          <label className="field-label" htmlFor="draft-notes">
            brief
          </label>
          <textarea
            id="draft-notes"
            className="draft-notes"
            value={open.notes}
            placeholder="The messy thinking: who it is for, what it must do, what you are unsure about."
            aria-label="Draft brief"
            spellCheck={false}
            onChange={(event) => patch({ notes: event.target.value })}
          />

          <div className="draft-steps-head">
            <span className="drawer-label">plan</span>
            <span className="draft-meta">
              {done} of {total} done
            </span>
          </div>

          {open.steps.length === 0 ? (
            <p className="draft-hint">No steps yet. A plan is a list of things you will actually do.</p>
          ) : (
            <ul className="draft-steps">
              {open.steps.map((step, index) => (
                <li key={step.id} className={`draft-step${step.done ? ' done' : ''}`}>
                  <button
                    className="draft-check"
                    aria-pressed={step.done}
                    aria-label={`${step.done ? 'Uncheck' : 'Check'} step ${index + 1}: ${step.text}`}
                    onClick={() =>
                      patch({
                        steps: open.steps.map((item) =>
                          item.id === step.id ? { ...item, done: !item.done } : item,
                        ),
                      })
                    }
                  >
                    <span className="draft-box" aria-hidden="true">{step.done ? '[x]' : '[ ]'}</span>
                    <span className="draft-step-text">{step.text}</span>
                  </button>
                  <button
                    className="row-icon"
                    aria-label={`Delete step ${index + 1}`}
                    onClick={() => patch({ steps: open.steps.filter((item) => item.id !== step.id) })}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="draft-add"
            onSubmit={(event) => {
              event.preventDefault()
              addStep()
            }}
          >
            <input
              ref={stepRef}
              className="text-input"
              value={stepDraft}
              placeholder="Next step…"
              aria-label="New step"
              autoCapitalize="sentences"
              onChange={(event) => setStepDraft(event.target.value)}
            />
            <button className="btn small ghost" type="submit" disabled={!stepDraft.trim()}>
              Add
            </button>
          </form>

          <p className="draft-stamp">
            {open.projectId ? 'built into a workspace' : 'not built yet'} · edited {relativeTime(open.updatedAt)}
          </p>
        </div>

        <div className="draft-footer">
          <button
            className="btn primary block"
            onClick={() => {
              onBuildWorkspace(open)
              onNotify('Workspace created — the plan is its README', 'success')
            }}
          >
            <Icon name="files" size={16} /> Create workspace
          </button>
          <div className="draft-footer-row">
            <button className="btn small ghost" onClick={() => onAddToProject(open)}>
              Add as PLAN.md
            </button>
            <button
              className="linkish danger"
              onClick={() => {
                onDeleteDraft(open.id)
                setOpenId(null)
                onNotify('Draft deleted')
              }}
            >
              Delete draft
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* the list                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="pane drafts-pane">
      <div className="pane-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search drafts"
            aria-label="Search drafts"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button className="clear-btn" onClick={() => setQuery('')} aria-label="Clear draft search">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <button className="btn small ghost" onClick={start}>
          <Icon name="plus" size={16} /> New draft
        </button>
      </div>

      <div className="draft-list">
        {drafts.length === 0 ? (
          <div className="empty-state">
            <Icon name="pencil" size={26} />
            <h3>Nothing drafted</h3>
            <p>
              A draft is a project before it is one: a name, a sentence, and the steps you mean to
              take. When it makes sense, it becomes a workspace.
            </p>
            <button className="btn primary" onClick={start}>
              <Icon name="plus" size={16} /> Start a draft
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <Icon name="search" size={24} />
            <h3>No matches</h3>
            <p>Nothing drafted mentions “{query}”.</p>
          </div>
        ) : (
          visible.map((draft) => {
            const { done, total } = draftProgress(draft)
            return (
              <button
                key={draft.id}
                className="draft-row"
                onClick={() => {
                  setOpenId(draft.id)
                  setStepDraft('')
                }}
              >
                <span className="draft-row-main">
                  <span className="draft-title">{draftTitle(draft)}</span>
                  <span className="draft-pitch">
                    {draft.pitch.trim() || draft.notes.trim().split('\n')[0] || 'No brief yet'}
                  </span>
                  <span className="draft-meta">
                    {total > 0 ? `${done}/${total} steps` : 'no steps'} · {relativeTime(draft.updatedAt)}
                    {draft.projectId ? ' · built' : ''}
                  </span>
                </span>
                {draft.projectId ? (
                  <span className="draft-linked" aria-label="Built into a workspace">
                    <Icon name="files" size={14} />
                  </span>
                ) : (
                  <Icon name="chevron-right" size={15} />
                )}
              </button>
            )
          })
        )}
      </div>

      <div className="pane-footnote">
        <span>
          {drafts.length} draft{drafts.length === 1 ? '' : 's'}
          {openSteps > 0 ? ` · ${openSteps} open step${openSteps === 1 ? '' : 's'}` : ''}
        </span>
        <span className="mono">plan → workspace</span>
      </div>
    </div>
  )
}
