export function readSession(key: string, fallback = '') { try { return sessionStorage.getItem(key) || fallback } catch { return fallback } }
export function writeSession(key: string, value: string) { try { sessionStorage.setItem(key, value) } catch { /* storage can be unavailable in private browsing */ } }
export function removeSession(key: string) { try { sessionStorage.removeItem(key) } catch { /* storage can be unavailable in private browsing */ } }
export function readPreference(key: string, fallback = '') { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
export function writePreference(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* storage can be unavailable in private browsing */ } }
