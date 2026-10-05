import { Loader2, RotateCcw, Save } from 'lucide-react'
import { actionPrimary, actionSecondary } from '../lib/ui'

/**
 * Phones: a contextual save bar that slides over the tab bar while there are unsaved edits, so
 * Save is always one thumb-reach away and leaving mid-edit means choosing Discard on purpose.
 * Hidden from md up, where each page keeps its actions in its sticky header.
 */
export default function SaveBar({
  show,
  saving,
  error,
  form,
  onDiscard,
  canSave = true,
}: {
  show: boolean
  saving: boolean
  error?: string | null
  /** id of the <form> the Save button submits. */
  form: string
  onDiscard: () => void
  canSave?: boolean
}) {
  const visible = show || saving
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-200 ease-out md:hidden ${
        visible ? 'translate-y-0 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]' : 'pointer-events-none translate-y-full'
      }`}
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDiscard} disabled={saving} className={`${actionSecondary} flex-none`}>
          <RotateCcw size={15} strokeWidth={2} aria-hidden /> Discard
        </button>
        <button form={form} disabled={saving || !canSave} className={`${actionPrimary} flex-1`}>
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} strokeWidth={2} aria-hidden />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
