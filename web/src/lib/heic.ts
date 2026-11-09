// Клиентская конвертация HEIC/HEIF в JPEG. heic2any (WASM, MIT) подгружается
// лениво динамическим import, чтобы не раздувать начальный бандл.
// Серверная конвертация в src/imageupload.js остаётся как фолбэк для прямых
// загрузок в обход UI.

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

export function shouldConvertHeic(file: { name?: string; type?: string } | null | undefined): boolean {
  if (!file) return false
  if (file.type && HEIC_TYPES.has(file.type.toLowerCase())) return true
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

export async function convertHeicToJpeg(
  file: File,
  { importHeic2any = () => import('heic2any') }: {
    importHeic2any?: () => Promise<typeof import('heic2any')>
  } = {},
): Promise<File> {
  try {
    const { default: heic2any } = await importHeic2any()
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    const result = Array.isArray(blob) ? blob[0] : blob
    const base = (file.name || 'photo').replace(/\.(heic|heif)$/i, '')
    return new File([result], `${base}.jpg`, { type: 'image/jpeg' })
  } catch (e) {
    const err = new Error('Не удалось прочитать HEIC. Сохраните фото как JPG или включите в настройках iPhone «Наиболее совместимые»')
    err.cause = e
    throw err
  }
}
