/** Speaks Kiswahili with a voice already on the device. Returns false when no Kiswahili voice exists. Nothing is stored. */
export function speakKiswahili(text: string): boolean {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('sw'))
    if (!voice) return false
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice.lang || 'sw-KE'
    utterance.voice = voice
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}
