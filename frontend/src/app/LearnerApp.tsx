import { useEffect, useMemo, useState } from 'react'
import { listActivities, respondActivity } from '../api/client'
import type { Activity, ActivityModality, AttemptResult } from '../api/types'
import { copy, type Lang } from '../i18n'
import { machineResultFor, newChildSessionId, optionText, PAPER_HANDOFF, writingResponse, MAX_WRITING } from '../lib/activity'
import { childErrorMessage } from '../lib/errors'
import { buildLessons, firstOpenLesson, firstOpenStep, isLessonDone, parseDone, SKILL_ORDER, type Lesson } from '../lib/lessons'
import { speakKiswahili } from '../lib/speech'
import { readSession, removeSession, writeSession } from '../lib/storage'
import { isLearnerCode, normalizeLearnerInput } from '../lib/validation'
import { ChildResult } from './ChildResult'
import { Recorder } from './Recorder'
import { Scene } from './Scene'

type Props = { go: (route: 'welcome' | 'session' | 'facilitator' | 'activities') => void; lang: Lang }

const skillEmoji: Record<ActivityModality, string> = { reading: '👀', listening: '👂', speaking: '🎤', writing: '✍️' }
const doneKey = (learner: string) => `sp_done_${learner}`
const SESSION_KEYS = ['sp_signed_in', 'sp_child_session']

/**
 * The learner screen. It holds one lesson at a time: read, listen, speak, write.
 * Everything a child does today is kept in sessionStorage only, so it ends with the day's session.
 * Teacher tools, health status and the activity bank are never shown here.
 */
