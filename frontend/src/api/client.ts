import type { ActivityEvent, ActivityList, ActivityProgress, ActivityQueue, AttemptResult, ComprehensionResult, Dashboard, EvalSummary, GuideResult, NextResponse, Health, ReadingHumanVerdict, ComprehensionVerdict, TeacherResult } from './types'

import { detailText } from '../lib/errors'

export type ApiErrorKind = 'Offline' | 'Timeout' | 'Unauthorized' | 'RateLimited' | 'Validation' | 'EmptyBank' | 'NotServed' | 'Server'
export class ApiError extends Error { constructor(public kind: ApiErrorKind, message: string, public status?: number) { super(message) } }

const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
export const apiBase = base

async function request<T>(path: string, init: RequestInit = {}, timeout = 8000, retry = true): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal })
    if (!response.ok) {
      let detail = response.statusText
      try { detail = detailText(await response.json(), detail) } catch { /* plain response */ }
      const kind: ApiErrorKind = response.status === 401 ? 'Unauthorized' : response.status === 429 ? 'RateLimited' : response.status === 400 ? 'Validation' : response.status === 404 && detail.startsWith('empty_bank') ? 'EmptyBank' : response.status === 404 ? 'NotServed' : response.status >= 500 ? 'Server' : 'Validation'
      throw new ApiError(kind, detail, response.status)
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if ((error as DOMException).name === 'AbortError') throw new ApiError('Timeout', 'The connection took too long.')
    if (retry && init.method !== 'POST') { await new Promise(resolve => window.setTimeout(resolve, 600)); return request<T>(path, init, timeout, false) }
    throw new ApiError('Offline', 'No connection to the server.')
  } finally { window.clearTimeout(timer) }
}

export const health = () => request<Health>('/health')
export const nextItem = (learner: string) => request<NextResponse>(`/api/next?learner=${encodeURIComponent(learner)}`)
export const dashboard = (token?: string) => request<Dashboard>('/api/dashboard', token ? { headers: { Authorization: `Bearer ${token}` } } : {})
export const attempt = (form: FormData, token?: string) => request<AttemptResult>('/api/attempt', { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} }, 30000, false)
export const confirmReading = (id: string, verdict: ReadingHumanVerdict, token?: string) => formPost<{ ok: boolean }>('/api/confirm', { id, verdict }, token)
export const submitComprehension = (fields: { learner: string; question_id: string; verdict: ComprehensionVerdict; mode: string; attempt_id?: string; passage: string }, token?: string) => formPost<ComprehensionResult>('/api/comprehension', fields, token)
export const login = (pin: string) => formPost<{ token: string; expires_in: number }>('/api/facilitator/login', { pin })
export const answerKey = (questionId: string, token: string) => request<{ question_id: string; answer_key: string }>(`/api/facilitator/answer-key?question_id=${encodeURIComponent(questionId)}`, { headers: { Authorization: `Bearer ${token}` } })
export const evalSummary = (token?: string) => request<EvalSummary>('/api/eval/summary', token ? { headers: { Authorization: `Bearer ${token}` } } : {})
export const listActivities = (learner: string, modality?: string) => request<ActivityList>(`/api/activities?learner=${encodeURIComponent(learner)}${modality ? `&modality=${encodeURIComponent(modality)}` : ''}`)
export const respondActivity = (payload: { learner: string; activity_id: string; response: string; machine_result: string; session_id?: string }) => request<{ event_id: string; activity_id: string; machine_result: string; teacher_result: null; final_result: null }>('/api/activity/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const activityQueue = (token: string) => request<ActivityQueue>('/api/activity/queue', { headers: { Authorization: `Bearer ${token}` } })
export const markActivity = (event_id: string, teacher_result: TeacherResult, token: string) => request<ActivityEvent>('/api/activity/mark', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event_id, teacher_result }) })
export const activityProgress = (learner: string) => request<ActivityProgress>(`/api/activity/progress?learner=${encodeURIComponent(learner)}`)
export const guideSearch = (query: string, token: string) => request<GuideResult>(`/api/guide/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } })

async function formPost<T>(path: string, fields: Record<string, string>, token?: string) {
  const form = new FormData(); Object.entries(fields).forEach(([key, value]) => { if (value) form.append(key, value) })
  return request<T>(path, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} }, 8000, false)
}
