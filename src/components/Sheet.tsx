import { useEffect, useState, type ReactNode } from 'react'

/**
 * Sheets stack (the switcher opens the create sheet, a menu opens a confirm).
 * Each one used to save-and-restore `document.body.style.overflow` on its own,
 * so closing two in the same commit left the body locked at `hidden` — after
 * which the page could not scroll at all. One lock, counted, fixes that.
 */
let lockedSheets = 0
let overflowBeforeLock = ''

function lockBodyScroll(): () => void {
  if (lockedSheets === 0) {
    overflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockedSheets += 1
  let released = false
  return () => {
    if (released) return
    released = true
    lockedSheets = Math.max(0, lockedSheets - 1)
    if (lockedSheets === 0) document.body.style.overflow = overflowBeforeLock
  }
}
import Icon from './Icons'

type Props = {
  open: boolean
  title?: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'default' | 'tall'
}

export default function Sheet({ open, title, subtitle, onClose, children, footer, size = 'default' }: Props) {
  useEffect(() => {
    if (!open) return
    const unlock = lockBodyScroll()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unlock()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title ?? 'Panel'}>
      <button className="sheet-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className={`sheet sheet-${size}`}>
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </div>
    </div>
  )
}

type PromptProps = {
  open: boolean
  title: string
  subtitle?: string
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
  children?: ReactNode
}

export function PromptSheet({
  open,
  title,
  subtitle,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Save',
  onSubmit,
  onClose,
  children,
}: PromptProps) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  return (
    <Sheet
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <button
          className="btn primary block"
          onClick={() => {
            onSubmit(value.trim())
            onClose()
          }}
          disabled={!value.trim()}
        >
          {confirmLabel}
        </button>
      }
    >
      {label && <label className="field-label">{label}</label>}
      <input
        className="text-input"
        value={value}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) {
            onSubmit(value.trim())
            onClose()
          }
        }}
      />
      {children}
    </Sheet>
  )
}
