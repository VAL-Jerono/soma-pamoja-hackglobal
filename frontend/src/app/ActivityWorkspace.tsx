import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { activityProgress, activityQueue, guideSearch, listActivities, login, markActivity, respondActivity } from '../api/client'
import type { Activity, ActivityModality, ActivityProgress, ActivityQueue, AttemptResult, GuideResult, TeacherResult } from '../api/types'
import { copy, type Lang } from '../i18n'
import { machineResultFor, newChildSessionId, optionText } from '../lib/activity'
import { childErrorMessage, facilitatorErrorMessage, isUnauthorized, pinErrorMessage } from '../lib/errors'
import { speakKiswahili } from '../lib/speech'
import { readSession, removeSession, writeSession } from '../lib/storage'
import { isLearnerCode, normalizeLearnerInput } from '../lib/validation'
import { ChildResult } from './ChildResult'
import { Recorder } from './Recorder'

type RouteName = 'welcome' | 'session' | 'facilitator' | 'activities'
type Tab = 'plan' | 'run' | 'mark' | 'progress' | 'guide' | 'reading'
const modalities: ActivityModality[] = ['reading', 'listening', 'speaking', 'writing']
const labels: Record<Tab, string> = { plan: 'Plan', run: 'Run', mark: 'Mark', progress: 'Progress', guide: 'Guide', reading: 'Reading desk' }
const modalityLabels: Record<ActivityModality, string> = { reading: 'Reading', listening: 'Listening', speaking: 'Speaking', writing: 'Writing' }
// Child-facing modality names. The Kiswahili names need native-speaker review.
const childModalityLabels: Record<Lang, Record<ActivityModality, string>> = {
  en: modalityLabels,
  sw: { reading: 'Kusoma', listening: 'Kusikiliza', speaking: 'Kuzungumza', writing: 'Kuandika' }
}
// Honest, facilitator-facing description of how each modality really works today.
const modalityHelp: Record<ActivityModality, string> = {
  reading: 'The child reads the sentence, then taps the picture that fits. Your mark confirms the response.',
  listening: 'The child hears the sentence from the browser voice and taps the picture. If the device has no Kiswahili voice, read the sentence aloud yourself. There is no recorded audio file yet.',
  speaking: 'The child reads aloud into the microphone. If the machine is unsure, it defers to you. Audio is not stored.',
  writing: 'Paper handoff. The child writes on paper and taps finished. You mark the paper. The app does not read handwriting.'
}

function DraftBadge() { return <span className="pill draft">Draft · human review pending</span> }
const formatWhen = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString() }

