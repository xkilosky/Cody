import type { CSSProperties } from 'react'
import { LANGUAGE_MARKS } from '../lib/languageIcons'
import { languageForPath, type LanguageDef } from '../lib/languages'

type Props = {
  /** Pass a resolved language, or a path and it will be looked up. */
  lang?: LanguageDef
  path?: string
  size?: number
  /** Full strength for the file you currently have open. */
  active?: boolean
  className?: string
}

/** A file's language, drawn with its real mark.
 *
 *  Shapes and brand colours come from Simple Icons, so `App.tsx` gets the React
 *  atom, `main.py` the Python glyph, `styles.css` the CSS shield — the same
 *  icons an editor like VS Code puts on a file. Colour stays here, in the file
 *  type, and nowhere near the code itself: the editor palette is still one hue.
 *
 *  A few languages have no mark (plain text), so they keep the monogram badge. */
export default function LangIcon({ lang, path, size = 15, active, className }: Props) {
  const language = lang ?? languageForPath(path ?? '')
  const mark = LANGUAGE_MARKS[language.id]
  const classes = ['lang-icon', active ? 'active' : '', mark ? 'mark' : 'badge', className ?? '']
    .filter(Boolean)
    .join(' ')
  const style = { '--lang-icon-size': `${size}px` } as CSSProperties

  if (!mark) {
    return (
      <span className={classes} style={style} title={language.label} aria-label={language.label} role="img">
        {language.glyph}
      </span>
    )
  }

  return (
    <svg
      className={`${classes}${mark.lift ? ' lift' : ''}`}
      style={{ ...style, color: mark.hex }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={language.label}
      focusable="false"
    >
      <title>{mark.title}</title>
      <path d={mark.path} />
    </svg>
  )
}
