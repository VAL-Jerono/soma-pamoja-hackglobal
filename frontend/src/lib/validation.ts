export const learnerCodePattern = /^L-\d{3,6}$/
export const isLearnerCode = (value: string) => learnerCodePattern.test(value)
export const childMessage = (verdict: 'auto_ok' | 'auto_practice' | 'defer') => verdict === 'auto_ok' ? 'Vizuri sana!' : verdict === 'auto_practice' ? 'Ni vizuri kujaribu! Tusome tena pamoja.' : 'Tuangalie pamoja na mwezeshaji.'
