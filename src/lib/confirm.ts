import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' for actions that cannot be undone. */
  tone?: 'danger' | 'default'
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm>(async (o) => window.confirm(o.body ? `${o.title}\n\n${o.body}` : o.title))

/** `if (!(await confirm({ title: 'Cancel booking?', tone: 'danger' }))) return` — rendered by ConfirmProvider. */
export const useConfirm = () => useContext(ConfirmContext)
