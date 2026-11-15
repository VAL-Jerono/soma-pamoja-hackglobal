import { useCallback, useEffect, useState } from 'react'
import { answerKey, attempt, confirmReading, dashboard, evalSummary, health, login, nextItem, submitComprehension } from '../api/client'
import { facilitatorErrorMessage, isUnauthorized, pinErrorMessage, childErrorMessage } from '../lib/errors'
import { speakKiswahili } from '../lib/speech'
import { ChildResult } from './ChildResult'
import { Recorder } from './Recorder'
import type { AttemptResult, ComprehensionVerdict, Dashboard, EvalSummary, Item, NextResponse, ReadingHumanVerdict } from '../api/types'
import { copy, type Lang } from '../i18n'
import { readPreference, readSession, removeSession, writePreference, writeSession } from '../lib/storage'
import { ChildActivityRunner, FacilitatorWorkspace } from './ActivityWorkspace'

type Route = 'welcome' | 'session' | 'facilitator' | 'activities'
type HealthState = 'connecting' | 'healthy' | 'slow' | 'offline'
const verdictLabels: [ComprehensionVerdict, keyof typeof copy.en][] = [['understood','understood'],['with_help','withHelp'],['not_yet','notYet'],['not_sure','notSure']]

function useHashRoute(): [Route, (route: Route) => void] {
  const get = (): Route => location.hash === '#/session' ? 'session' : location.hash === '#/facilitator' ? 'facilitator' : location.hash === '#/activities' ? 'activities' : 'welcome'
  const [route, setRoute] = useState<Route>(get)
  useEffect(() => { const onHash = () => setRoute(get()); addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash) }, [])
  const go = (next: Route) => { location.hash = `#/${next === 'welcome' ? '' : next}` }
  return [route, go]
}

function useHealth() {
  const [state, setState] = useState<HealthState>('connecting')
  const [latency, setLatency] = useState<number | null>(null)
  const ping = useCallback(async () => { const started = performance.now(); try { const h = await health(); const ms = Math.round(performance.now() - started); setLatency(ms); setState(h.ok ? ms < 1500 ? 'healthy' : 'slow' : 'offline') } catch { setState('offline') } }, [])
  useEffect(() => { ping(); const id = window.setInterval(ping, 30000); return () => clearInterval(id) }, [ping])
  return { state, latency }
}

