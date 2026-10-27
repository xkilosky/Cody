import type { Toast } from '../types'
import Icon from './Icons'

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone ?? 'info'}`}>
          <Icon
            name={toast.tone === 'error' ? 'info' : toast.tone === 'success' ? 'check' : 'sparkles'}
            size={15}
          />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
