import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type KitIconName =
  | 'ur' | 'r' | 'l' | 'cd' | 'cu' | 'x' | 'ok' | 'fs' | 'dl' | 'sh'
  | 'bolt' | 'info' | 'warn' | 're' | 'q' | 'out' | 'plus' | 'cam' | 'img' | 'tr' | 'sp'

// Единственный набор иконок приложения — из UI-кита v2:
// штрих 1,5 px, острые углы, цвет currentColor, 20 px.
const PATHS: Record<KitIconName, ReactNode> = {
  ur: <path d="M7 17 17 7M8 7h9v9" />,
  r: <path d="M4 12h16M14 6l6 6-6 6" />,
  l: <path d="M20 12H4M10 6l-6 6 6 6" />,
  cd: <path d="m6 9 6 6 6-6" />,
  cu: <path d="m6 15 6-6 6 6" />,
  x: <path d="M5 5l14 14M19 5 5 19" />,
  ok: <path d="m4 12 5 5L20 6" />,
  fs: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  dl: <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />,
  sh: (
    <>
      <path d="m8.5 11 7-4M8.5 13l7 4" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
    </>
  ),
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v.5" />
    </>
  ),
  warn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16v.5" />
    </>
  ),
  re: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
  q: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 5 5" />
    </>
  ),
  out: <path d="M10 4H4v16h6M16 8l4 4-4 4M20 12H9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cam: (
    <>
      <path d="M4 7h4l2-3h4l2 3h4v13H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  img: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4" />,
  tr: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />,
  sp: <path d="M12 3a9 9 0 0 1 9 9" />,
}

export function KitIcon({ name, className, label, spin }: {
  name: KitIconName
  className?: string
  label?: string
  spin?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('kit-icon', spin && 'kit-spin', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