function Logo() { return <div className="brand"><svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 24c9-6 16-4 20 2 4-6 11-8 20-2v23c-9-5-16-4-20 2-4-6-11-7-20-2V24Z" fill="#fbf5e9"/><path d="M32 26v23M32 17c0-6 6-9 10-9-1 6-4 9-10 9ZM31 19c-6 0-10-3-11-9 5 0 11 3 11 9Z" fill="none" stroke="#f2b705" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="brand-name">Soma Pamoja</span></div> }
function DraftBar({ lang }: { lang: Lang }) { return <div className="draftbar" role="note">{copy[lang].draft}</div> }
function StatusPill({ state, latency }: { state: HealthState; latency: number | null }) { const label = state === 'healthy' ? 'healthy' : state === 'slow' ? 'slow' : state === 'offline' ? 'offline' : 'connecting'; return <span className={`status ${state}`} role="status"><i />Backend: {import.meta.env.VITE_BACKEND_LABEL || 'Vultr'} · {label}{latency !== null ? `, ${latency} ms` : ''}</span> }
function Header({ lang, setLang, healthState, latency, go }: { lang: Lang; setLang: (l: Lang) => void; healthState: HealthState; latency: number | null; go: (r: Route) => void }) { const toggle = () => { const next = lang === 'sw' ? 'en' : 'sw'; writePreference('sp_language', next); setLang(next) }; return <header className="topbar"><button className="link-btn" onClick={() => go('welcome')} aria-label="Soma Pamoja home"><Logo /></button><div className="top-actions"><StatusPill state={healthState} latency={latency} /><button className="icon-btn" onClick={toggle} aria-label={lang === 'sw' ? 'Switch to English' : 'Switch to Kiswahili'}>{lang === 'sw' ? 'EN' : 'SW'}</button><button className="icon-btn" onClick={() => go('facilitator')} aria-label="Open facilitator">⌁</button></div></header> }

function Welcome({ lang, go, healthState, latency }: { lang: Lang; go: (r: Route) => void; healthState: HealthState; latency: number | null }) { const t = copy[lang]; return <main><div className="hero"><div><div className="eyebrow">Voice-first · Kiswahili</div><h1>{t.tagline}</h1><p>{t.sub} The school may close. The learning should not have to.</p><div className="actions"><button className="primary" onClick={() => go('session')}>{t.start} <span aria-hidden="true">→</span></button><button className="secondary" onClick={() => go('activities')}>{t.tryActivity}</button><button className="secondary" onClick={() => go('facilitator')}>{t.facilitator}</button></div><div style={{ marginTop: '1rem' }}><StatusPill state={healthState} latency={latency} /></div></div><div className="card"><div className="stage"><div className="picture">📖</div></div><p className="sentence" style={{ fontSize: 'clamp(1.8rem,5vw,3rem)' }}>Mtoto anasoma kitabu.</p><p className="gloss">A short sentence, one reader, one gentle step at a time.</p></div></div><section className="grid-2"><div className="card"><h2 className="section-title">How it works</h2><p className="muted">Choose a sentence. The child reads. Speech becomes words. The system is sure, or a person decides. Then the facilitator asks one small question.</p></div><div className="card"><h2 className="section-title">Honest by design</h2><p className="muted">Draft content stays visible. Typed demo stays separate from speech evidence. Reading and comprehension are recorded as different things.</p></div></section><footer className="footer">Aligned to the UNESCO Global Proficiency Framework and Kenya Grade 1 to 3 Kiswahili expectations, pending native-speaker review. Prototype for HackGlobal 2026.</footer></main> }

function LearnerSetup({ value, setValue, onStart, lang }: { value: string; setValue: (v: string) => void; onStart: () => void; lang: Lang }) { const t = copy[lang]; return <div className="card"><div className="field"><label htmlFor="learner">{t.code}</label><input id="learner" inputMode="text" value={value} onChange={e => setValue(e.target.value.toUpperCase().replace(/[^L0-9-]/g, ''))} onBlur={() => { if (/^L\d{3,6}$/.test(value)) setValue(`L-${value.slice(1)}`) }} placeholder="L-001" /><span className="muted">{t.codeHint}</span></div><button className="primary big-action" disabled={!/^L-\d{3,6}$/.test(value)} onClick={onStart}>{t.start}</button></div> }



function Session({ lang, go }: { lang: Lang; go: (r: Route) => void }) {
  const t = copy[lang]
  const [learner, setLearner] = useState(() => readSession('sp_learner', 'L-001'))
  const [next, setNext] = useState<NextResponse | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [error, setError] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  const load = async () => {
    setError('')
    setResult(null)
    setVoiceNote('')
    try {
      writeSession('sp_learner', learner)
      setNext(await nextItem(learner))
    } catch (e) {
      setError(childErrorMessage(e, lang))
    }
  }
  const listen = () => { if (next) setVoiceNote(speakKiswahili(next.passage.text) ? t.browserVoice : t.noVoice) }
  return (
    <main>
      <div className="screen">
        <div className="split">
          <div>
            <div className="eyebrow">{t.childMode}</div>
            <h2 className="section-title">{t.tagline}</h2>
          </div>
          <button className="secondary" onClick={() => go('facilitator')}>{t.facilitator}</button>
        </div>
        {!next && <LearnerSetup value={learner} setValue={setLearner} onStart={load} lang={lang} />}
        {next && (
          <div className="session-layout">
            <div className="stage"><div className="picture">{next.passage.picture || '📖'}</div></div>
            <div>
              <h2 className="sentence">{next.passage.text}</h2>
              {next.passage.en && <p className="gloss">{next.passage.en}</p>}
              <div className="actions"><button className="secondary" onClick={listen}>{t.listen}</button></div>
              {voiceNote && <p className="notice" role="status">{voiceNote}</p>}
              <div style={{ marginTop: '1rem' }}>
                <Recorder learner={learner} passage={next.passage.id} lang={lang} onResult={r => { setResult(r); setError('') }} />
                <p className="notice">{t.audioNotice}</p>
              </div>
              {result && <ChildResult result={result} lang={lang} next={load} onFacilitator={() => go('facilitator')} />}
            </div>
          </div>
        )}
        {error && (
          <div className="card error" role="alert">
            <p>{error}</p>
            <button className="secondary" onClick={load}>{t.retry}</button>
          </div>
        )}
      </div>
    </main>
  )
}

function PinGate({ onToken, lang, notice }: { onToken: (token: string) => void; lang: Lang; notice?: string }) {
  const t = copy[lang]
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const unlock = async () => {
    if (!pin) return
    setBusy(true)
    setMessage('')
    try {
      const response = await login(pin)
      onToken(response.token)
    } catch (e) {
      setMessage(pinErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card">
      <h2 className="section-title">{t.facilitator}</h2>
      <p className="muted">{t.pinNote}</p>
      <div className="field">
        <label htmlFor="pin">{t.pinLabel}</label>
        <input id="pin" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') unlock() }} placeholder="••••" />
      </div>
      <button className="warm" disabled={busy || !pin} onClick={unlock}>{t.unlock}</button>
      {(message || notice) && <p className="notice" role="alert">{message || notice}</p>}
    </div>
  )
}

function MachineDetail({ result, lang }: { result: AttemptResult; lang: Lang }) { return <div className="notice"><div className="split"><b>Machine detail</b><span className={`pill ${result.session_type === 'typed_demo' ? 'typed' : ''}`}>{result.session_type === 'typed_demo' ? copy[lang].typed : result.engine}</span></div><p>Heard: “{result.heard || 'nothing'}”</p><p>Word match: {Math.round(result.accuracy * 100)}% · Confidence: {result.confidence.toFixed(2)} · Reason: {result.reason}</p>{result.alignment && <div className="wordchips">{result.alignment.map((row, i) => <span key={i} className={`wordchip ${row[2]}`}>{row[2] === 'ok' ? '✓ ' : row[2] === 'omit' ? 'missing ' : row[2] === 'sub' ? 'changed ' : 'extra '}{row[0] || row[1]}</span>)}</div>}</div> }

const readingVerdicts: [ReadingHumanVerdict, keyof typeof copy.en][] = [['correct', 'rvCorrect'], ['acceptable_minor_slip', 'rvSlip'], ['incorrect', 'rvIncorrect'], ['uncertain', 'rvUncertain']]
const deskTabLabels = { current: 'Current reading', typed: 'Typed fallback', dashboard: 'Dashboard', evidence: 'Evidence' } as const

function Facilitator({ lang, go }: { lang: Lang; go: (r: Route) => void }) {
  const t = copy[lang]
  const [token, setToken] = useState(() => readSession('sp_facilitator_token'))
  const [item, setItem] = useState<Item | null>(null)
  const [learner] = useState(() => readSession('sp_learner', 'L-001'))
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [tab, setTab] = useState<'current' | 'typed' | 'dashboard' | 'evidence'>('current')
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [evalState, setEvalState] = useState<EvalSummary | null>(null)
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState('')
  const [selectedComp, setSelectedComp] = useState<ComprehensionVerdict | null>(null)
  const [selectedReading, setSelectedReading] = useState<ReadingHumanVerdict | null>(null)

  // An expired token returns to the PIN gate with a clear reason. Raw API detail is never shown.
  const fail = (error: unknown, fallback: string) => {
    if (isUnauthorized(error)) { removeSession('sp_facilitator_token'); setToken('') }
    setMessage(facilitatorErrorMessage(error, fallback))
  }
  const load = async () => {
    try {
      const response = await nextItem(learner)
      setItem(response.passage)
      setResult(null)
      setSelectedComp(null)
      setSelectedReading(null)
      setAnswer('')
      setMessage('')
    } catch (e) {
      fail(e, 'No activity could be loaded.')
    }
  }
  useEffect(() => { if (token) { writeSession('sp_facilitator_token', token); load() } }, [token])
  const recordComp = async (verdict: ComprehensionVerdict, mode = 'facilitator_read') => {
    if (!item) return
    try {
      await submitComprehension({ learner, question_id: item.questions?.[0]?.question_id || '', verdict, mode, attempt_id: result?.id, passage: item.id }, token)
      setSelectedComp(verdict)
      setMessage('Comprehension recorded.')
    } catch (e) {
      fail(e, 'Could not record comprehension.')
    }
  }
  const recordReading = async (verdict: ReadingHumanVerdict) => {
    if (!result) return
    try {
      await confirmReading(result.id, verdict, token)
      setSelectedReading(verdict)
      setMessage('Reading verdict recorded.')
    } catch (e) {
      fail(e, 'Could not record the reading verdict.')
    }
  }
  const loadDash = async () => { try { setDash(await dashboard(token)) } catch (e) { fail(e, 'Dashboard unavailable.') } }
  const loadEval = async () => { try { setEvalState(await evalSummary(token)) } catch (e) { setEvalState(null); if (isUnauthorized(e)) fail(e, '') } }
  useEffect(() => { if (tab === 'dashboard') loadDash(); if (tab === 'evidence') loadEval() }, [tab])
  if (!token) return <main><div className="screen"><PinGate lang={lang} onToken={setToken} notice={message} /><button className="link-btn" onClick={() => go('session')}>← {t.home}</button></div></main>
  const q = item?.questions?.[0]
  return (
    <main>
      <div className="screen">
        <div className="split">
          <div>
            <div className="eyebrow">06 · Reading desk</div>
            <h3 className="section-title">Human review</h3>
          </div>
          <span className="pill">{learner}</span>
        </div>
        <div className="actions">
          {(['current', 'typed', 'dashboard', 'evidence'] as const).map(name => <button key={name} className={tab === name ? 'warm' : 'secondary'} onClick={() => setTab(name)}>{deskTabLabels[name]}</button>)}
        </div>
        {tab === 'current' && (
          <>
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="split"><span className="pill draft">Draft</span><span className="muted">{item?.id || 'No item'}</span></div>
              <h3 className="sentence" style={{ fontSize: 'clamp(1.8rem,5vw,3rem)' }}>{item?.text || 'Start an activity.'}</h3>
              <p className="muted">{item?.en}</p>
              <button className="warm" onClick={load}>{t.next}</button>
            </div>
            {result && (
              <div className="card" style={{ marginTop: '1rem' }}>
                {result.deferred && <p className="notice">The machine was unsure about this reading, so a person decides.</p>}
                <MachineDetail result={result} lang={lang} />
                <h3 className="section-title">Reading verdict</h3>
                <div className="actions">
                  {readingVerdicts.map(([verdict, key]) => <button key={verdict} className={selectedReading === verdict ? 'warm' : 'secondary'} aria-pressed={selectedReading === verdict} onClick={() => recordReading(verdict)}>{t[key]}</button>)}
                </div>
                {q && (
                  <div>
                    <h3 className="section-title">{t.question}</h3>
                    <p className="question">{q.question_text}</p>
                    <div className="actions">
                      {verdictLabels.map(([verdict, key]) => <button key={verdict} className={selectedComp === verdict ? 'warm' : 'secondary'} aria-pressed={selectedComp === verdict} onClick={() => recordComp(verdict)}>{t[key]}</button>)}
                    </div>
                    <button className="link-btn" onClick={async () => { try { const k = await answerKey(q.question_id, token); setAnswer(k.answer_key) } catch (e) { if (isUnauthorized(e)) fail(e, ''); else setAnswer('Answer key unavailable') } }}>{answer ? 'Answer key shown' : 'Show answer key'}</button>
                    {answer && <p className="notice"><b>Facilitator only:</b> {answer}</p>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {tab === 'typed' && <TypedDemo learner={learner} item={item} token={token} onResult={r => { setResult(r); setSelectedReading(null); setSelectedComp(null); setMessage(''); setTab('current') }} onError={e => fail(e, 'The typed reading could not be checked.')} lang={lang} />}
        {tab === 'dashboard' && <DashboardView dash={dash} lang={lang} />}
        {tab === 'evidence' && <Evidence evalState={evalState} lang={lang} />}
        {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
      </div>
    </main>
  )
}

function TypedDemo({ learner, item, token, onResult, onError, lang }: { learner: string; item: Item | null; token: string; onResult: (r: AttemptResult) => void; onError: (error: unknown) => void; lang: Lang }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!item || !text.trim()) return
    setBusy(true)
    const form = new FormData()
    form.append('learner', learner)
    form.append('passage', item.id)
    form.append('typed', text)
    try {
      onResult(await attempt(form, token))
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <span className="pill typed">{copy[lang].typed}</span>
      <p className="muted">Use this only to test the rules. It is not speech evidence.</p>
      <div className="field">
        <label htmlFor="typed">What did the child read?</label>
        <input id="typed" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} />
      </div>
      <button className="warm" disabled={busy || !item || !text.trim()} onClick={send}>Check typed reading</button>
    </div>
  )
}

function DashboardView({ dash, lang }: { dash: Dashboard | null; lang: Lang }) { if (!dash) return <div className="card">Loading dashboard...</div>; return <div className="card" style={{ marginTop: '1rem' }}><div className="split"><h3 className="section-title">Dashboard</h3><span className="pill">{dash.demo_data === false ? '' : copy[lang].demo}</span></div><div className="metric-grid"><div className="metric"><b>{dash.attempts}</b><span>Speech attempts</span></div><div className="metric"><b>{dash.learners}</b><span>Learners</span></div><div className="metric"><b>{Math.round(dash.deferral_rate * 100)}%</b><span>Deferred to a person</span></div><div className="metric"><b>{dash.typed_demo_attempts}</b><span>Typed demo, excluded</span></div></div><h4>Per learner</h4>{dash.per_learner.map(row => <div key={row[0]} style={{ margin: '.8rem 0' }}><div className="split"><span>{row[0]}</span><span>{Math.round(row[2] * 100)}%</span></div><div className="bar"><i style={{ width: `${Math.min(100, row[2] * 100)}%` }} /></div></div>)}</div> }
function Evidence({ evalState, lang }: { evalState: EvalSummary | null; lang: Lang }) { const pct = (value: number | null) => value === null ? 'Not available' : `${Math.round(value * 100)}%`; return <div className="card" style={{ marginTop: '1rem' }}><span className="pill">{copy[lang].demo}</span><h3 className="section-title">Claims we do not make</h3><ul className="muted"><li>Draft content is not ready for production release.</li><li>Typed demo is not speech evidence.</li><li>Reading and comprehension are different outcomes.</li><li>Machine judgment is not human confirmation.</li></ul><h3 className="section-title">Latest evaluation</h3>{!evalState ? <p className="notice">No evaluation run yet. Adult-proxy labels come before machine output.</p> : <><div className="metric-grid"><div className="metric"><b>{pct(evalState.false_wrong_rate)}</b><span>False-wrong rate, {evalState.false_wrong_count} of {evalState.comparable_samples}</span></div><div className="metric"><b>{pct(evalState.false_correct_rate)}</b><span>False-correct rate, {evalState.false_correct_count} of {evalState.comparable_samples}</span></div></div><div className="notice"><b>Indicative only, adult proxy readers.</b><p>{evalState.caveat}</p><p>Excluded uncertain samples: {evalState.excluded_uncertain_samples}.</p></div></>}</div> }

export default function App() {
  const [route, go] = useHashRoute()
  const [lang, setLang] = useState<Lang>(() => readPreference('sp_language', 'en') === 'sw' ? 'sw' : 'en')
  const h = useHealth()
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return (
    <div className="app">
      <Header lang={lang} setLang={setLang} healthState={h.state} latency={h.latency} go={go} />
      <DraftBar lang={lang} />
      {route === 'welcome' && <Welcome lang={lang} go={go} healthState={h.state} latency={h.latency} />}
      {route === 'session' && <Session lang={lang} go={go} />}
      {route === 'activities' && <ChildActivityRunner go={go} lang={lang} />}
      {route === 'facilitator' && <FacilitatorWorkspace go={go} reading={<Facilitator lang={lang} go={go} />} />}
    </div>
  )
}
