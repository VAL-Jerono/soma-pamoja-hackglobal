import { useEffect, useRef, useState } from 'react'
import { attempt } from '../api/client'
import type { AttemptResult } from '../api/types'
import { copy, type Lang } from '../i18n'
import { buildAttemptForm } from '../lib/attemptForm'
import { childErrorMessage } from '../lib/errors'

type RecorderProps = {
  learner: string
  passage: string
  lang: Lang
  onResult: (result: AttemptResult) => void
}

/**
 * Browser microphone capture for one read-aloud attempt.
 * Audio lives in memory only. It is sent to POST /api/attempt with the learner code and passage id,
 * which the backend requires, and is never written to browser storage.
 */
export function Recorder({ learner, passage, lang, onResult }: RecorderProps) {
  const t = copy[lang]
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const media = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const cancelled = useRef(false)

  // Leaving the screen mid-recording releases the microphone and sends nothing.
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
      const rec = media.current
      if (rec && rec.state !== 'inactive') rec.stop()
      rec?.stream.getTracks().forEach(track => track.stop())
    }
  }, [])

  const start = async () => {
    setMessage('')
    if (!window.isSecureContext || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      setMessage(t.micSecure)
      return
    }
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      // Left the screen while the permission prompt was open: release the microphone at once.
      if (cancelled.current) { stream.getTracks().forEach(track => track.stop()); return }
      const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const live = stream
      chunks.current = []
      started.current = Date.now()
      rec.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data) }
      rec.onstop = async () => {
        live.getTracks().forEach(track => track.stop())
        setRecording(false)
        if (cancelled.current) return
        const blob = new Blob(chunks.current, { type: rec.mimeType })
        chunks.current = []
        if (Date.now() - started.current < 800) { setMessage(t.tooShort); return }
        setBusy(true)
        setMessage(t.checking)
        try {
          const result = await attempt(buildAttemptForm(blob, rec.mimeType.includes('mp4') ? 'a.m4a' : 'a.webm', learner, passage))
          setMessage('')
          onResult(result)
        } catch (error) {
          setMessage(childErrorMessage(error, lang))
        } finally {
          setBusy(false)
        }
      }
      media.current = rec
      rec.start()
      setRecording(true)
    } catch {
      stream?.getTracks().forEach(track => track.stop())
      setMessage(t.micNeeded)
    }
  }

  const stop = () => media.current?.stop()

  return (
    <>
      <button
        className={recording ? 'warm big-action' : 'primary big-action'}
        disabled={busy || !learner || !passage}
        onClick={recording ? stop : start}
      >
        {recording ? `● ${t.stop}` : `◉ ${t.read}`}
      </button>
      {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
    </>
  )
}
