// Общие типы блоков лендинга «Галерея» и «Стили» (REM-56).

export type GalleryItem = {
  id: string
  roomType: string
  style: string
  imageUrl: string
  shareToken?: string | null
}

export type GalleryRoom = {
  name: string
  slug: string
}

export type StyleSwatch = {
  hex: string
  name?: string
}

export type StyleCard = {
  key: string
  name: string
  display_name: string
  image_url: string
  swatches: StyleSwatch[]
}
