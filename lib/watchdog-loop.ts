import { runWatchdogTick } from './watchdog'

let started = false

export function startWatchdogLoop() {
  if (started) return
  if (process.env.VITEST === 'true') return
  if (process.env.SUITE_WATCHDOG === '0') return
  started = true
  const delay = 5 * 60 * 1000
  setTimeout(() => {
    void runWatchdogTick()
  }, 20_000)
  setInterval(() => {
    void runWatchdogTick()
  }, delay).unref?.()
}
