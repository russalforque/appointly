import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type ShowToast = (message: string, tone?: ToastTone) => void

export const ToastContext = createContext<ShowToast>(() => {})

/** Brief confirmation after an action ("Hours saved", "Link copied"). Rendered by ToastProvider. */
export const useToast = () => useContext(ToastContext)
