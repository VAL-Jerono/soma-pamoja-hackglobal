import { describe, expect, it } from 'vitest'
import { childMessage, isLearnerCode } from '../src/lib/validation'

describe('frontend trust contracts', () => {
  it('accepts pseudonymous learner codes only', () => {
    expect(isLearnerCode('L-001')).toBe(true)
    expect(isLearnerCode('L-123456')).toBe(true)
    expect(isLearnerCode('Asha')).toBe(false)
    expect(isLearnerCode('L-12')).toBe(false)
  })
  it('keeps child messages warm and non-numeric', () => {
    expect(childMessage('auto_ok')).toContain('Vizuri')
    expect(childMessage('auto_practice')).not.toContain('%')
    expect(childMessage('defer')).toContain('mwezeshaji')
  })
})
