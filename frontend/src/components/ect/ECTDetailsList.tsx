import { useEffect, useState } from 'react'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ECTProcedureDetailPanel } from './ECTProcedureDetailPanel'

interface ECTDetailsListProps {
  patient?: string
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
}

/**
 * The "ECT Details" listing now surfaces the ECT Procedure records directly
 * (the ECT Details backend is left untouched). Columns: date, no, anaesthetist,
 * nurse, energy (up to three), creator (owner) and remarks (notes).
 */
interface ECTProcedureRow {
  name: string
  patient?: string
  patient_name?: string
  date?: string
  date_of_session?: string
  no_of_session?: number
  energy?: string
  energy_value2?: string
  energy_value3?: string
  anaesthetist?: string
  anaesthetist_name?: string
  nurse?: string
  nurse_name?: string
  note_remarks?: string
  ect_doctors_notes?: string
  ect_nurse_notes?: string
  extra_remarks?: string
  owner?: string
  owner_username?: string
}

const ECT_PROCEDURE_FIELDS = [
  'name',
  'patient',
  'patient_name',
  'date',
  'date_of_session',
  'no_of_session',
  'energy',
  'energy_value2',
  'energy_value3',
  'anaesthetist',
  'anaesthetist_name',
  'nurse',
  'nurse_name',
  'note_remarks',
  'ect_doctors_notes',
  'ect_nurse_notes',
  'extra_remarks',
  'owner',
]

function formatDate(value?: string): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB')
}

/** Text Editor values arrive as HTML — flatten to plain text for the grid. */
function stripHtml(value?: string): string {
  if (!value) return ''
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "Remarks" column — the record notes. ECT Procedure carries the notes across a
 * few fields; show whichever one the record actually holds.
 */
function resolveRemarks(row: ECTProcedureRow): string {
  const candidates = [
    row.note_remarks,
    row.ect_doctors_notes,
    row.ect_nurse_notes,
    row.extra_remarks,
  ]
  for (const candidate of candidates) {
    const text = stripHtml(candidate)
    if (text) return text
  }
  return ''
}

/** Energy can be recorded up to three times per session. */
function resolveEnergy(row: ECTProcedureRow): string {
  const parts = [row.energy, row.energy_value2, row.energy_value3]
    .map((v) => (v === undefined || v === null ? '' : String(v).trim()))
    .filter(Boolean)
  return parts.join(' / ')
}

/** Map user ids (owner) to a friendly display name. */
async function resolveUserLabels(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.map((id) => (id || '').trim()).filter(Boolean))]
  if (!unique.length) return {}
  try {
    const params = new URLSearchParams({
      doctype: 'User',
      fields: JSON.stringify(['name', 'full_name', 'username']),
      filters: JSON.stringify([['name', 'in', unique]]),
      limit_page_length: String(unique.length),
    })
    const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
    const data = await res.json()
    const map: Record<string, string> = {}
    for (const user of Array.isArray(data?.message) ? data.message : []) {
      map[user.name] = user.username || user.full_name || user.name
    }
    return map
  } catch {
    return {}
  }
}

export const ECTDetailsList = ({ patient, refreshKey, onPatientClick }: ECTDetailsListProps) => {
  const [rows, setRows] = useState<ECTProcedureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [listRefreshKey, setListRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const filters: [string, string, string][] = []
        if (patient) filters.push(['patient', '=', patient])
        const params = new URLSearchParams({
          doctype: 'ECT Procedure',
          fields: JSON.stringify(ECT_PROCEDURE_FIELDS),
          filters: JSON.stringify(filters),
          order_by: 'date_of_session desc, creation desc',
          limit: '50',
        })
        const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
        const data = await res.json()
        const raw: ECTProcedureRow[] = Array.isArray(data?.message) ? data.message : []
        const labels = await resolveUserLabels(raw.map((r) => r.owner || ''))
        if (!cancelled) {
          setRows(
            raw.map((r) => ({ ...r, owner_username: labels[r.owner || ''] || r.owner || '' })),
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load ECT Procedures'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [patient, refreshKey, listRefreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading ECT Procedures...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading ECT Procedures</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">NO ECT PROCEDURE FOUND</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="min-w-full whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                No
              </th>
              {!patient && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Anaesthetist
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Nurse
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Energy
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Nurse (Creator)
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Remarks
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-[100px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => {
              const energy = resolveEnergy(row)
              const remarks = resolveRemarks(row)
              return (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatDate(row.date_of_session || row.date)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setDetailName(row.name)}
                      className="text-primary hover:underline text-left focus:outline-none font-medium"
                      title="View ECT Procedure"
                    >
                      {typeof row.no_of_session === 'number' ? row.no_of_session : '—'}
                    </button>
                    <div className="text-[11px] text-slate-400">{row.name}</div>
                  </td>
                  {!patient && (
                    <td
                      className="px-4 py-3 text-sm cursor-pointer"
                      onClick={() => row.patient && onPatientClick?.(row.patient)}
                    >
                      <span className="font-medium text-primary hover:underline">
                        {row.patient_name || row.patient || '-'}
                      </span>
                    </td>
                  )}
                  <td
                    className="px-4 py-3 text-sm text-slate-700 max-w-[200px] truncate"
                    title={row.anaesthetist_name || row.anaesthetist || ''}
                  >
                    {row.anaesthetist_name || row.anaesthetist || '-'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 max-w-[180px] truncate"
                    title={row.nurse_name || row.nurse || ''}
                  >
                    {row.nurse_name || row.nurse || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{energy || '-'}</td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 max-w-[180px] truncate"
                    title={row.owner_username || row.owner || ''}
                  >
                    {row.owner_username || row.owner || '-'}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-slate-700 max-w-[280px] truncate"
                    title={remarks}
                  >
                    {remarks || '-'}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
                      <PrintFormatDropdown
                        doctype="ECT Procedure"
                        docName={row.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {detailName ? (
        <ECTProcedureDetailPanel
          name={detailName}
          onClose={() => setDetailName(null)}
          onChanged={() => setListRefreshKey((k) => k + 1)}
        />
      ) : null}
    </>
  )
}
