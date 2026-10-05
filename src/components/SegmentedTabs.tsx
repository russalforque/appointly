export interface Segment<T extends string> {
  value: T
  label: string
  /** Shown beside the label so the effect of a filter is known before it is tapped. */
  count?: number
}

/**
 * Pill segmented control for list filters. Scrolls sideways when it outgrows a phone instead of
 * wrapping into a second row; each segment is a 40px target.
 */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: Segment<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={`no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <div role="group" aria-label={label} className="flex w-max items-center gap-1 rounded-xl bg-neutral-100 p-1 sm:rounded-full">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-8 sm:rounded-full ${
                on ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {o.label}
              {o.count !== undefined && (
                <span className={`text-xs tabular-nums ${on ? 'text-brand-600' : 'text-neutral-400'}`}>{o.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
