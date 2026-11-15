import { copy, type Lang } from '../i18n'

type KindLike = { kind?: string; status?: number }

export const errorKind = (error: unknown): string => (error as KindLike | null)?.kind ?? 'Unknown'

/** FastAPI returns a string for most errors but a list of objects for 422 validation errors. */
export function detailText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map(item => (typeof item === 'string' ? item : (item as { msg?: unknown } | null)?.msg))
      .filter((part): part is string => typeof part === 'string')
    return parts.length ? parts.join('; ') : fallback
  }
  return fallback
}

/** Child-safe message. Never exposes API detail strings, status codes or reason codes. */
export function childErrorMessage(error: unknown, lang: Lang): string {
  const t = copy[lang]
  switch (errorKind(error)) {
    case 'Offline': return t.offline
    case 'Timeout': return t.slowConnection
    case 'RateLimited': return t.tryLater
    case 'EmptyBank':
    case 'NotServed': return t.noActivity
    default: return t.tryAgain
  }
}

/** PIN gate message. Keeps a wrong PIN, a lockout, a missing server setting and a connection failure apart. */
export function pinErrorMessage(error: unknown): string {
  const status = (error as KindLike | null)?.status
  if (status === 401) return 'That PIN was not accepted. Nothing was opened.'
  if (status === 429) return 'Too many wrong attempts. Wait a few minutes, then try again.'
  if (status === 503) return 'Facilitator protection is not configured on this backend.'
  return 'The backend could not be reached. Check the connection and try again.'
}

export const isUnauthorized = (error: unknown): boolean => errorKind(error) === 'Unauthorized'

/** Facilitator-facing message. Raw API detail strings such as facilitator_auth_required are never shown. */
export function facilitatorErrorMessage(error: unknown, fallback: string): string {
  switch (errorKind(error)) {
    case 'Unauthorized': return 'Your facilitator session has ended. Enter the PIN again.'
    case 'Offline': return 'No connection to the server. Nothing was changed.'
    case 'Timeout': return 'The server took too long to answer. Try again.'
    case 'RateLimited': return 'Too many requests. Wait a moment and try again.'
    default: return fallback
  }
}
