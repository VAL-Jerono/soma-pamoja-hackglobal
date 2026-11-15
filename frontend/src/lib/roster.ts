/**
 * A private class list that lives only in the teacher's own browser.
 * Names and notes are never sent to the server. The server only ever sees pseudonymous codes like L-001.
 */
export type RosterEntry = { code: string; label: string; note: string; lastSeen: number }

export const ROSTER_KEY = 'sp_roster_v1'
export const MAX_LABEL = 40
export const MAX_NOTE = 400

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function parseRoster(raw: string | null | undefined): RosterEntry[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const out: RosterEntry[] = []
    for (const item of value) {
      const code = clean((item as RosterEntry)?.code, 12)
      if (!/^L-\d{3,6}$/.test(code) || seen.has(code)) continue
      seen.add(code)
      out.push({ code, label: clean(item.label, MAX_LABEL), note: clean(item.note, MAX_NOTE), lastSeen: Number.isFinite(item.lastSeen) ? item.lastSeen : 0 })
    }
    return out
  } catch {
    return []
  }
}

export function upsertLearner(roster: readonly RosterEntry[], entry: { code: string; label?: string; note?: string }, now = Date.now()): RosterEntry[] {
  const code = entry.code
  const existing = roster.find(item => item.code === code)
  const next: RosterEntry = {
    code,
    label: entry.label !== undefined ? clean(entry.label, MAX_LABEL) : existing?.label ?? '',
    note: entry.note !== undefined ? clean(entry.note, MAX_NOTE) : existing?.note ?? '',
    lastSeen: now
  }
  return existing ? roster.map(item => (item.code === code ? next : item)) : [...roster, next]
}

export const removeLearner = (roster: readonly RosterEntry[], code: string): RosterEntry[] => roster.filter(item => item.code !== code)

/** Display text for a learner: the teacher's private label when there is one, always with the code. */
export function learnerName(roster: readonly RosterEntry[], code: string): string {
  const entry = roster.find(item => item.code === code)
  return entry?.label ? `${entry.label} (${code})` : code
}
