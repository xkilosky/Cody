import type { CSSProperties } from 'react'
import { languageForPath, type LanguageDef } from '../lib/languages'

type Props = {
  /** Pass a resolved language, or a path and it will be looked up. */
  lang?: LanguageDef
  path?: string
  size?: number
  /** Highlighted for the file you currently have open. */
  active?: boolean
  className?: string
}

/** A file's language, drawn as a small monogram badge (`py`, `#`, `{}`, `tsx`).
 *
 *  Logos would mean a different hue per language, which fights the editor's
 *  one-accent palette — a monogram says "python" just as clearly at 16px and
 *  inherits the chrome's ink. */
export default function LangIcon({ lang, path, size = 16, active, className }: Props) {
  const language = lang ?? languageForPath(path ?? '')
  const classes = ['lang-icon', active ? 'active' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span
      className={classes}
      style={{ '--lang-icon-size': `${size}px` } as CSSProperties}
      title={language.label}
      aria-label={language.label}
      role="img"
    >
      {language.glyph}
    </span>
  )
}
