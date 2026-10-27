import type { SVGProps } from 'react'

export type IconName =
  | 'logo'
  | 'play'
  | 'stop'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'plus'
  | 'more'
  | 'settings'
  | 'trash'
  | 'pencil'
  | 'copy'
  | 'download'
  | 'upload'
  | 'share'
  | 'terminal'
  | 'code'
  | 'files'
  | 'sparkles'
  | 'search'
  | 'undo'
  | 'redo'
  | 'comment'
  | 'symbols'
  | 'close'
  | 'check'
  | 'external'
  | 'refresh'
  | 'info'
  | 'sun'
  | 'moon'
  | 'indent'
  | 'outdent'
  | 'save'
  | 'wifi-off'
  | 'folder-plus'
  | 'dot'
  | 'arrow-right'
  | 'wrap'
  | 'eye'
  | 'zap'
  | 'alert'
  | 'bulb'
  | 'find'
  | 'key'
  | 'send'
  | 'agents'

const PATHS: Record<IconName, string> = {
  logo: 'M9 5 3 12l6 7M15 5l6 7-6 7',
  play: 'M8 5.5v13l11-6.5-11-6.5Z',
  stop: 'M7 7h10v10H7z',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  'folder-open': 'M3 8V7a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v1M3 8h16l-2 9a2 2 0 0 1-2 1.6H5.6A2 2 0 0 1 3.7 17L3 8Z',
  file: 'M6 3h7l5 5v13H6V3Zm7 0v5h5',
  plus: 'M12 5v14M5 12h14',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  settings:
    'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm8.4-2.1.1-1.4-.1-1.4-2.1-.5a6.7 6.7 0 0 0-.7-1.7l1.2-1.8-2-2-1.8 1.2c-.5-.3-1.1-.5-1.7-.7L12.8 3h-1.6l-.5 2.1c-.6.2-1.2.4-1.7.7L7.2 4.6l-2 2 1.2 1.8c-.3.5-.5 1.1-.7 1.7l-2.1.5-.1 1.4.1 1.4 2.1.5c.2.6.4 1.2.7 1.7l-1.2 1.8 2 2 1.8-1.2c.5.3 1.1.5 1.7.7l.5 2.1h1.6l.5-2.1c.6-.2 1.2-.4 1.7-.7l1.8 1.2 2-2-1.2-1.8c.3-.5.5-1.1.7-1.7l2.1-.5Z',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  pencil: 'M4 20h4L20 8l-4-4L4 16v4Zm9-13 4 4',
  copy: 'M9 9h11v11H9V9Zm-5 6V4h11',
  download: 'M12 4v11m0 0 4-4m-4 4-4-4M5 19h14',
  upload: 'M12 20V9m0 0 4 4m-4-4-4 4M5 5h14',
  share: 'M12 15V4m0 0 4 4m-4-4L8 8M5 14v5h14v-5',
  terminal: 'M5 6l5 5-5 5M13 17h6',
  code: 'M9 8l-5 4 5 4M15 8l5 4-5 4',
  files: 'M8 3h6l4 4v10H8V3Zm6 0v4h4M4 7v14h10',
  sparkles: 'M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8L12 3Zm6 11 .9 2.3L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.7L18 14Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5',
  undo: 'M9 7 4 12l5 5M4 12h9a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12h-9a6 6 0 0 0 0-12',
  comment: 'M4 5h16v11H9l-5 4V5Z',
  symbols: 'M4 7h4M6 7v10M14 7l4 10M14 17l4-10',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 13l4 4L19 7',
  external: 'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v5h1',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 16v2M3 12h2m16 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  indent: 'M4 6h16M9 12h11M9 18h11M4 10l3 2-3 2',
  outdent: 'M4 6h16M9 12h11M9 18h11M7 10 4 12l3 2',
  save: 'M5 4h11l3 3v13H5V4Zm3 0v6h8V4M8 20v-6h8v6',
  'wifi-off': 'M4 4l16 16M8.5 12.5a5 5 0 0 1 3-1.4M5 9a11 11 0 0 1 4-2M15 9.5c1.4.4 2.7 1.1 4 2M12 18h.01',
  'folder-plus': 'M3 7a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm9 4v6m-3-3h6',
  dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  'arrow-right': 'M4 12h15m0 0-6-6m6 6-6 6',
  wrap: 'M4 6h16M4 12h12a3 3 0 0 1 0 6h-3m0 0 2-2m-2 2 2 2M4 18h5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  zap: 'M13 3 5 14h5l-1 7 8-11h-5l1-7Z',
  // triangle-with-bang: used for problems/errors
  alert: 'M12 4 2.5 20h19L12 4Zm0 5.5v5m0 3.2h.01',
  // lightbulb: code actions
  key: 'M14.5 9.5a4.5 4.5 0 1 0-4.3 4.5L9 15.2V18H6.2L4 20.2V21h3.6l2.2-2.2v-2.6l1.4-1.4a4.5 4.5 0 0 0 3.3-5.3ZM16 7.8h.01',
  send: 'M4 12 20 4l-4.5 16-3.8-6.2L4 12Zm7.7 1.8L20 4',
  agents: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20v-1.6A4.4 4.4 0 0 1 6.9 14h2.2a4.4 4.4 0 0 1 4.4 4.4V20M14.5 20v-1.6a4.4 4.4 0 0 1 2.2-3.8M17 14h.1a4.4 4.4 0 0 1 4.4 4.4V20',
  find: 'M10.5 3.4a7.1 7.1 0 1 0 0 14.2 7.1 7.1 0 0 0 0-14.2ZM15.6 15.6 21 21M7.6 8h5.8M7.6 10.7h3.9',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1h6c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z',
}

type Props = SVGProps<SVGSVGElement> & {
  name: IconName
  size?: number
  filled?: boolean
}

export default function Icon({ name, size = 20, filled, strokeWidth, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}
