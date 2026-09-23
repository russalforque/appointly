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
