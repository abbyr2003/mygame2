import { useEffect, useState } from 'react'

// The current time, refreshed on an interval so time-based labels stay fresh,
// and also right at `wakeAt` (e.g. a read receipt's moment) when it's in the future.
export function useNow(intervalMs = 60_000, wakeAt?: string): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  useEffect(() => {
    if (!wakeAt) return
    const delay = new Date(wakeAt).getTime() - Date.now()
    if (delay <= 0) {
      setNow(new Date())
      return
    }
    const id = setTimeout(() => setNow(new Date()), delay + 50)
    return () => clearTimeout(id)
  }, [wakeAt])
  return now
}
