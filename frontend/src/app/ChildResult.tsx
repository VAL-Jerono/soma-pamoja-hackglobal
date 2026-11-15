import type { AttemptResult } from '../api/types'
import { copy, type Lang } from '../i18n'

type ChildResultProps = {
  result: AttemptResult
  lang: Lang
  next: () => void
}

/**
 * Gentle, child-facing result. No scores, confidence, reason codes or error language.
 * Nothing here points a child at teacher tools. A teacher hears about unsure readings through the mark queue.
 */
export function ChildResult({ result, lang, next }: ChildResultProps) {
  const t = copy[lang]
  if (result.deferred) {
    return (
      <div className="result defer" role="status">
        <h3>{t.handover}</h3>
        <p>{t.handoverNote}</p>
        <div className="actions"><button className="primary" onClick={next}>{t.next}</button></div>
      </div>
    )
  }
  const good = result.verdict === 'auto_ok'
  return (
    <div className="result" role="status">
      <h3>{good ? t.great : t.practice}</h3>
      <p>{good ? t.readTogether : t.readAgain}</p>
      <div className="actions"><button className="primary" onClick={next}>{t.next}</button></div>
    </div>
  )
}
