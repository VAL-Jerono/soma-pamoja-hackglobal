import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { activityProgress, activityQueue, guideSearch, listActivities, login, markActivity } from '../api/client'
import type { Activity, ActivityModality, ActivityProgress, ActivityQueue, GuideResult, TeacherResult } from '../api/types'
import { copy, type Lang } from '../i18n'
import { facilitatorErrorMessage, isUnauthorized, pinErrorMessage } from '../lib/errors'
import { learnerName, parseRoster, removeLearner, ROSTER_KEY, upsertLearner, MAX_LABEL, type RosterEntry } from '../lib/roster'
import { readPreference, readSession, removeSession, writePreference, writeSession } from '../lib/storage'
import { isLearnerCode, normalizeLearnerInput } from '../lib/validation'
import { Scene } from './Scene'

type RouteName = 'welcome' | 'session' | 'facilitator' | 'activities'
type Tab = 'plan' | 'run' | 'mark' | 'progress' | 'guide' | 'reading'
const modalities: ActivityModality[] = ['reading', 'listening', 'speaking', 'writing']
const labels: Record<Tab, string> = { plan: 'Plan', run: 'Run', mark: 'Mark', progress: 'Progress', guide: 'Guide', reading: 'Reading desk' }
const modalityLabels: Record<ActivityModality, string> = { reading: 'Reading', listening: 'Listening', speaking: 'Speaking', writing: 'Writing' }
const modalityEmoji: Record<ActivityModality, string> = { reading: '👀', listening: '👂', speaking: '🎤', writing: '✍️' }
const tabInfo: Record<Tab, { emoji: string; sub: string; help: string }> = {
  plan: { emoji: '🗂️', sub: 'Choose', help: 'Choose who is learning and which activity comes next. Your private class list is kept on this device only.' },
  run: { emoji: '▶️', sub: 'Deliver', help: 'Look at one activity, then open it for the learner. Machine evidence and your judgement stay separate.' },
  mark: { emoji: '✅', sub: 'Check work', help: 'Picture answers, written work and unsure speech wait here for your mark.' },
  progress: { emoji: '📈', sub: 'Follow', help: 'See how each learner is doing across reading, listening, speaking and writing. This is evidence, not a grade.' },
  guide: { emoji: '📚', sub: 'Get help', help: 'Ask a question about teaching early reading. Answers are quoted from a small, checked set of sources.' },
  reading: { emoji: '🎧', sub: 'Review reading', help: 'Listen to a child read, check what the machine heard, and record understanding separately.' }
}
const machineText = (value: string) => value === 'deferred' ? 'needs your judgement' : value === 'auto_correct' ? 'machine: sounded right' : value === 'auto_practice' ? 'machine: needs practice' : value
const resultText: Record<TeacherResult, string> = { correct: 'Correct', with_help: 'With help', not_yet: 'Not yet', not_sure: 'Not sure' }
// Honest, facilitator-facing description of how each modality really works today.
const modalityHelp: Record<ActivityModality, string> = {
  reading: 'The child reads the sentence, then taps the picture that fits. Your mark confirms the response.',
  listening: 'The child hears the sentence from the browser voice and taps the picture. If the device has no Kiswahili voice, read the sentence aloud yourself. There is no recorded audio file yet.',
  speaking: 'The child reads aloud into the microphone. If the machine is unsure, it defers to you. Audio is not stored.',
  writing: 'The child types the word, or writes in an exercise book and taps finished. You mark it. The app does not read handwriting.'
}

function DraftBadge() { return <span className="pill draft">Draft · human review pending</span> }
const formatWhen = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString() }

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

