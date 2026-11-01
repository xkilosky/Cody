import type { Draft, DraftStep, Project } from '../types'
import { uid } from './utils'

/**
 * Drafts — the planning surface that sits *before* a workspace exists.
 *
 * A draft is deliberately small: a name, one line of intent, a free brief and
 * a list of steps you tick off. It is not a document editor and it is not a
 * template: when it is good enough, it becomes a workspace whose README *is*
 * the plan, and every step is already written down where the code will live.
 */

export const DRAFTS_KEY = 'drafts'
export const PLAN_FILE = 'PLAN.md'

export function newStep(text: string): DraftStep {
  return { id: uid('s_'), text: text.trim(), done: false }
}

export function newDraft(title = 'Untitled plan'): Draft {
  const now = Date.now()
  return {
    id: uid('d_'),
    title,
    pitch: '',
    notes: '',
    steps: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Newest first — the draft you touched last is the one you meant to open. */
export function sortDrafts(drafts: Draft[]): Draft[] {
  return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function draftProgress(draft: Draft): { done: number; total: number } {
  return {
    done: draft.steps.filter((step) => step.done).length,
    total: draft.steps.length,
  }
}

export function draftTitle(draft: Draft): string {
  const name = draft.title.trim()
  return name || 'Untitled plan'
}

/**
 * The plan as markdown: the same text whether it lands in a new workspace's
 * README or in `PLAN.md` beside the code.
 */
export function draftMarkdown(draft: Draft): string {
  const lines: string[] = [`# ${draftTitle(draft)}`, '']
  if (draft.pitch.trim()) lines.push(`> ${draft.pitch.trim()}`, '')
  if (draft.notes.trim()) lines.push('## Brief', '', draft.notes.trim(), '')
  if (draft.steps.length > 0) {
    lines.push('## Plan', '')
    for (const step of draft.steps) lines.push(`- [${step.done ? 'x' : ' '}] ${step.text}`)
    lines.push('')
  }
  lines.push('---', '', `_Drafted in Cody on ${new Date(draft.createdAt).toISOString().slice(0, 10)}._`, '')
  return lines.join('\n')
}

/**
 * A workspace born from a draft holds the plan and nothing else. No starter
 * markup is invented here — the first real file is a decision, not a default.
 */
export function draftProject(draft: Draft): Project {
  const now = Date.now()
  return {
    id: uid('p_'),
    name: draftTitle(draft),
    description: draft.pitch.trim() || undefined,
    files: [{ path: 'README.md', content: draftMarkdown(draft) }],
    createdAt: now,
    updatedAt: now,
  }
}

/** `PLAN.md`, or `PLAN-2.md` when the workspace already has a plan. */
export function planPathIn(files: Array<{ path: string }>): string {
  const taken = new Set(files.map((file) => file.path))
  if (!taken.has(PLAN_FILE)) return PLAN_FILE
  let n = 2
  while (taken.has(`PLAN-${n}.md`)) n += 1
  return `PLAN-${n}.md`
}
