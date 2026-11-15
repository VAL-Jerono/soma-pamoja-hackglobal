import type { Activity, ActivityModality } from '../api/types'

/** The four skills, in the order a child meets them inside one lesson. */
export const SKILL_ORDER: ActivityModality[] = ['reading', 'listening', 'speaking', 'writing']

export type Theme = 'school' | 'family' | 'animals' | 'water' | 'default'

export type Lesson = {
  id: string
  theme: Theme
  picture: string
  text: string
  en: string
  activities: Activity[]
}

export function themeFor(topic: string): Theme {
  const key = (topic || '').toLowerCase()
  return key === 'school' || key === 'family' || key === 'animals' || key === 'water' ? key : 'default'
}

/**
 * Groups the flat activity list into lessons, one per sentence.
 * Activities that share a micro item become the read, listen, speak and write steps of one lesson.
 * The input list is never changed.
 */
export function buildLessons(activities: readonly Activity[]): Lesson[] {
  const order: string[] = []
  const byItem = new Map<string, Activity[]>()
  for (const activity of activities) {
    const key = activity.micro_item_id || activity.activity_id
    if (!byItem.has(key)) { byItem.set(key, []); order.push(key) }
    byItem.get(key)!.push(activity)
  }
  return order.map(key => {
    const steps = [...byItem.get(key)!].sort((a, b) => SKILL_ORDER.indexOf(a.modality) - SKILL_ORDER.indexOf(b.modality))
    const first = steps[0]
    return { id: key, theme: themeFor(first.topic), picture: first.picture || '📖', text: first.parent_text, en: first.parent_en, activities: steps }
  })
}

export const isLessonDone = (lesson: Lesson, done: ReadonlySet<string>) => lesson.activities.every(a => done.has(a.activity_id))

/** Index of the first lesson with something left to do, or -1 when everything is finished. */
export function firstOpenLesson(lessons: readonly Lesson[], done: ReadonlySet<string>): number {
  return lessons.findIndex(lesson => !isLessonDone(lesson, done))
}

/** First step in a lesson that is not done yet, or -1. */
export function firstOpenStep(lesson: Lesson, done: ReadonlySet<string>): number {
  return lesson.activities.findIndex(a => !done.has(a.activity_id))
}

export function parseDone(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
