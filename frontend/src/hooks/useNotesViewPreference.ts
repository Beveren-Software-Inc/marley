import { useCallback, useState } from 'react'

export type TherapyNotesView = 'notes' | 'admission' | 'visit'

export const DEFAULT_NOTES_VIEW_STORAGE_KEYS = {
  therapy: 'therapyNotesView',
  therapyPsychologist: 'therapyPsychologistNotesView',
  therapyNutrition: 'therapyNutritionNotesView',
  psychologist: 'psychologistNotesView',
  psychologistNutrition: 'psychologistNutritionNotesView',
  nutritionist: 'nutritionistNotesView',
} as const

function isTherapyNotesView(value: unknown): value is TherapyNotesView {
  return value === 'notes' || value === 'admission' || value === 'visit'
}

function readSavedNotesView(storageKey: string): TherapyNotesView {
  try {
    const saved = localStorage.getItem(storageKey)
    if (isTherapyNotesView(saved)) return saved
  } catch {
    // Ignore storage failures (private mode / storage disabled).
  }
  return 'notes'
}

/**
 * Remembers the selected notes/admission/visit view across page refreshes.
 * Stored per card (storageKey) so each notes page keeps its own view.
 */
export function useNotesViewPreference(storageKey: string) {
  const [view, setView] = useState<TherapyNotesView>(() => readSavedNotesView(storageKey))

  const updateView = useCallback(
    (next: TherapyNotesView) => {
      setView(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // Ignore storage failures (private mode / storage disabled).
      }
    },
    [storageKey],
  )

  return [view, updateView] as const
}
