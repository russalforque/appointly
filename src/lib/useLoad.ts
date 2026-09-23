import { useCallback, useEffect, useState } from 'react'

type State<T> = { fn: unknown; data: T | null; error: string | null }

/** Runs a memoized (useCallback) loader; `loading` is true until it settles. reload() keeps old data. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ fn: null, data: null, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fn()
      .then((data) => !cancelled && setState({ fn, data, error: null }))
      .catch((e: unknown) =>
        !cancelled && setState({ fn, data: null, error: e instanceof Error ? e.message : 'Something went wrong' }),
      )
    return () => {
      cancelled = true
    }
  }, [fn, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data: state.data, error: state.error, loading: state.fn !== fn, reload }
}
