import { useState, useEffect } from 'react'
import { fetchClinicalNotes, type ClinicalNote } from '../../services/clinicalNotes'
import { DetailSlideOver } from '../ui/DetailSlideOver'
import { DocDetailView } from '../ui/DocDetailView'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { useCareContext } from '../../providers/CareContextProvider'

// Helper function to strip HTML tags and decode HTML entities
const stripHtml = (html: string): string => {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

interface ClinicalNotesListProps {
  patient?: string
  medicalRole?: string
  clinicalNoteType?: string
  noteType?: string
  hideTypes?: boolean
  onPatientClick?: (patient: string) => void
}

export const ClinicalNotesList = ({ 
  patient, 
  medicalRole, 
  clinicalNoteType,
  noteType,
  hideTypes = false,
  onPatientClick,
}: ClinicalNotesListProps) => {
  const { mode, activeVisit, activeAdmission } = useCareContext()
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const loadClinicalNotes = async () => {
      try {
        setLoading(true)
        setError(null)
        
        let referenceDoctype: string | undefined
        let referenceDocument: string | undefined
        
        // Add care context filters based on current mode and selected visit/admission
        if (mode === 'OP' && activeVisit) {
          referenceDoctype = 'Patient Visit'
          referenceDocument = activeVisit
          console.log('🔵 Filtering by OP Visit:', { referenceDoctype, referenceDocument })
        } else if (mode === 'IP' && activeAdmission) {
          referenceDoctype = 'Inpatient Admission'
          referenceDocument = activeAdmission
          console.log('🟢 Filtering by IP Admission:', { referenceDoctype, referenceDocument })
        } else {
          console.log('⚪ No care context filter - mode:', mode, 'activeVisit:', activeVisit, 'activeAdmission:', activeAdmission)
        }
        
        const response = await fetchClinicalNotes(
          50, // limit
          0, // offset
          patient,
          medicalRole,
          clinicalNoteType,
          noteType,
          referenceDoctype,
          referenceDocument
        )
        
        setClinicalNotes(response)
      } catch (err) {
        console.error('Error loading clinical notes:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch clinical notes'))
      } finally {
        setLoading(false)
      }
    }

    loadClinicalNotes()
  }, [patient, medicalRole, clinicalNoteType, noteType, mode, activeVisit, activeAdmission])

  const getContextLabel = () => {
    if (mode === 'OP' && activeVisit) {
      return `Showing notes for OP Visit: ${activeVisit}`
    }
    if (mode === 'IP' && activeAdmission) {
      return `Showing notes for IP Admission: ${activeAdmission}`
    }
    return null
  }

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

  const contextLabel = getContextLabel()
  
  if (clinicalNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-slate-500 text-center">
          {contextLabel && (
            <p className="text-sm text-slate-600 mb-2">{contextLabel}</p>
          )}
          <p>No clinical notes found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      {contextLabel && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          {contextLabel}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Date
              </th>
              {!patient && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
              )}
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
                Reference
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Note
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {clinicalNotes.map((note) => (
              <tr key={note.name} className="hover:bg-slate-50">
                <td
                  className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                  onClick={() => setDetailName(note.name)}
                >
                  <span className="text-primary hover:underline">
                    {note.posting_date 
                      ? new Date(note.posting_date).toLocaleString() 
                      : '-'}
                  </span>
                </td>
                {!patient && (
                  <td
                    className="px-4 py-3 text-sm text-slate-700 cursor-pointer"
                    onClick={() => note.patient && onPatientClick?.(note.patient)}
                  >
                    <span className="font-medium text-primary hover:underline">{note.patient_name || note.patient || '-'}</span>
                  </td>
                )}
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
                <td className="px-4 py-3 text-sm text-slate-700">
                  {note.reference_doctype && note.reference_document ? (
                    <div className="text-xs">
                      <div className="font-semibold text-slate-800">{note.reference_doctype}</div>
                      <div className="text-slate-500 truncate max-w-[150px]">{note.reference_document}</div>
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 max-w-md">
                  <div className="truncate" title={note.note ? stripHtml(note.note) : ''}>
                    {note.note ? (() => {
                      const plainText = stripHtml(note.note)
                      return plainText.length > 100 ? `${plainText.substring(0, 100)}...` : plainText
                    })() : '-'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 text-center">
                  <PrintFormatDropdown
                    doctype="Clinical Note"
                    docName={note.name}
                    noLetterhead={0}
                    triggerPrint={1}
                    className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailName && (
        <DetailSlideOver
          title="Clinical Note"
          subtitle={detailName}
          onClose={() => setDetailName(null)}
        >
          <DocDetailView doctype="Clinical Note" name={detailName} />
        </DetailSlideOver>
      )}
    </div>
  )
}