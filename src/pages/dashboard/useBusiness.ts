import { useOutletContext } from 'react-router-dom'
import type { Business } from '../../lib/types'

export const useBusiness = () => useOutletContext<{ business: Business; timezone: string; reload: () => void }>()
