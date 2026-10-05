export const input =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15'
export const btn =
  'rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50'
export const btnGhost =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2'
export const card = 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-neutral-900/[0.04]'

export const panel = 'rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm shadow-neutral-900/[0.04]'

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-brand-600/25 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50'

/**
 * Action buttons for bars, sheets and empty states: a 44px thumb target on phones, the compact
 * desktop size from sm up. One primary per screen; secondary and danger sit beside it.
 */
const action =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:rounded-lg sm:px-3.5'
export const actionPrimary = `${action} bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 active:bg-brand-800`
export const actionSecondary = `${action} border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100`
export const actionDanger = `${action} border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100`
/** The final "yes, do it" of a destructive confirmation — never a page's everyday button. */
export const actionDangerSolid = `${action} bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700 active:bg-red-800`

/** WCAG relative luminance of a '#rrggbb' color. */
function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1–21) between two '#rrggbb' colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const [lA, lB] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a)
  return (lA + 0.05) / (lB + 0.05)
}
