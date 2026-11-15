/**
 * Builds the multipart body for POST /api/attempt.
 * The backend requires learner and passage as form fields beside the audio.
 * Audio stays in memory as a Blob and is never written to storage by the frontend.
 */
export function buildAttemptForm(audio: Blob, filename: string, learner: string, passage: string): FormData {
  const form = new FormData()
  form.append('learner', learner)
  form.append('passage', passage)
  form.append('audio', audio, filename)
  return form
}
