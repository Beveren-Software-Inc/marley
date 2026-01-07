import { useState, useEffect } from 'react'
import { fetchClinicalNotes, type ClinicalNote } from '../../services/clinicalNotes'

// Helper function to strip HTML tags and decode HTML entities
const stripHtml = (html: string): string => {
  if (!html) return ''
  // Create a temporary div element to parse HTML
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  // Get text content and clean up whitespace
  return tmp.textContent || tmp.innerText || ''
}

interface ClinicalNotesListProps {
  patient?: string
  medicalRole?: string
  clinicalNoteType?: string
  noteType?: string
  hideTypes?: boolean
}

export const ClinicalNotesList = ({ 
  patient, 
  medicalRole, 
  clinicalNoteType,
  noteType,
  hideTypes = false,
}: ClinicalNotesListProps) => {
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadClinicalNotes = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetchClinicalNotes(50, 0, patient, medicalRole, clinicalNoteType, noteType)
        setClinicalNotes(response)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch clinical notes'))
      } finally {
        setLoading(false)
      }
    }

    loadClinicalNotes()
  }, [patient, medicalRole, clinicalNoteType, noteType])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading clinical notes...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Clinical Notes</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (clinicalNotes.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No clinical notes found</div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      <table className="w-full min-w-[800px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Medical Role
            </th>
            {!hideTypes && (
              <>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Note Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Clinical Note Type
                </th>
              </>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Note
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {clinicalNotes.map((note) => (
            <tr key={note.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm text-slate-700">
                {note.posting_date 
                  ? new Date(note.posting_date).toLocaleString() 
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {note.patient_name || note.patient || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {note.practitioner_name || note.practitioner || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {note.medical_role_name || note.medical_role || '-'}
              </td>
              {!hideTypes && (
                <>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.note_type || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {note.clinical_note_type_name || note.clinical_note_type || '-'}
                  </td>
                </>
              )}
              <td className="px-4 py-3 text-sm text-slate-700 max-w-md">
                <div className="truncate" title={note.note ? stripHtml(note.note) : ''}>
                  {note.note ? (() => {
                    const plainText = stripHtml(note.note)
                    return plainText.length > 100 ? `${plainText.substring(0, 100)}...` : plainText
                  })() : '-'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


