export const learnerCodePattern = /^L-\d{3,6}$/
export const isLearnerCode = (value: string) => learnerCodePattern.test(value)
export const childMessage = (verdict: 'auto_ok' | 'auto_practice' | 'defer') => verdict === 'auto_ok' ? 'Vizuri sana!' : verdict === 'auto_practice' ? 'Ni vizuri kujaribu! Tusome tena pamoja.' : 'Tuangalie pamoja na mwalimu.'
/** Keeps only the characters a pseudonymous learner code can contain, so names and emails cannot be typed in. */
export const normalizeLearnerInput = (value: string) => value.toUpperCase().replace(/[^L0-9-]/g, '')
