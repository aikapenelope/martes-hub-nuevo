import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Hook del bloque efferd, reescrito con useSyncExternalStore: sin setState
 * sincrónico dentro del effect (regla del React Compiler lint).
 */
export function useIsMobile() {
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const isMobile = React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )

  return isMobile
}