export function ChildActivityRunner({ go, lang }: Props) {
  const t = copy[lang]
  const [learner, setLearner] = useState(() => readSession('sp_learner', ''))
  const [signedIn, setSignedIn] = useState(() => readSession('sp_signed_in') === '1')
  const [activities, setActivities] = useState<Activity[]>([])
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [lessonIdx, setLessonIdx] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  const [feedback, setFeedback] = useState<{ activityId: string; speech?: AttemptResult } | null>(null)
  const [picked, setPicked] = useState('')
  const [text, setText] = useState('')
  const [lastCall, setLastCall] = useState<{ response: string; machine: 'auto_correct' | 'auto_practice' | 'deferred'; speech?: AttemptResult } | null>(null)
  const [sessionId] = useState(() => readSession('sp_child_session') || newChildSessionId())

  const lessons = useMemo(() => buildLessons(activities), [activities])
  const lesson: Lesson | undefined = lessons[lessonIdx]
  const step: Activity | undefined = lesson && stepIdx >= 0 ? lesson.activities[stepIdx] : undefined
  const everythingDone = lessons.length > 0 && lessonIdx >= lessons.length

  const resetStepState = () => { setMessage(''); setVoiceNote(''); setPicked(''); setText(''); setFeedback(null); setLastCall(null) }

  const enter = (list: Lesson[], completed: Set<string>, index: number) => {
    setLessonIdx(index)
    const target = list[index]
    setStepIdx(target ? firstOpenStep(target, completed) : -1)
    resetStepState()
  }

  const load = async (code = learner) => {
    if (!isLearnerCode(code)) return
    setLoading(true)
    setMessage('')
    try {
      const data = await listActivities(code)
      const completed = new Set(parseDone(readSession(doneKey(code))))
      const list = buildLessons(data.activities)
      writeSession('sp_learner', code)
      writeSession('sp_signed_in', '1')
      writeSession('sp_child_session', sessionId)
      setActivities(data.activities)
      setDone(completed)
      setSignedIn(true)
      const open = firstOpenLesson(list, completed)
      enter(list, completed, open === -1 ? list.length : open)
      if (!data.activities.length) setMessage(t.noActivity)
    } catch (e) {
      setMessage(childErrorMessage(e, lang))
    } finally {
      setLoading(false)
    }
  }

  // Still signed in for the day: go straight back to the lessons.
  useEffect(() => { if (signedIn && isLearnerCode(learner)) load(learner) }, [])

  const finishForToday = () => {
    for (const key of SESSION_KEYS) removeSession(key)
    removeSession('sp_learner')
    setSignedIn(false); setActivities([]); setLearner(''); resetStepState()
    go('welcome')
  }

  // The child screen never judges a response. Picture and written work go to the teacher as deferred,
  // and speech relays the server's own verdict.
  const record = async (response: string, machine: 'auto_correct' | 'auto_practice' | 'deferred', speech?: AttemptResult) => {
    if (!step) return
    setLastCall({ response, machine, speech })
    setLoading(true)
    setMessage('')
    try {
      await respondActivity({ learner, activity_id: step.activity_id, response, machine_result: machine, session_id: sessionId })
      const completed = new Set(done).add(step.activity_id)
      setDone(completed)
      writeSession(doneKey(learner), JSON.stringify([...completed]))
      setFeedback({ activityId: step.activity_id, speech })
    } catch (e) {
      setMessage(childErrorMessage(e, lang))
    } finally {
      setLoading(false)
    }
  }
  const saveSpeech = (result: AttemptResult) => record(result.heard, machineResultFor(result.verdict), result)

  const nextStep = () => {
    resetStepState()
    if (!lesson) return
    const after = lesson.activities.findIndex((a, i) => i > stepIdx && !done.has(a.activity_id))
    setStepIdx(after)
  }
  const nextLesson = () => enter(lessons, done, lessonIdx + 1)
  const listen = (slow = false) => { if (step || lesson) setVoiceNote(speakKiswahili((step?.parent_text || lesson!.text), slow) ? t.browserVoice : t.noVoice) }

  /* ---------- Sign in ---------- */
  if (!signedIn || (!activities.length && !loading && !message)) {
    return (
      <main className="learner-app" data-theme="default">
        <div className="screen">
          <div className="card login-card">
            <Scene picture="🎒" small />
            <h1 className="section-title">{t.loginTitle}</h1>
            <p className="muted">{t.loginHint}</p>
            <div className="field">
              <label htmlFor="activity-learner">{t.code}</label>
              <input id="activity-learner" className="code-input" inputMode="text" autoComplete="off" autoCapitalize="characters" value={learner} placeholder="L-001"
                onChange={e => setLearner(normalizeLearnerInput(e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter' && isLearnerCode(learner) && !loading) load() }} />
              <span className="muted">{t.codeHint}</span>
            </div>
            <button className="primary big-action" disabled={loading || !isLearnerCode(learner)} onClick={() => load()}>{loading ? t.loading : t.startLearning}</button>
            {message && <p className="notice" role="alert">{message}</p>}
          </div>
        </div>
      </main>
    )
  }

  const header = (
    <div className="learner-head">
      <div className="who">
        <div className="avatar" aria-hidden="true">🦁</div>
        <div><b>{t.hello}, {learner}</b><small>{lessons.length ? `${t.lessonOf} ${Math.min(lessonIdx + 1, lessons.length)} / ${lessons.length}` : ''}</small></div>
      </div>
      <button className="secondary" onClick={finishForToday}>{t.finishToday}</button>
    </div>
  )

  /* ---------- Everything finished ---------- */
  if (everythingDone) {
    return (
      <main className="learner-app" data-theme="default"><div className="screen">{header}
        <div className="card celebrate" role="status">
          <span className="emoji" aria-hidden="true">🏆</span>
          <h2>{t.allDone}</h2>
          <div className="stars" aria-hidden="true">⭐⭐⭐</div>
          <button className="primary big-action" onClick={finishForToday}>{t.finishToday}</button>
        </div>
      </div></main>
    )
  }

  if (!lesson) {
    return <main className="learner-app"><div className="screen">{header}<p className="notice" role="alert">{message || t.loading}</p>{message && <button className="primary" onClick={() => load()}>{t.retry}</button>}</div></main>
  }

  /* ---------- Lesson complete ---------- */
  if (!step) {
    return (
      <main className="learner-app" data-theme={lesson.theme}><div className="screen">{header}
        <div className="card celebrate" role="status">
          <Scene picture={lesson.picture} small />
          <h2>{t.lessonDone}</h2>
          <div className="stars" aria-hidden="true">{lesson.activities.map(a => <span key={a.activity_id}>⭐</span>)}</div>
          <button className="primary big-action" onClick={nextLesson}>{t.nextLesson}</button>
        </div>
      </div></main>
    )
  }

  const justDone = feedback?.activityId === step.activity_id
  const locked = loading || justDone || done.has(step.activity_id)
  const how: Record<ActivityModality, string> = { reading: t.howReading, listening: t.howListening, speaking: t.howSpeaking, writing: t.howWriting }
  const skillName: Record<ActivityModality, string> = { reading: t.skillRead, listening: t.skillListen, speaking: t.skillSpeak, writing: t.skillWrite }
  const available = new Set(lesson.activities.map(a => a.modality))

  return (
    <main className="learner-app" data-theme={lesson.theme}>
      <div className="screen" style={{ maxWidth: 940 }}>
        {header}
        <ol className="skill-strip" aria-label={t.howTitle}>
          {SKILL_ORDER.map(modality => {
            const a = lesson.activities.find(x => x.modality === modality)
            const state = !available.has(modality) ? 'off' : a && done.has(a.activity_id) ? 'done' : a && a.activity_id === step.activity_id ? 'here' : ''
            return <li key={modality} className={`skill ${state}`} aria-current={state === 'here' ? 'step' : undefined}><span className="emoji" aria-hidden="true">{skillEmoji[modality]}</span>{skillName[modality]}</li>
          })}
        </ol>

        <div className="session-layout">
          <div>
            <Scene picture={step.modality === 'listening' ? '🔊' : lesson.picture} />
            <div className="lesson-dots" aria-hidden="true">
              {lessons.map((l, i) => <i key={l.id} className={i === lessonIdx ? 'on' : isLessonDone(l, done) ? 'done' : ''} />)}
            </div>
          </div>

          <div>
            <div className="how-to" role="note"><span className="emoji" aria-hidden="true">{skillEmoji[step.modality]}</span><span>{how[step.modality]}</span></div>

            {(step.modality === 'reading' || step.modality === 'speaking') && (
              <>
                <h2 className="sentence">{lesson.text}</h2>
                {lang === 'en' && lesson.en && <p className="gloss">{lesson.en}</p>}
              </>
            )}
            {step.modality === 'reading' && step.prompt_text && <p className="question">{step.prompt_text}</p>}
            {step.modality === 'writing' && <h2 className="sentence" style={{ fontSize: 'clamp(1.6rem,5vw,2.4rem)' }}>{step.prompt_text}</h2>}

            {(step.modality === 'listening' || step.modality === 'speaking') && (
              <div className="actions">
                <button className={step.modality === 'listening' ? 'primary' : 'secondary'} onClick={() => listen(false)}><span className="emoji" aria-hidden="true">🔊</span> {t.listen}</button>
                <button className="secondary" onClick={() => listen(true)}><span className="emoji" aria-hidden="true">🐢</span> {t.listenSlow}</button>
              </div>
            )}
            {voiceNote && <p className="notice" role="status">{voiceNote}</p>}

            {step.modality === 'speaking' && (
              <div style={{ marginTop: '1rem' }}>
                <Recorder key={step.activity_id} learner={learner} passage={step.micro_item_id} lang={lang} onResult={saveSpeech} />
                <p className="notice">{t.audioNotice}</p>
              </div>
            )}

            {(step.modality === 'reading' || step.modality === 'listening') && (
              <div className="choice-row" role="group" aria-label={t.chooseFits}>
                {(step.options ?? []).map((option, i) => {
                  const label = optionText(option)
                  return (
                    <button key={`${i}-${label}`} className={picked === label ? 'choice picked' : 'choice'} disabled={locked}
                      onClick={() => { setPicked(label); record(label, 'deferred') }}>{label}</button>
                  )
                })}
              </div>
            )}

            {step.modality === 'writing' && (
              <div className="write-box">
                <div className="field">
                  <label htmlFor="write-text">{t.writeHere}</label>
                  <textarea id="write-text" value={text} maxLength={MAX_WRITING} disabled={locked} placeholder={t.writeHere} onChange={e => setText(e.target.value)} />
                </div>
                <button className="primary big-action" disabled={locked || !text.trim()} onClick={() => record(writingResponse(text), 'deferred')}>{t.writeScreenSend}</button>
                <div className="or-line">{t.or}</div>
                <button className="secondary big-action" disabled={locked} onClick={() => record(PAPER_HANDOFF, 'deferred')}>{t.writeBookSend}</button>
                <p className="notice">{t.writeSeen}</p>
              </div>
            )}

            {justDone && feedback?.speech && <ChildResult result={feedback.speech} lang={lang} next={nextStep} />}
            {justDone && !feedback?.speech && (
              <div className="result" role="status">
                <h3>{t.saved}</h3>
                <p>{t.savedNote}</p>
                <div className="actions"><button className="primary" onClick={nextStep}>{t.next}</button></div>
              </div>
            )}
            {message && !justDone && (
              <div className="notice error" role="alert">
                <p>{message}</p>
                {lastCall && <button className="secondary" style={{ marginTop: '.6rem' }} onClick={() => record(lastCall.response, lastCall.machine, lastCall.speech)}>{t.retry}</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
