import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { ProcurementPanel } from '@/components/ProcurementPanel'
import type { ProductMatch } from '@/components/ProcurementPanel'
import '../App.css'

type RoomRender = {
  id: string
  image: string | null
  status: string
  analysis?: { products?: ProductMatch[] } | null
}

type RoomData = {
  id: string
  style: string
  room_type?: string | null
  status: string
  products_enabled?: boolean
  render?: RoomRender | null
}

export default function Procurement() {
  const { id = '' } = useParams()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/rooms/${id}`)
        const d = await r.json().catch(() => ({}))
        if (r.status === 401) { if (!cancelled) setError('Войдите, чтобы открыть подбор товаров'); return }
        if (!r.ok) throw new Error(d.error || 'Комната не найдена')
        if (!cancelled) setRoom(d as RoomData)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось открыть комнату')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  const render = room?.render || null
  const hasRender = Boolean(render && render.status === 'done' && render.image)

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="page-shell flex min-h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo animated />
            <span className="eyebrow hidden sm:inline">/ подбор товаров</span>
          </div>
          <Link to={`/room/${encodeURIComponent(id)}`} className="action-secondary min-h-11 gap-2 px-3 text-sm">
            <ArrowLeft className="size-4" /> <span className="min-w-0">Вернуться к результату</span>
          </Link>
        </div>
      </header>

      <main className="page-shell py-8">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary-text" /></div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-destructive" role="alert">{error}</p>
            <Link to="/cabinet" className="action-secondary mt-6 inline-flex"><ArrowLeft className="size-4" />В кабинет</Link>
          </div>
        ) : !room ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Комната не найдена</p>
            <Link to="/cabinet" className="action-secondary mt-6 inline-flex"><ArrowLeft className="size-4" />В кабинет</Link>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
              <div className="min-w-0">
                <p className="eyebrow">{room.room_type || 'Комната'}</p>
                <h1 className="display-title mt-2 text-4xl sm:text-5xl">Поиск товаров</h1>
                <p className="mt-2 text-sm text-muted-foreground">{room.style}</p>
              </div>
            </div>

            {!hasRender ? (
              <div className="mt-8 border border-foreground/25 p-6">
                <p className="eyebrow">Нет готового результата</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Подбор товаров запускается по готовому дизайну. Вернитесь к комнате и завершите создание дизайна.</p>
                <Link to={`/room/${encodeURIComponent(id)}`} className="action-secondary mt-5 inline-flex"><ArrowLeft className="size-4" />Вернуться к результату</Link>
              </div>
            ) : (
              <div className="mt-8">
                <ProcurementPanel
                  renderId={render!.id}
                  image={render!.image}
                  initialProducts={render!.analysis?.products || []}
                  productsEnabled={room.products_enabled !== false}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
