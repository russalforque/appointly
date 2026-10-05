import { Search, X } from 'lucide-react'

/** Rounded search input with a clear button: 44px tall on phones, compact from sm up. */
export default function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search size={17} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-10 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 sm:h-9 sm:rounded-lg sm:pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 outline-none transition-colors hover:text-neutral-900 active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-7 sm:w-7"
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