export function ChildActivityRunner({ go, lang }: { go: (route: RouteName) => void; lang: Lang }) {
  const t = copy[lang]
  const [learner, setLearner] = useState(() => readSession('sp_learner', 'L-001'))
  const [activities, setActivities] = useState<Activity[]>([])
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(false)
  const [speech, setSpeech] = useState<AttemptResult | null>(null)
  const [voiceNote, setVoiceNote] = useState('')
  const [sessionId] = useState(() => newChildSessionId())
  const selected = activities[index] ?? null

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      writeSession('sp_learner', learner)
      const data = await listActivities(learner)
      setActivities(data.activities)
      setIndex(0)
      setDone(false)
      setFinished(false)
      setSpeech(null)
      setVoiceNote('')
      if (!data.activities.length) setMessage(t.noActivity)
    } catch (e) {
      setMessage(childErrorMessage(e, lang))
    } finally {
      setLoading(false)
    }
  }

  // The child screen never judges a response itself. Answer keys stay on the facilitator side,
  // so picture and paper responses go to the facilitator as deferred, and speech relays the server verdict.
  const record = async (response: string, machine: 'auto_correct' | 'auto_practice' | 'deferred') => {
    if (!selected) return
    setLoading(true)
    setMessage('')
    try {
      await respondActivity({ learner, activity_id: selected.activity_id, response, machine_result: machine, session_id: sessionId })
      setDone(true)
    } catch (e) {
      setMessage(childErrorMessage(e, lang))
    } finally {
      setLoading(false)
    }
  }
  const saveSpeech = async (result: AttemptResult) => {
    setSpeech(result)
    await record(result.heard, machineResultFor(result.verdict))
  }
  // Moving on always clears the previous saved notice, voice note and speech result.
  const advance = () => {
    setMessage('')
    setDone(false)
    setSpeech(null)
    setVoiceNote('')
    if (index + 1 >= activities.length) setFinished(true)
    else setIndex(index + 1)
  }
  const listen = () => { if (selected) setVoiceNote(speakKiswahili(selected.parent_text) ? t.browserVoice : t.noVoice) }

  return (
    <main>
      <div className="screen">
        <div className="split">
          <div>
            <div className="eyebrow">{t.childMode}</div>
            <h2 className="section-title">Soma Pamoja</h2>
          </div>
          <button className="secondary" onClick={() => go('facilitator')}>{t.facilitator}</button>
        </div>

        {!activities.length && (
          <div className="card">
            <div className="field">
              <label htmlFor="activity-learner">{t.code}</label>
              <input id="activity-learner" inputMode="text" autoComplete="off" value={learner} onChange={e => setLearner(normalizeLearnerInput(e.target.value))} onKeyDown={e => { if (e.key === 'Enter' && isLearnerCode(learner) && !loading) load() }} placeholder="L-001" />
              <span className="muted">{t.codeHint}</span>
            </div>
            <button className="primary big-action" disabled={loading || !isLearnerCode(learner)} onClick={load}>{loading ? t.loading : t.startActivity}</button>
            <p className="muted">{t.oneStep}</p>
            {message && <p className="notice" role="alert">{message}</p>}
          </div>
        )}

        {activities.length > 0 && finished && (
          <div className="card">
            <div className="result" role="status">
              <h3>{t.allDone}</h3>
              <div className="actions"><button className="primary" onClick={() => go('welcome')}>{t.home}</button></div>
            </div>
          </div>
        )}

        {selected && !finished && (
          <div className="session-layout">
            <div className="stage"><div className="picture">{selected.modality === 'listening' ? '🔊' : selected.picture || '📖'}</div></div>
            <div>
              <span className="pill">{childModalityLabels[lang][selected.modality]}</span>
              {selected.modality === 'listening'
                ? <h2 className="sentence">{selected.prompt_text}</h2>
                : <><h2 className="sentence">{selected.parent_text}</h2><p className="gloss">{selected.prompt_text}</p></>}

              {selected.modality === 'speaking' && (
                <div className="card">
                  <Recorder key={selected.activity_id} learner={learner} passage={selected.micro_item_id} lang={lang} onResult={saveSpeech} />
                  <p className="notice">{t.audioNotice}</p>
                </div>
              )}

              {selected.modality === 'writing' && (
                <div className="card">
                  <p className="muted">{t.writeOnPaper}</p>
                  <button className="primary big-action" disabled={loading || done} onClick={() => record('paper_handoff', 'deferred')}>{t.finished}</button>
                </div>
              )}

              {(selected.modality === 'reading' || selected.modality === 'listening') && (
                <div>
                  {selected.modality === 'listening' && <div className="actions"><button className="secondary" onClick={listen}>{t.listen}</button></div>}
                  {voiceNote && <p className="notice" role="status">{voiceNote}</p>}
                  <p className="muted">{t.chooseFits}</p>
                  <div className="choice-row" role="group" aria-label={t.chooseFits}>
                    {(selected.options ?? []).map((option, i) => {
                      const text = optionText(option)
                      return <button className="choice" key={`${i}-${text}`} disabled={loading || done} onClick={() => record(text, 'deferred')}>{text}</button>
                    })}
                  </div>
                </div>
              )}

              {done && selected.modality === 'speaking' && speech && <ChildResult result={speech} lang={lang} next={advance} onFacilitator={() => go('facilitator')} />}
              {done && selected.modality !== 'speaking' && (
                <div className="result" role="status">
                  <h3>{t.saved}</h3>
                  <p>{t.savedNote}</p>
                  <button className="primary" onClick={advance}>{t.next}</button>
                </div>
              )}
              {message && !done && (
                <div className="notice" role="alert">
                  <p>{message}</p>
                  {speech && <button className="secondary" onClick={() => saveSpeech(speech)}>{t.retry}</button>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function PinGate({ onToken, notice }: { onToken: (token: string) => void; notice?: string }) {
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const unlock = async () => {
    if (!pin) return
    setBusy(true)
    setMessage('')
    try {
      const result = await login(pin)
      writeSession('sp_facilitator_token', result.token)
      onToken(result.token)
    } catch (e) {
      setMessage(pinErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card">
      <div className="eyebrow">Facilitator mode</div>
      <h2 className="section-title">Facilitator workspace</h2>
      <p className="muted">Plan, mark, and guide tools are protected behind the facilitator PIN.</p>
      <div className="field">
        <label htmlFor="workspace-pin">Facilitator PIN</label>
        <input id="workspace-pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') unlock() }} />
      </div>
      <button className="warm" disabled={busy || !pin} onClick={unlock}>{busy ? 'Opening...' : 'Open workspace'}</button>
      {(message || notice) && <p className="notice" role="alert">{message || notice}</p>}
    </div>
  )
}

export function FacilitatorWorkspace({ go, reading }: { go: (route: RouteName) => void; reading?: ReactNode }) {
  const [token, setToken] = useState(() => readSession('sp_facilitator_token'))
  const [tab, setTab] = useState<Tab>('plan')
  const [learner, setLearner] = useState(() => readSession('sp_learner', 'L-001'))
  const [activities, setActivities] = useState<Activity[]>([])
  const [selected, setSelected] = useState<Activity | null>(null)
  const [queue, setQueue] = useState<ActivityQueue | null>(null)
  const [progress, setProgress] = useState<ActivityProgress | null>(null)
  const [guide, setGuide] = useState<GuideResult | null>(null)
  const [query, setQuery] = useState('How may teachers use formative reading assessment?')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalityFilter, setModalityFilter] = useState<ActivityModality | null>(null)
  // Filtering returns a new array. The loaded plan and its counts are never changed by a filter.
  const visibleActivities = useMemo(() => modalityFilter ? activities.filter(item => item.modality === modalityFilter) : activities, [activities, modalityFilter])
  const toggleFilter = (modality: ActivityModality) => setModalityFilter(current => current === modality ? null : modality)

  const lock = (reason = '') => { removeSession('sp_facilitator_token'); setToken(''); setTab('plan'); setMessage(reason) }
  // An expired token sends the facilitator back to the PIN gate with a clear reason. Raw API detail is never shown.
  const fail = (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) { lock(facilitatorErrorMessage(error, fallback)); return }
    setMessage(facilitatorErrorMessage(error, fallback))
  }

  const loadPlan = async () => {
    if (!isLearnerCode(learner)) { setMessage('Enter a learner code like L-001.'); return }
    setLoading(true)
    setMessage('')
    try {
      const data = await listActivities(learner)
      writeSession('sp_learner', learner)
      setActivities(data.activities)
      setSelected(data.activities[0] || null)
      setModalityFilter(null)
    } catch (e) {
      fail(e, 'Plan unavailable.')
    } finally {
      setLoading(false)
    }
  }
  const loadQueue = async () => { if (!token) return; try { setQueue(await activityQueue(token)) } catch (e) { fail(e, 'Mark queue unavailable.') } }
  const loadProgress = async () => { try { setProgress(await activityProgress(learner)) } catch (e) { fail(e, 'Progress unavailable.') } }
  useEffect(() => { if (token) loadPlan() }, [token])
  useEffect(() => { if (tab === 'mark') loadQueue(); if (tab === 'progress') loadProgress() }, [tab, learner])
  if (!token) return <main><div className="screen"><PinGate onToken={setToken} notice={message} /><button className="link-btn" onClick={() => go('welcome')}>← Home</button></div></main>

  const mark = async (eventId: string, result: TeacherResult) => {
    try {
      await markActivity(eventId, result, token)
      setMessage('Teacher mark saved.')
      await loadQueue()
      await loadProgress()
    } catch (e) {
      fail(e, 'Mark was not saved.')
    }
  }
  const searchGuide = async () => {
    if (!query.trim()) return
    try { setGuide(await guideSearch(query, token)); setMessage('') } catch (e) { fail(e, 'Guide unavailable.') }
  }
  const showing = modalityFilter
    ? `Showing ${modalityLabels[modalityFilter]} only (${visibleActivities.length} of ${activities.length})`
    : `Showing all ${activities.length} activities`

  return (
    <main>
      <div className="screen workspace">
        <div className="split">
          <div>
            <div className="eyebrow">Facilitator workspace</div>
            <h2 className="section-title">Soma Pamoja</h2>
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => lock()}>Lock</button>
            <button className="secondary" onClick={() => go('activities')}>Child preview</button>
          </div>
        </div>
        <div className="workspace-tabs" role="tablist">
          {(Object.keys(labels) as Tab[]).map(item => <button key={item} className={tab === item ? 'warm' : 'secondary'} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>{labels[item]}</button>)}
        </div>

        {tab === 'plan' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">01 · Plan</span><h3 className="section-title">Choose the next small step</h3></div>
              <DraftBadge />
            </div>
            <div className="field">
              <label htmlFor="plan-learner">Learner</label>
              <input id="plan-learner" autoComplete="off" value={learner} onChange={e => setLearner(normalizeLearnerInput(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') loadPlan() }} />
            </div>
            <div className="modality-grid" role="group" aria-label="Filter by modality">
              {modalities.map(modality => (
                <button className={modalityFilter === modality ? 'modality-card selected' : 'modality-card'} key={modality} aria-pressed={modalityFilter === modality} onClick={() => toggleFilter(modality)}>
                  <span>{modalityLabels[modality]}</span>
                  <b>{activities.filter(item => item.modality === modality).length}</b>
                  <small>draft activities</small>
                </button>
              ))}
            </div>
            <div className="split">
              <span className="muted" role="status">{showing}</span>
              {modalityFilter && <button className="link-btn" onClick={() => setModalityFilter(null)}>Show all</button>}
            </div>
            <div className="activity-list">
              {visibleActivities.map(item => (
                <button key={item.activity_id} className="activity-row" onClick={() => { setSelected(item); setTab('run') }}>
                  <span>{item.picture}</span><b>{item.activity_id}</b><span>{modalityLabels[item.modality]}</span><small>{item.topic}</small>
                </button>
              ))}
            </div>
            {!visibleActivities.length && <p className="notice">No activities to show. Check the learner code, then refresh the plan.</p>}
            <button className="warm" style={{ marginTop: '1rem' }} disabled={loading || !isLearnerCode(learner)} onClick={loadPlan}>{loading ? 'Loading...' : 'Refresh plan'}</button>
          </section>
        )}

        {tab === 'run' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">02 · Run</span><h3 className="section-title">One activity, one response</h3></div>
              {selected && <span className="pill">{modalityLabels[selected.modality]}</span>}
            </div>
            {selected ? (
              <>
                <DraftBadge />
                <div className="run-card">
                  <div className="run-picture">{selected.picture || '📖'}</div>
                  <div>
                    <h3>{selected.prompt_text}</h3>
                    <p className="muted">{selected.parent_text}</p>
                    <p className="muted">{modalityHelp[selected.modality]}</p>
                    <p className="muted">Machine evidence and teacher judgement remain separate.</p>
                    <button className="primary" onClick={() => go('activities')}>Open child runner</button>
                  </div>
                </div>
                <div className="split">
                  <span className="muted" role="status">{showing}</span>
                  {modalityFilter && <button className="link-btn" onClick={() => setModalityFilter(null)}>Show all</button>}
                </div>
                <div className="activity-list">
                  {visibleActivities.map(item => (
                    <button key={item.activity_id} className={selected.activity_id === item.activity_id ? 'activity-row selected' : 'activity-row'} onClick={() => setSelected(item)}>
                      <span>{item.picture}</span><b>{item.activity_id}</b><span>{modalityLabels[item.modality]}</span><small>{item.topic}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : <p className="notice">No activities loaded. Open Plan and refresh.</p>}
          </section>
        )}

        {tab === 'mark' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">03 · Mark</span><h3 className="section-title">Needs your mark</h3></div>
              <span className="pill">{queue?.events.length ?? 0} waiting</span>
            </div>
            {queue?.events.length ? queue.events.map(event => {
              const activity = activities.find(item => item.activity_id === event.activity_id)
              return (
                <div className="queue-card" key={event.event_id}>
                  <div className="split"><b>{event.activity_id}</b><span className="pill">{modalityLabels[event.modality] ?? event.modality}</span></div>
                  {activity && <p><span aria-hidden="true">{activity.picture} </span>{activity.parent_text}</p>}
                  <p className="muted">{event.learner} · machine: {event.machine_result}{event.created_at ? ` · ${formatWhen(event.created_at)}` : ''}</p>
                  <div className="actions">
                    {(['correct', 'with_help', 'not_yet', 'not_sure'] as TeacherResult[]).map(result => <button className="secondary" key={result} onClick={() => mark(event.event_id, result)}>{result.replace('_', ' ')}</button>)}
                  </div>
                </div>
              )
            }) : (
              <div className="empty-state">
                <b>No unresolved events.</b>
                <p className="muted">Picture responses, deferred speech and paper writing evidence will appear here.</p>
              </div>
            )}
          </section>
        )}

        {tab === 'progress' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">04 · Progress</span><h3 className="section-title">Small evidence, visible growth</h3></div>
              <span className="pill">{learner}</span>
            </div>
            {progress?.by_modality.map(row => (
              <div className="progress-row" key={row.modality}>
                <div className="split"><b>{modalityLabels[row.modality] ?? row.modality}</b><span>{row.marked} marked / {row.events} events</span></div>
                <div className="bar"><i style={{ width: `${row.events ? Math.min(100, row.marked / row.events * 100) : 0}%` }} /></div>
              </div>
            ))}
            {!progress?.by_modality.length && <p className="notice">No activity evidence yet.</p>}
          </section>
        )}

        {tab === 'guide' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">05 · Guide</span><h3 className="section-title">Cited teacher guidance</h3></div>
              <span className="pill">BM25 · extractive</span>
            </div>
            <div className="field">
              <label htmlFor="guide-query">Ask a teacher question</label>
              <input id="guide-query" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchGuide() }} />
            </div>
            <button className="warm" disabled={!query.trim()} onClick={searchGuide}>Search guide</button>
            {guide && (
              <div className="guide-answer">
                <span className="pill">{guide.citation_status}</span>
                <p>{guide.answer}</p>
                {guide.citation && <p className="citation"><b>{guide.citation}</b><br />{guide.source_url && <a href={guide.source_url} target="_blank" rel="noreferrer">Open official source</a>}</p>}
              </div>
            )}
          </section>
        )}

        {tab === 'reading' && <section className="workspace-panel">{reading}</section>}
        {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
      </div>
    </main>
  )
}