export function FacilitatorWorkspace({ go, reading, lang }: { go: (route: RouteName) => void; reading?: ReactNode; lang: Lang }) {
  const t = copy[lang]
  const [token, setToken] = useState(() => readSession('sp_facilitator_token'))
  const [tab, setTab] = useState<Tab>('plan')
  const [roster, setRoster] = useState<RosterEntry[]>(() => parseRoster(readPreference(ROSTER_KEY)))
  const [learner, setLearner] = useState(() => readSession('sp_learner') || readPreference('sp_last_learner') || parseRoster(readPreference(ROSTER_KEY))[0]?.code || 'L-001')
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [activities, setActivities] = useState<Activity[]>([])
  const [selected, setSelected] = useState<Activity | null>(null)
  const [queue, setQueue] = useState<ActivityQueue | null>(null)
  const [progress, setProgress] = useState<ActivityProgress | null>(null)
  const [classRows, setClassRows] = useState<Record<string, ActivityProgress | null>>({})
  const [guide, setGuide] = useState<GuideResult | null>(null)
  const [query, setQuery] = useState('How may teachers use formative reading assessment?')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalityFilter, setModalityFilter] = useState<ActivityModality | null>(null)
  // Filtering returns a new array. The loaded plan and its counts are never changed by a filter.
  const visibleActivities = useMemo(() => modalityFilter ? activities.filter(item => item.modality === modalityFilter) : activities, [activities, modalityFilter])
  const toggleFilter = (modality: ActivityModality) => setModalityFilter(current => current === modality ? null : modality)
  const current = roster.find(item => item.code === learner)

  // The class list stays on this device so it outlives the browser session. It never reaches the server.
  const saveRoster = (next: RosterEntry[]) => { setRoster(next); writePreference(ROSTER_KEY, JSON.stringify(next)) }
  const lock = (reason = '') => { removeSession('sp_facilitator_token'); setToken(''); setTab('plan'); setMessage(reason) }
  // An expired token sends the teacher back to the PIN gate with a clear reason. Raw API detail is never shown.
  const fail = (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) { lock(facilitatorErrorMessage(error, fallback)); return }
    setMessage(facilitatorErrorMessage(error, fallback))
  }

  const loadPlan = async (code = learner) => {
    if (!isLearnerCode(code)) { setMessage('Enter a learner code like L-001.'); return }
    setLoading(true)
    setMessage('')
    try {
      const data = await listActivities(code)
      writeSession('sp_learner', code)
      writePreference('sp_last_learner', code)
      if (roster.some(item => item.code === code)) saveRoster(upsertLearner(roster, { code }))
      setLearner(code)
      setActivities(data.activities)
      setSelected(data.activities[0] || null)
      setModalityFilter(null)
    } catch (e) {
      fail(e, 'Plan unavailable.')
    } finally {
      setLoading(false)
    }
  }
  const addLearner = () => {
    if (!isLearnerCode(newCode)) { setMessage('Enter a learner code like L-001.'); return }
    saveRoster(upsertLearner(roster, { code: newCode, label: newLabel }))
    setNewCode(''); setNewLabel(''); setMessage('')
    loadPlan(newCode)
  }
  const loadQueue = async () => { if (!token) return; try { setQueue(await activityQueue(token)) } catch (e) { fail(e, 'Mark queue unavailable.') } }
  const loadProgress = async () => { try { setProgress(await activityProgress(learner)) } catch (e) { fail(e, 'Progress unavailable.') } }
  const loadClass = async () => {
    const entries = await Promise.all(roster.map(async item => [item.code, await activityProgress(item.code).catch(() => null)] as const))
    setClassRows(Object.fromEntries(entries))
  }
  useEffect(() => { if (token) loadPlan() }, [token])
  useEffect(() => { if (tab === 'mark') loadQueue(); if (tab === 'progress') { loadProgress(); loadClass() } }, [tab, learner])
  if (!token) return <main><div className="screen"><PinGate onToken={setToken} notice={message} /><button className="link-btn" onClick={() => go('welcome')}>← {t.home}</button></div></main>

  const mark = async (eventId: string, result: TeacherResult) => {
    try {
      await markActivity(eventId, result, token)
      setMessage('Mark saved.')
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
  const openAsLearner = () => { writeSession('sp_learner', learner); go('activities') }
  const anyResponse = queue?.events.some(event => event.response_text)

  return (
    <main>
      <div className="screen workspace">
        <div className="split">
          <div>
            <div className="eyebrow">Teacher workspace</div>
            <h2 className="section-title">{learnerName(roster, learner)}</h2>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="secondary" onClick={openAsLearner}>Open as learner</button>
            <button className="secondary" onClick={() => lock()}>Lock</button>
          </div>
        </div>
        <div className="workspace-tabs" role="tablist">
          {(Object.keys(labels) as Tab[]).map(item => (
            <button key={item} className={tab === item ? 'warm' : 'secondary'} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>
              <b><span className="emoji" aria-hidden="true">{tabInfo[item].emoji}</span> {labels[item]}</b><small>{tabInfo[item].sub}</small>
            </button>
          ))}
        </div>
        <p className="tab-help" role="note"><span className="emoji" aria-hidden="true">💡</span><span>{tabInfo[tab].help}</span></p>

        {tab === 'plan' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Step 1</span><h3 className="section-title">Who is learning?</h3></div>
              <DraftBadge />
            </div>
            {roster.length > 0 && (
              <div className="roster" role="group" aria-label="My learners">
                {roster.map(item => (
                  <button key={item.code} className={item.code === learner ? 'roster-row on' : 'roster-row'} aria-pressed={item.code === learner} onClick={() => loadPlan(item.code)}>
                    <span><b>{item.label || item.code}</b><small>{item.label ? item.code : 'No private label yet'}{item.lastSeen ? ` · last opened ${new Date(item.lastSeen).toLocaleDateString()}` : ''}</small></span>
                    <span aria-hidden="true">{item.code === learner ? '✓' : '→'}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="roster-add">
              <div className="field"><label htmlFor="new-code">Learner code</label><input id="new-code" autoComplete="off" placeholder="L-001" value={newCode} onChange={e => setNewCode(normalizeLearnerInput(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') addLearner() }} /></div>
              <div className="field"><label htmlFor="new-label">Private label (optional)</label><input id="new-label" autoComplete="off" maxLength={MAX_LABEL} placeholder="Name or nickname, for you only" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLearner() }} /></div>
              <button className="warm" disabled={!isLearnerCode(newCode)} onClick={addLearner}>Add learner</button>
            </div>
            <p className="privacy-note">Labels and notes are saved on this device only and are never sent to the server. The server only sees the code. Clearing this browser's data removes them.</p>
            {current && (
              <div className="field">
                <label htmlFor="learner-note">Private note about {current.label || current.code}</label>
                <input id="learner-note" maxLength={400} value={current.note} placeholder="For example: needs help with silent letters" onChange={e => saveRoster(upsertLearner(roster, { code: current.code, note: e.target.value }, current.lastSeen))} />
                <button className="link-btn" style={{ justifySelf: 'start' }} onClick={() => saveRoster(removeLearner(roster, current.code))}>Remove from my list</button>
              </div>
            )}

            <div className="panel-heading" style={{ marginTop: '1.5rem' }}>
              <div><span className="eyebrow">Step 2</span><h3 className="section-title">Pick a skill</h3></div>
            </div>
            <div className="modality-grid" role="group" aria-label="Filter by skill">
              {modalities.map(modality => (
                <button className={modalityFilter === modality ? 'modality-card selected' : 'modality-card'} key={modality} aria-pressed={modalityFilter === modality} onClick={() => toggleFilter(modality)}>
                  <span><span className="emoji" aria-hidden="true">{modalityEmoji[modality]}</span> {modalityLabels[modality]}</span>
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
                  <span className="emoji">{item.picture}</span><b>{item.activity_id}</b><span>{modalityLabels[item.modality]}</span><small>{item.topic}</small>
                </button>
              ))}
            </div>
            {!visibleActivities.length && <p className="notice">No activities to show. Check the learner code, then refresh the plan.</p>}
            <button className="warm" style={{ marginTop: '1rem' }} disabled={loading || !isLearnerCode(learner)} onClick={() => loadPlan()}>{loading ? 'Loading...' : 'Refresh plan'}</button>
          </section>
        )}

        {tab === 'run' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Step 3</span><h3 className="section-title">One activity at a time</h3></div>
              {selected && <span className="pill">{modalityLabels[selected.modality]}</span>}
            </div>
            {selected ? (
              <>
                <DraftBadge />
                <div className="run-card" data-theme={selected.topic}>
                  <Scene picture={selected.picture || '📖'} small />
                  <div>
                    <h3>{selected.parent_text}</h3>
                    <p className="muted">{selected.prompt_text}</p>
                    <p className="muted">{modalityHelp[selected.modality]}</p>
                    <button className="primary" onClick={openAsLearner}>Open as {learnerName(roster, learner)}</button>
                  </div>
                </div>
                <div className="split">
                  <span className="muted" role="status">{showing}</span>
                  {modalityFilter && <button className="link-btn" onClick={() => setModalityFilter(null)}>Show all</button>}
                </div>
                <div className="activity-list">
                  {visibleActivities.map(item => (
                    <button key={item.activity_id} className={selected.activity_id === item.activity_id ? 'activity-row selected' : 'activity-row'} onClick={() => setSelected(item)}>
                      <span className="emoji">{item.picture}</span><b>{item.activity_id}</b><span>{modalityLabels[item.modality]}</span><small>{item.topic}</small>
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
              <div><span className="eyebrow">Step 4</span><h3 className="section-title">Needs your mark</h3></div>
              <span className="pill">{queue?.events.length ?? 0} waiting</span>
            </div>
            {queue?.events.length && !anyResponse ? <p className="notice">This server does not send what the child answered yet. Ask the child to show you their answer or book, then mark it. (Backend change needed, see the handover notes.)</p> : null}
            {queue?.events.length ? queue.events.map(event => {
              const activity = activities.find(item => item.activity_id === event.activity_id)
              return (
                <div className="queue-card" key={event.event_id}>
                  <div className="split"><b>{learnerName(roster, event.learner)}</b><span className="pill"><span className="emoji" aria-hidden="true">{modalityEmoji[event.modality] ?? ''}</span> {modalityLabels[event.modality] ?? event.modality}</span></div>
                  {activity && <p><span className="emoji" aria-hidden="true">{activity.picture} </span>{activity.parent_text}</p>}
                  {event.response_text && <div className="response-box">{event.response_text === 'paper_handoff' ? 'Written in an exercise book. Look at the book.' : event.response_text}</div>}
                  <p className="muted">{event.activity_id} · {machineText(event.machine_result)}{event.created_at ? ` · ${formatWhen(event.created_at)}` : ''}</p>
                  <div className="actions">
                    {(Object.keys(resultText) as TeacherResult[]).map(result => <button className="secondary" key={result} onClick={() => mark(event.event_id, result)}>{resultText[result]}</button>)}
                  </div>
                </div>
              )
            }) : (
              <div className="empty-state">
                <b>Nothing waiting for you.</b>
                <p className="muted">Picture answers, deferred speech and written work will appear here.</p>
              </div>
            )}
          </section>
        )}

        {tab === 'progress' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Step 5</span><h3 className="section-title">How is {current?.label || learner} doing?</h3></div>
              <span className="pill">{learner}</span>
            </div>
            {progress?.by_modality.map(row => (
              <div className="progress-row" key={row.modality}>
                <div className="split"><b><span className="emoji" aria-hidden="true">{modalityEmoji[row.modality]}</span> {modalityLabels[row.modality] ?? row.modality}</b><span>{row.marked} marked of {row.events} done</span></div>
                <div className="bar"><i style={{ width: `${row.events ? Math.min(100, row.marked / row.events * 100) : 0}%` }} /></div>
              </div>
            ))}
            {!progress?.by_modality.length && <p className="notice">No activity evidence yet for this learner.</p>}
            {current?.note && <p className="notice"><b>Your note:</b> {current.note}</p>}
            {roster.length > 1 && (
              <>
                <h3 className="section-title" style={{ marginTop: '1.5rem' }}>My class</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="class-table">
                    <thead><tr><th>Learner</th>{modalities.map(m => <th key={m}>{modalityLabels[m]}</th>)}</tr></thead>
                    <tbody>
                      {roster.map(item => {
                        const row = classRows[item.code]
                        return (
                          <tr key={item.code}>
                            <td><button className="link-btn" onClick={() => loadPlan(item.code)}>{item.label || item.code}</button></td>
                            {modalities.map(m => { const cell = row?.by_modality.find(x => x.modality === m); return <td className="num" key={m}>{row ? (cell ? `${cell.marked}/${cell.events}` : '0/0') : '-'}</td> })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="privacy-note">Each cell shows marked / done.</p>
              </>
            )}
          </section>
        )}

        {tab === 'guide' && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Teacher help</span><h3 className="section-title">Ask about teaching reading</h3></div>
              <span className="pill">Quoted from sources</span>
            </div>
            <div className="field">
              <label htmlFor="guide-query">Your question</label>
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
