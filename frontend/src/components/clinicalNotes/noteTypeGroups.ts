/**
 * Clinical Note Type groupings used by note listings.
 *
 * Therapy screens list clinical notes whose type is "Therapist Note" **or** "General
 * Note": the Oracle migration imported the older therapy notes (old note types 4 / OCC)
 * as "General Note", so those legacy rows must stay visible next to new therapy notes.
 */
export const THERAPY_EXTRA_NOTE_TYPES: string[] = ['General Note']
