import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { fetchDoctypeRows, deleteDoctypeRow } from '../../services/doctypeResource'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
  isEditableWithin24hFromCreation,
} from '../../constants/nursingShift'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CreateIPMedicalReportModal } from './CreateIPMedicalReportModal'
import { IPMedicalReportDetailPanel } from './IPMedicalReportDetailPanel'

const STATUS_TONE: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Issued: 'bg-green-100 text-green-800 border-green-200',
  Cancelled: 'bg-red-100 text-red-800 border-red-200',
}

const LIST_FIELDS = [
  'name',
  'patient',
  'patient_name',
  'case_no',
  'admission_date',
  'discharge_date',
  'practitioner',
  'report_status',
  'creation',
]

function formatDate(value?: unknown): string {
  if (value == null || value === '') return '—'
  const s = String(value)
  try {
    return new Date(s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00`).toLocaleDateString('en-GB')
  } catch {
    return s
  }
}

interface IPMedicalReportListProps {
  patient?: string | null
  refreshKey?: number | string
  onPatientClick?: (patient: string) => void
}

export function IPMedicalReportList({
  patient,
  refreshKey,
  onPatientClick,
}: IPMedicalReportListProps) {
  const { guardClinicalEdit, lockEditingData } = useCareContext()
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [detail, setDetail] = useState<{ name: string; preview?: Record<string, any> } | null>(null)
  const [editName, setEditName] = useState<string | null>(null)
  const [deleteRow, setDeleteRow] = useState<Record<string, any> | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = patient ? { patient } : {}
      setRows(await fetchDoctypeRows('IP Medical Report', LIST_FIELDS, filters, 100, 'modified desc'))
    } catch (e) {
      setRows([])
      toast.error(e instanceof Error ? e.message : 'Failed to load IP Medical Reports')
    } finally {
      setLoading(false)
    }
  }, [patient])

  useEffect(() => {
    load()
  }, [load, refreshKey, localRefresh])

  useEffect(() => {
    if (!openActionRow) return
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openActionRow])

  const canMutateRow = (row: Record<string, any>) =>
    Boolean(row?.creation) &&
    isEditableWithin24hFromCreation(String(row.creation || ''), true) &&
    !lockEditingData

  const openView = (row: Record<string, any>) => {
    setOpenActionRow(null)
    setDetail({ name: String(row.name), preview: row })
  }

  const openEdit = (row: Record<string, any>) => {
    setOpenActionRow(null)
    if (!canMutateRow(row)) {
      toast.error(
        lockEditingData
          ? 'Editing is locked in Healthcare Settings.'
          : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
      )
      return
    }
    guardClinicalEdit(() => setEditName(String(row.name)))
  }

  const openDelete = (row: Record<string, any>) => {
    setOpenActionRow(null)
    if (!canMutateRow(row)) {
      toast.error(
        lockEditingData
          ? 'Editing is locked in Healthcare Settings.'
          : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE,
      )
      return
    }
    guardClinicalEdit(() => setDeleteRow(row))
  }

  const confirmDelete = async () => {
    if (!deleteRow?.name) return
    setDeleting(true)
    try {
      await deleteDoctypeRow('IP Medical Report', String(deleteRow.name))
      toast.success('IP Medical Report deleted')
      if (detail?.name === deleteRow.name) setDetail(null)
      if (editName === deleteRow.name) setEditName(null)
      setDeleteRow(null)
      setLocalRefresh((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete report')
    } finally {
      setDeleting(false)
    }
  }

  const bump = () => setLocalRefresh((n) => n + 1)

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Report</th>
              <th className="px-3 py-2 text-left font-medium">Patient</th>
              <th className="px-3 py-2 text-left font-medium">Case No</th>
              <th className="px-3 py-2 text-left font-medium">Admitted</th>
              <th className="px-3 py-2 text-left font-medium">Discharged</th>
              <th className="px-3 py-2 text-left font-medium">Consultant</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium w-[1%] whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No IP medical report issued yet.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const status = String(row.report_status || '')
                const tone = STATUS_TONE[status] || 'bg-slate-100 text-slate-700 border-slate-200'
                const mutable = canMutateRow(row)
                return (
                  <tr
                    key={row.name}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => openView(row)}
                  >
                    <td className="px-3 py-2 align-middle font-medium text-slate-800">{row.name || '—'}</td>
                    <td className="px-3 py-2 align-middle">{row.patient_name || row.patient || '—'}</td>
                    <td className="px-3 py-2 align-middle">{row.case_no || '—'}</td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">{formatDate(row.admission_date)}</td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">{formatDate(row.discharge_date)}</td>
                    <td className="px-3 py-2 align-middle">{row.practitioner || '—'}</td>
                    <td className="px-3 py-2 align-middle">
                      {status ? (
                        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                          {status}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className="px-3 py-2 align-middle text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <div
                          className="relative"
                          ref={openActionRow === row.name ? actionMenuRef : undefined}
                        >
                          <button
                            type="button"
                            aria-label="Actions"
                            onClick={() =>
                              setOpenActionRow((prev) => (prev === row.name ? null : row.name))
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </button>
                          <PortalActionsMenu
                            open={openActionRow === row.name}
                            onClose={() => setOpenActionRow(null)}
                            triggerRef={actionMenuRef}
                            minWidth={160}
                          >
                            <button
                              type="button"
                              onClick={() => openView(row)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            >
                              <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              disabled={!mutable}
                              title={
                                mutable
                                  ? 'Edit (within 24 hours of creation)'
                                  : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE
                              }
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openDelete(row)}
                              disabled={!mutable}
                              title={
                                mutable
                                  ? 'Delete (within 24 hours of creation)'
                                  : DAILY_ROUTINE_EDIT_LOCKED_MESSAGE
                              }
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
                              Delete
                            </button>
                          </PortalActionsMenu>
                        </div>
                        <PrintFormatDropdown
                          doctype="IP Medical Report"
                          docName={String(row.name)}
                          noLetterhead={0}
                          triggerPrint={1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-primary hover:bg-slate-50"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {detail && (
        <IPMedicalReportDetailPanel
          name={detail.name}
          preview={detail.preview}
          onClose={() => setDetail(null)}
          onPatientClick={onPatientClick}
          onChanged={bump}
        />
      )}

      {editName && (
        <CreateIPMedicalReportModal
          editName={editName}
          onClose={() => setEditName(null)}
          onSuccess={() => {
            setEditName(null)
            bump()
            if (detail?.name === editName) {
              setDetail({ name: editName })
            }
          }}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          open
          title="Delete IP Medical Report?"
          message={`Delete ${deleteRow.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onCancel={() => setDeleteRow(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
