import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AlertCircle, ImageUp, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { checkImage, uploadPublicImage } from '../../../lib/storage'
import { initials } from '../../../lib/format'

export const BRANDING_BUCKET = 'business-branding'

const SPEC = {
  logo: {
    label: 'Logo',
    maxBytes: 2 * 1024 * 1024,
    help: 'Square, at least 256 × 256 px. JPG, PNG or WebP, up to 2 MB.',
    minEdge: 128,
  },
  cover: {
    label: 'Cover image',
    maxBytes: 5 * 1024 * 1024,
    help: 'Wide, about 1600 × 600 px. JPG, PNG or WebP, up to 5 MB.',
    minEdge: 800,
  },
} as const

/**
 * Upload control for the logo or the cover. The file goes to Storage as soon as it is picked, so
 * the preview shows the real hosted image; the profile row only changes when the owner saves, and
 * the page cleans up files that were uploaded but never saved.
 */
export default function ImageUpload({
  kind,
  value,
  businessId,
  businessName,
  onChange,
  onUploaded,
  onBusyChange,
}: {
  kind: 'logo' | 'cover'
  value: string
  businessId: string
  businessName: string
  onChange: (url: string) => void
  /** Storage path of a new upload, so the page can delete it if the change is discarded. */
  onUploaded: (path: string) => void
  /** True while a file is uploading, so the page can hold Save until it lands. */
  onBusyChange: (busy: boolean) => void
}) {
  const spec = SPEC[kind]
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // The URL that failed to load; a new value gets a fresh chance.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const broken = !!value && brokenUrl === value
  const setBroken = () => setBrokenUrl(value)
  const uploading = progress !== null
  const id = `upload-${kind}`

  useEffect(() => () => abortRef.current?.abort(), [])

  async function handle(file: File | undefined) {
    if (!file || uploading) return
    setError(null)
    setWarning(null)
    try {
      const { width, height } = await checkImage(file, spec.maxBytes)
      if (Math.min(width, height) < spec.minEdge && kind === 'logo')
        setWarning(`This image is only ${width} × ${height} px and may look blurry.`)
      if (kind === 'cover' && width < spec.minEdge)
        setWarning(`This image is only ${width} px wide and may look blurry on large screens.`)
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setProgress(0)
      onBusyChange(true)
      const { path, url } = await uploadPublicImage(BRANDING_BUCKET, businessId, kind, file, setProgress, ctrl.signal)
      onUploaded(path)
      onChange(url)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setWarning(null)
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      abortRef.current = null
      setProgress(null)
      onBusyChange(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files?.[0])
  }

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      if (!uploading) setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  }

  const pick = () => fileRef.current?.click()
  const hasImage = !!value && !broken

  const progressBar = uploading && (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/85 backdrop-blur-[1px]" aria-live="polite">
      <Loader2 size={18} className="animate-spin text-brand-600" aria-hidden />
      <div className="h-1.5 w-2/3 max-w-40 overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-neutral-600">Uploading… {Math.round(progress * 100)}%</span>
    </div>
  )

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {uploading ? (
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
        >
          <X size={14} aria-hidden /> Cancel upload
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={pick}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
          >
            {hasImage ? <RefreshCw size={14} aria-hidden /> : <ImageUp size={14} aria-hidden />}
            {hasImage ? 'Replace' : `Upload ${spec.label.toLowerCase()}`}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setError(null)
                setWarning(null)
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-neutral-500 outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
            >
              <Trash2 size={14} aria-hidden /> Remove
            </button>
          )}
        </>
      )}
    </div>
  )

  const messages = (
    <>
      {error ? (
        <p id={`${id}-msg`} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden /> {error}
        </p>
      ) : warning ? (
        <p id={`${id}-msg`} className="text-xs text-amber-700">{warning}</p>
      ) : broken ? (
        <p id={`${id}-msg`} className="text-xs text-amber-700">The current image link can't be loaded. Upload a new one.</p>
      ) : (
        <p id={`${id}-msg`} className="text-xs text-neutral-500">{spec.help}</p>
      )}
    </>
  )

  const fileInput = (
    <input
      ref={fileRef}
      id={id}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="sr-only"
      tabIndex={-1}
      aria-describedby={`${id}-msg`}
      onChange={(e) => handle(e.target.files?.[0])}
    />
  )

  if (kind === 'logo') {
    return (
      <div className="flex items-center gap-4" {...dropProps}>
        {fileInput}
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          aria-label={hasImage ? 'Replace logo' : 'Upload logo'}
          className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
            hasImage ? 'bg-white ring-1 ring-neutral-200' : 'border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
          } ${dragging ? '!ring-2 !ring-brand-500' : ''}`}
        >
          {hasImage ? (
            <img src={value} alt="" className="h-full w-full object-cover" onError={setBroken} />
          ) : businessName.trim() ? (
            <span className="text-neutral-500">{initials(businessName)}</span>
          ) : (
            <ImageUp size={22} aria-hidden />
          )}
          {progressBar}
        </button>
        <div className="min-w-0 space-y-1.5">
          {actions}
          {messages}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {fileInput}
      <div
        {...dropProps}
        className={`relative aspect-[3/1] w-full overflow-hidden rounded-xl transition ${
          hasImage ? 'bg-neutral-100' : 'border border-dashed border-neutral-300 bg-neutral-50'
        } ${dragging ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
      >
        {hasImage ? (
          <img src={value} alt="" className="h-full w-full object-cover" onError={setBroken} />
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center outline-none hover:bg-neutral-100/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
          >
            <ImageUp size={20} className="text-neutral-400" aria-hidden />
            <span className="text-sm font-medium text-neutral-700">Upload cover image</span>
            <span className="hidden text-xs text-neutral-500 sm:block">or drag and drop it here</span>
          </button>
        )}
        {progressBar}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{messages}</div>
        {(hasImage || value || uploading) && actions}
      </div>
    </div>
  )
}
