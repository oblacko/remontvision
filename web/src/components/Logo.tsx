import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import './Logo.css'

type LogoProps = {
  href?: string
  className?: string
  animated?: boolean
  size?: number
}

// Логотип v2 из UI-кита: симметричная рамка-видоискатель, точка-«глаз»,
// слово «ремонтвижн» строчными, «вижн» — rust-цветом.
export function Logo({ href = '/', className, animated = false, size = 24 }: LogoProps) {
  return (
    <a
      href={href}
      className={cn('inline-flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-4', className)}
      aria-label="Ремонтвижн — на главную"
      style={{ '--logo-size': `${size}px` } as CSSProperties}
    >
      <span className="logo-v2">
        <svg className={cn('logo-v2-mark', animated && 'logo-v2-blink')} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="logo-v2-text">ремонт<em>вижн</em></span>
      </span>
    </a>
  )
}
