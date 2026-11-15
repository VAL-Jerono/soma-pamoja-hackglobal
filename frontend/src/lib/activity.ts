import type { Verdict } from '../api/types'

/** Picture options can arrive as strings or as objects. Always return display text, never [object Object]. */
export function optionText(option: unknown): string {
  if (typeof option === 'string') return option
  if (option && typeof option === 'object') {
    const value = option as Record<string, unknown>
    return String(value.label ?? value.text ?? value.value ?? '')
  }
  return String(option ?? '')
}

/**
 * Relays the server's own verdict from /api/attempt to the activity event.
 * The child runner never computes correctness itself, because answer keys are facilitator-only.
 */
export function machineResultFor(verdict: Verdict): 'auto_correct' | 'auto_practice' | 'deferred' {
  return verdict === 'auto_ok' ? 'auto_correct' : verdict === 'auto_practice' ? 'auto_practice' : 'deferred'
}

/** One session id per child runner visit, so activity events from one sitting group together. */
export function newChildSessionId(now: number = Date.now(), random: number = Math.random()): string {
  return `child-${now.toString(36)}-${random.toString(36).slice(2, 8)}`
}
