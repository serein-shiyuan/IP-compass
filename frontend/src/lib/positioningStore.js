const STORAGE_KEY = 'ipcompass_positioning'

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

export function clearProgress() {
  localStorage.removeItem(STORAGE_KEY)
}

export function hasSavedProgress() {
  return loadProgress() !== null
}
