import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

/**
 * Shown where a Business-plan feature would be. Deliberately quiet: it explains what the
 * control does and where to get it, without nagging.
 */
export default function UpgradeNotice({ feature, planName = 'Business' }: { feature: string; planName?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white text-neutral-400 shadow-sm">
        <Lock size={13} strokeWidth={2} />
      </span>
      <p className="min-w-0 text-sm text-neutral-600">
        {feature} {feature.endsWith('s') ? 'are' : 'is'} part of the {planName} plan.{' '}
        <Link
          to="/dashboard/billing"
          className="font-semibold text-brand-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          Upgrade
        </Link>{' '}
        to turn {feature.endsWith('s') ? 'them' : 'it'} on.
      </p>
    </div>
  )
}
