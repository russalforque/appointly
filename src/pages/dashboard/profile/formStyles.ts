import { input } from '../../../lib/ui'

/** Single-line inputs get a 44px touch target on phones, desktop sizing from sm up. */
export const fieldCls = (invalid?: boolean) =>
  `${input} h-11 sm:h-10 ${invalid ? '!border-red-400 focus:!border-red-500 focus:!ring-red-500/15' : ''}`
export const areaCls = (invalid?: boolean) =>
  `${input} block resize-y leading-relaxed ${invalid ? '!border-red-400 focus:!border-red-500 focus:!ring-red-500/15' : ''}`

/** aria wiring for a control inside FormField. */
export const describe = (id: string, error?: string, hasMsg = true) => ({
  id,
  'aria-invalid': !!error || undefined,
  'aria-describedby': error || hasMsg ? `${id}-msg` : undefined,
})
