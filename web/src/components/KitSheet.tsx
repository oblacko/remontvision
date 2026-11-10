import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { KitIcon } from './KitIcon'
import { cn } from '@/lib/utils'

type KitSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  wide?: boolean
  children: ReactNode
}

// Попап из UI-кита: на телефоне шторка снизу, на десктопе по центру.
export function KitSheet({ open, onClose, title, wide, children }: KitSheetProps) {  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handleClose = () => onClose()
    const handleClick = (event: MouseEvent) => {
      if (event.target === el) el.close()
    }
    el.addEventListener('close', handleClose)
    el.addEventListener('click', handleClick)
    return () => {
      el.removeEventListener('close', handleClose)
      el.removeEventListener('click', handleClick)
    }
  }, [onClose])

  return (
    <dialog ref={ref} className={cn('k-sheet', wide && 'k-sheet--wide')} aria-label={title}>
      <div className="k-dh">
        {title ? <h2 className="display-title">{title}</h2> : <span />}
        <button type="button" className="k-btn k-btn--icon" onClick={onClose} aria-label="Закрыть">
          <KitIcon name="x" />
        </button>
      </div>
      <div className="k-db">{children}</div>
    </dialog>
  )
}

type KitLightboxProps = {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}

// Просмотр фото на весь экран: чёрный фон, кнопка-оверлей.
export function KitLightbox({ open, onClose, label, children }: KitLightboxProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handleClose = () => onClose()
    const handleClick = (event: MouseEvent) => {
      if (event.target === el) el.close()
    }
    el.addEventListener('close', handleClose)
    el.addEventListener('click', handleClick)
    return () => {
      el.removeEventListener('close', handleClose)
      el.removeEventListener('click', handleClick)
    }
  }, [onClose])

  return (
    <dialog ref={ref} className="k-lb" aria-label={label}>
      <button type="button" className="k-btn k-btn--ov k-btn--icon absolute right-3 top-3 z-10" onClick={onClose} aria-label="Закрыть">
        <KitIcon name="x" />
      </button>
      <div className="grid h-full place-items-center p-4">{children}</div>
    </dialog>
  )
}
