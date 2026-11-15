export type Verdict = 'auto_ok' | 'auto_practice' | 'defer'
export type ReadingHumanVerdict = 'correct' | 'acceptable_minor_slip' | 'incorrect' | 'uncertain'
export type ComprehensionVerdict = 'understood' | 'with_help' | 'not_yet' | 'not_sure'
export type SessionType = 'speech' | 'typed_demo'
export type ActivityModality = 'reading' | 'listening' | 'speaking' | 'writing'
export type TeacherResult = 'correct' | 'with_help' | 'not_yet' | 'not_sure'

export interface Question { question_id: string; question_text: string; question_lang: string; question_version: string; question_status: string }
export interface Item { id: string; content_type: 'micro_item' | 'passage'; level: string; title: string; text: string; en?: string; picture?: string; source: string; validator_status: string; content_version: string | number; content_hash: string; lang_tag: string; word_count?: number; questions?: Question[] }
export interface NextResponse { passage: Item; level: string; draft: boolean }
export interface AttemptResult { id: string; trace_id: string; heard: string; accuracy: number; confidence: number; deferred: boolean; verdict: Verdict; reason: string; feedback: string; source: string; validator: string; engine: string; session_type: SessionType; alignment?: [string | null, string | null, 'ok' | 'omit' | 'sub' | 'ins'][]; errors?: { omit: number; sub: number; ins: number } }
export interface Dashboard { attempts: number; learners: number; avg_accuracy: number; deferral_rate: number; confirmed_rate: number; typed_demo_attempts: number; citation_rate: number; per_learner: [string, number, number][]; demo_data?: boolean }
export interface EvalSummary { status: 'ok' | 'no_comparable_samples'; comparable_samples: number; excluded_uncertain_samples: number; false_wrong_count: number; false_correct_count: number; false_wrong_rate: number | null; false_correct_rate: number | null; invalid_label_order_samples: string[]; caveat: string; indicative?: boolean }
export interface Health { ok: boolean }
export interface ComprehensionResult { event_id: string; question_id: string; verdict: ComprehensionVerdict; mode: string }

export interface Activity {
  activity_id: string; micro_item_id: string; learning_area: string; topic: string; concept: string; band: string
  modality: ActivityModality; target_skill: string; prompt_text: string; prompt_audio_file: string
  picture: string; options: string[]; expected_response: string; answer_key?: string; marking_method: string
  content_version: string; source_id: string; status: string; validator_status: string
  content_hash: string; parent_text: string; parent_en: string
}
export interface ActivityList { learner: string; activities: Activity[]; draft: boolean }
export interface ActivityEvent { event_id: string; response_text?: string; learner: string; activity_id: string; modality: ActivityModality; content_hash: string; machine_result: string; teacher_result: TeacherResult | null; final_result: TeacherResult | null; marked_by: string | null; session_id: string | null; created_at: string | null; marked_at: string | null }
export interface ActivityQueue { events: ActivityEvent[] }
export interface ActivityProgress { learner: string; by_modality: { modality: ActivityModality; events: number; marked: number }[] }
export interface GuideResult { query: string; answer: string; citation_status: string; citation?: string; source_url?: string; results: { chunk_id: string; title: string; location: string; license_status: string; rights_decision: string; text: string; score: number; citation: string }[] }
