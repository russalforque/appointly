import type { ReactNode } from 'react'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { actionPrimary, actionSecondary } from '../lib/ui'
import PageHeader from './PageHeader'
import SaveBar from './SaveBar'
import { ErrorText } from './Status'

/**
 * Header for an edit-then-save settings page. Desktop: a sticky bar that keeps Save and Discard
 * in view down the whole form. Phones: a plain title that scrolls away, with the actions in the
 * contextual SaveBar instead. Success is announced by the caller's toast.
 */
export default function SettingsHeader({
  title,
  subtitle,
  form,
  dirty,
  saving,
  error,
  onDiscard,
  status,
  canSave = true,
}: {
  title: string
  subtitle: string
  /** id of the <form> the Save buttons submit. */
  form: string
  dirty: boolean
  saving: boolean
  error: string | null
  onDiscard: () => void
  /** Save-state indicator (Unsaved / Saved / Failed). Replaces the default "Unsaved" chip on phones. */
  status?: ReactNode
  /** False blocks Save even with edits — e.g. while an upload is still running. */
  canSave?: boolean
}) {
  return (
    <>
      <div className="sticky top-14 z-10 -mx-6 hidden flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 bg-neutral-50/95 px-6 py-4 backdrop-blur md:flex xl:-mx-8 xl:px-8">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status}
          <ErrorText message={error} />
          {dirty && !saving && (
            <button type="button" onClick={onDiscard} className={actionSecondary}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden /> Discard
            </button>
          )}
          <button form={form} className={actionPrimary} disabled={saving || !dirty || !canSave}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} strokeWidth={2} aria-hidden />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="md:hidden">
        <PageHeader
          title={title}
          subtitle={subtitle}
          aside={
            status ??
            (dirty && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Unsaved
              </span>
            ))
          }
        />
        {/* The subtitle is hidden on phones by PageHeader; these pages explain abstract settings, so keep it */}
        <p className="mt-1 text-sm text-neutral-500 sm:hidden">{subtitle}</p>
      </div>

      <SaveBar show={dirty} saving={saving} error={error} form={form} onDiscard={onDiscard} canSave={dirty && canSave} />
    </>
  )
}
