import { useEffect, useState } from 'react'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Counts a number up from zero once it arrives, so KPI values feel alive on load. */
export function useCountUp(target: number, duration = 620): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0)
      return
    }
    if (prefersReducedMotion() || target === 0) {
      setValue(target)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return value
}
