import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...props }, ref) => (
    // min-w-0/max-w-full let it shrink inside a flex row: a native <select> is as wide as its
    // longest option, so one long staff name used to push the page sideways on a phone.
    <div className="relative min-w-0 max-w-full">
      <select ref={ref} {...props} className={`max-w-full cursor-pointer appearance-none !pr-8 ${className}`} />
      <ChevronDown
        size={15}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
      />
    </div>
  ),
)
Select.displayName = 'Select'

export default Select
