import type { Diagnostic } from '../lib/diagnostics'

type Props = {
  problems: Diagnostic[]
  /** Used for the accessible label, e.g. `src/App.tsx`. */
  path?: string
  /** `mark` = the red "!" shown next to a file badge; `count` = a number pill. */
  variant?: 'mark' | 'count'
}

function summarise(problems: Diagnostic[], path?: string) {
  const errors = problems.filter((problem) => problem.severity === 'error').length
  const warnings = problems.length - errors
  const parts: string[] = []
  if (errors) parts.push(`${errors} error${errors === 1 ? '' : 's'}`)
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`)
  const prefix = path ? (path.includes('/') ? path : `${path}: `) : ''
  return `${prefix}${parts.join(', ')}`
}

/**
 * The "this file is broken" glyph that sits beside a file's language badge.
 * Red for errors, amber when there are only warnings, nothing when clean.
 */
export default function ProblemMark({ problems, path, variant = 'mark' }: Props) {
  if (problems.length === 0) return null
  const hasError = problems.some((problem) => problem.severity === 'error')
  const tone = hasError ? 'error' : 'warning'
  const label = summarise(problems, path)

  if (variant === 'count') {
    return (
      <span className={`problem-count ${tone}`} role="img" aria-label={label} title={label}>
        {problems.length}
      </span>
    )
  }

  return (
    <span className={`problem-flag ${tone}`} role="img" aria-label={label} title={label}>
      !
    </span>
  )
}
