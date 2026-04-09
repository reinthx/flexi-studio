/**
 * imageProcessor.ts
 * Resizes an image File to max 512px on the longest edge,
 * converts to WebP, and returns a base64 data URL.
 */

const MAX_PX = 512
const QUALITY = 0.85

export async function processImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  const scale = Math.min(1, MAX_PX / Math.max(width, height))
  const w = Math.round(width  * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blobToBase64(blob)) : reject(new Error('Canvas toBlob failed')),
      'image/webp',
      QUALITY,
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
