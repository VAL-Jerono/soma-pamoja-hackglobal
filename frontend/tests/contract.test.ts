import { describe, expect, it } from 'vitest'
import { copy } from '../src/i18n'
import { machineResultFor, newChildSessionId, optionText } from '../src/lib/activity'
import { buildAttemptForm } from '../src/lib/attemptForm'
import { childErrorMessage, detailText, facilitatorErrorMessage, pinErrorMessage } from '../src/lib/errors'
import { childMessage, isLearnerCode, normalizeLearnerInput } from '../src/lib/validation'

describe('frontend trust contracts', () => {
  it('accepts pseudonymous learner codes only', () => {
    expect(isLearnerCode('L-001')).toBe(true)
    expect(isLearnerCode('L-123456')).toBe(true)
    expect(isLearnerCode('Asha')).toBe(false)
    expect(isLearnerCode('L-12')).toBe(false)
    expect(isLearnerCode('amina@example.com')).toBe(false)
  })
  it('strips names and emails while a learner code is typed', () => {
    expect(normalizeLearnerInput('l-001')).toBe('L-001')
    expect(normalizeLearnerInput('amina@example.com')).not.toContain('@')
  })
  it('keeps child messages warm and non-numeric', () => {
    expect(childMessage('auto_ok')).toContain('Vizuri')
    expect(childMessage('auto_practice')).not.toContain('%')
    expect(childMessage('defer')).toContain('mwezeshaji')
  })
})

describe('speech attempt form', () => {
  it('sends learner and passage with the audio, which the backend requires', () => {
    const form = buildAttemptForm(new Blob(['x'], { type: 'audio/webm' }), 'a.webm', 'L-001', 'SW-M-001')
    expect(form.get('learner')).toBe('L-001')
    expect(form.get('passage')).toBe('SW-M-001')
    expect(form.get('audio')).not.toBe(null)
  })
})

describe('activity helpers', () => {
  it('never renders [object Object] for picture options', () => {
    expect(optionText('📖')).toBe('📖')
    expect(optionText({ label: '🌾' })).toBe('🌾')
    expect(optionText({ text: '💧' })).toBe('💧')
    expect(optionText({ value: 'x' })).toBe('x')
    expect(optionText(null)).toBe('')
    expect(optionText({ other: 1 })).not.toContain('[object Object]')
  })
  it('relays the server verdict and never invents correctness', () => {
    expect(machineResultFor('auto_ok')).toBe('auto_correct')
    expect(machineResultFor('auto_practice')).toBe('auto_practice')
    expect(machineResultFor('defer')).toBe('deferred')
  })
  it('makes a session id the backend accepts', () => {
    const id = newChildSessionId(1700000000000, 0.123456)
    expect(id.startsWith('child-')).toBe(true)
    expect(id.length).toBeLessThanOrEqual(100)
  })
})

describe('error messages', () => {
  it('turns FastAPI 422 detail lists into text, never [object Object]', () => {
    const text = detailText({ detail: [{ type: 'missing', loc: ['body', 'learner'], msg: 'Field required' }] }, 'Unprocessable')
    expect(text).toBe('Field required')
    expect(text).not.toContain('[object Object]')
    expect(detailText({ detail: 'bad_pin' }, 'x')).toBe('bad_pin')
    expect(detailText({}, 'fallback')).toBe('fallback')
    expect(detailText(null, 'fallback')).toBe('fallback')
  })
  it('never shows a child raw API detail', () => {
    const raw = { kind: 'Server', status: 500, message: 'psycopg.OperationalError: connection refused' }
    for (const lang of ['en', 'sw'] as const) {
      expect(childErrorMessage(raw, lang)).not.toContain('psycopg')
      expect(childErrorMessage({ kind: 'Offline' }, lang)).toBe(copy[lang].offline)
      expect(childErrorMessage({ kind: 'EmptyBank', message: 'empty_bank: no validated passages' }, lang)).toBe(copy[lang].noActivity)
    }
  })
  it('keeps a wrong PIN, a lockout, a missing server setting and a connection failure apart', () => {
    const messages = [pinErrorMessage({ status: 401 }), pinErrorMessage({ status: 429 }), pinErrorMessage({ status: 503 }), pinErrorMessage({ kind: 'Offline' })]
    expect(new Set(messages).size).toBe(4)
    expect(messages[0]).toContain('not accepted')
    expect(messages[3]).toContain('could not be reached')
  })
  it('tells an expired facilitator session apart from a normal failure', () => {
    expect(facilitatorErrorMessage({ kind: 'Unauthorized' }, 'fallback')).toContain('session has ended')
    expect(facilitatorErrorMessage({ kind: 'Server', message: 'facilitator_auth_required' }, 'fallback')).toBe('fallback')
  })
})

describe('copy rules', () => {
  it('has the same keys in Kiswahili and English', () => {
    expect(Object.keys(copy.sw).sort()).toEqual(Object.keys(copy.en).sort())
  })
  it('uses no em dashes or en dashes in user facing text', () => {
    const all = [...Object.values(copy.sw), ...Object.values(copy.en)].join(' ')
    expect(all).not.toContain('\u2014')
    expect(all).not.toContain('\u2013')
  })
  it('shows a child no scores, confidence or reason codes in result copy', () => {
    for (const lang of ['sw', 'en'] as const) {
      const text = [copy[lang].great, copy[lang].practice, copy[lang].handover, copy[lang].handoverNote, copy[lang].readTogether, copy[lang].readAgain].join(' ')
      expect(text).not.toMatch(/\d/)
      expect(text).not.toMatch(/confidence|accuracy|wrong/i)
    }
  })
})
