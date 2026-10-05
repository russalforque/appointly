import { supabase } from './supabase'
import { friendlyError } from './db'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * Checks a picked file before any bytes leave the browser: an allowed type, under the size cap,
 * and something the browser can actually decode (a renamed .txt is not a PNG). The bucket enforces
 * type and size again on the server.
 */
export async function checkImage(file: File, maxBytes: number): Promise<{ width: number; height: number }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.')
  if (file.size > maxBytes) throw new Error(`That image is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${maxBytes / 1048576} MB.`)
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error("That file couldn't be read as an image."))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Uploads to a public bucket and reports progress. supabase-js has no progress callback, so this
 * is the same Storage REST call it makes, sent through XMLHttpRequest. Resolves to the public URL.
 */
export async function uploadPublicImage(
  bucket: string,
  folder: string,
  name: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ path: string; url: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Sign in again to continue.')
  const path = `${folder}/${name}-${Date.now().toString(36)}.${EXT[file.type] ?? 'img'}`
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.setRequestHeader('cache-control', 'max-age=31536000')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = `Upload failed (${xhr.status}).`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message || body.error || message
      } catch {
        // keep the status line
      }
      reject(new Error(friendlyError(message)))
    }
    xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })

  return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl }
}

/** The object path inside `bucket` when `url` is one of its public URLs; null for any other link. */
export function bucketPathOf(bucket: string, url: string | null | undefined): string | null {
  if (!url) return null
  const prefix = supabase.storage.from(bucket).getPublicUrl('').data.publicUrl
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null
}

/** Best-effort cleanup; a leftover file costs storage, not correctness, so failures are ignored. */
export async function removeObjects(bucket: string, paths: string[]) {
  if (paths.length) await supabase.storage.from(bucket).remove(paths).catch(() => undefined)
}
