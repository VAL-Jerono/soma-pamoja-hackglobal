import { describe, expect, it } from 'vitest'
import { copy } from '../src/i18n'
import { machineResultFor, newChildSessionId, optionText } from '../src/lib/activity'
import { buildAttemptForm } from '../src/lib/attemptForm'
import { childErrorMessage, detailText, facilitatorErrorMessage, pinErrorMessage } from '../src/lib/errors'
import { buildLessons, firstOpenLesson, firstOpenStep, isLessonDone, parseDone } from '../src/lib/lessons'
import { learnerName, parseRoster, removeLearner, upsertLearner } from '../src/lib/roster'
import { PAPER_HANDOFF, writingResponse } from '../src/lib/activity'
import type { Activity } from '../src/api/types'
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
    expect(childMessage('defer')).toContain('mwalimu')
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

const act = (id: string, modality: Activity['modality'], item: string, topic = 'school'): Activity => ({
  activity_id: id, micro_item_id: item, learning_area: 'x', topic, concept: 'x', band: 'b', modality, target_skill: 's', prompt_text: 'p', prompt_audio_file: '', picture: '📖', options: [],
  expected_response: '', marking_method: 'm', content_version: '1', source_id: 's', status: 'draft', validator_status: 'draft', content_hash: 'h', parent_text: 'Mtoto anasoma kitabu.', parent_en: 'The child reads.'
})

describe('lessons', () => {
  const list = [act('A4', 'writing', 'M1'), act('A1', 'reading', 'M1'), act('A3', 'speaking', 'M1'), act('A2', 'listening', 'M1'), act('A5', 'speaking', 'M2', 'family')]
  it('groups activities into lessons and orders read, listen, speak, write', () => {
    const lessons = buildLessons(list)
    expect(lessons).toHaveLength(2)
    expect(lessons[0].activities.map(a => a.modality)).toEqual(['reading', 'listening', 'speaking', 'writing'])
    expect(lessons[1].theme).toBe('family')
  })
  it('does not change the list it was given', () => {
    const before = list.map(a => a.activity_id)
    buildLessons(list)
    expect(list.map(a => a.activity_id)).toEqual(before)
  })
  it('resumes at the first unfinished step and lesson', () => {
    const lessons = buildLessons(list)
    expect(firstOpenLesson(lessons, new Set())).toBe(0)
    expect(firstOpenStep(lessons[0], new Set(['A1', 'A2']))).toBe(2)
    expect(isLessonDone(lessons[0], new Set(['A1', 'A2', 'A3', 'A4']))).toBe(true)
    expect(firstOpenLesson(lessons, new Set(['A1', 'A2', 'A3', 'A4']))).toBe(1)
    expect(firstOpenLesson(lessons, new Set(['A1', 'A2', 'A3', 'A4', 'A5']))).toBe(-1)
  })
  it('reads saved day progress safely', () => {
    expect(parseDone('["A1","A2"]')).toEqual(['A1', 'A2'])
    expect(parseDone('not json')).toEqual([])
    expect(parseDone('{"a":1}')).toEqual([])
    expect(parseDone(null)).toEqual([])
  })
})

describe('writing response', () => {
  it('sends typed text, or the paper marker when nothing was typed', () => {
    expect(writingResponse('  kitabu ')).toBe('kitabu')
    expect(writingResponse('   ')).toBe(PAPER_HANDOFF)
    expect(writingResponse('a'.repeat(5000)).length).toBe(4000)
  })
})

describe('private teacher roster', () => {
  it('keeps labels on the device and only valid pseudonymous codes', () => {
    const roster = parseRoster(JSON.stringify([{ code: 'L-001', label: 'Amina', note: '' }, { code: 'Amina', label: 'x' }, { code: 'L-001', label: 'dup' }]))
    expect(roster).toHaveLength(1)
    expect(learnerName(roster, 'L-001')).toBe('Amina (L-001)')
    expect(learnerName(roster, 'L-002')).toBe('L-002')
  })
  it('adds, updates and removes without changing the input', () => {
    const a = upsertLearner([], { code: 'L-001', label: 'Amina' }, 1)
    const b = upsertLearner(a, { code: 'L-001', note: 'needs help' }, 2)
    expect(a[0].note).toBe('')
    expect(b[0]).toMatchObject({ label: 'Amina', note: 'needs help', lastSeen: 2 })
    expect(removeLearner(b, 'L-001')).toEqual([])
  })
  it('survives corrupt storage', () => {
    expect(parseRoster('{{')).toEqual([])
    expect(parseRoster(null)).toEqual([])
  })
})
