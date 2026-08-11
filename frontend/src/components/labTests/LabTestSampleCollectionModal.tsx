import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  canEditLabTestSampleCollection,
  canRecordAdHocSampleCollection,
  createSampleCollectionForLabGroup,
  createSampleCollectionForLabSample,
  getSampleCollectionForLabSample,
  updateSampleCollectionForLabSample,
  type LabTest,
  type LabTestSampleInstance,
} from '../../services/labTests'
import { fetchUsers, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { stripHtmlToText } from '../ui/dashboardCardListing'
import { fromDatetimeLocalValue } from '../../utils/datetimeLocal'

export interface LabTestSampleCollectionModalProps {
  labTest: LabTest
  /** When set, save applies collection to every child in the group. */
  groupChildren?: LabTest[]
  groupLabel?: string
  /** Service Request for the group (kept separately because get_lab_test may omit it). */
  groupServiceRequest?: string
  loading?: boolean
  error?: string | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}

interface RowDraft {
  collected: boolean
  qty: string
  notes: string
  collectionPoint: string
  collectedBy: string
  collectedByLabel: string
  existingCollection?: string
  loadingExisting: boolean
}

const defaultDraft = (): RowDraft => ({
  collected: false,
  qty: '',
  notes: '',
  collectionPoint: '',
  collectedBy: '',
  collectedByLabel: '',
  loadingExisting: false,
})

function nowForObservation(): string {
  return fromDatetimeLocalValue()
}

function instructionPreview(details?: string | null): string {
  if (!details) return ''
  const plain = stripHtmlToText(details)
  return plain.length > 280 ? `${plain.slice(0, 280)}…` : plain
}

function SampleRowForm({
  row,
  draft,
  canEdit,
  minimal,
  saving,
  userOptions,
  userQuery,
  userOpen,
  onUserQueryChange,
  onUserOpenChange,
  onDraftChange,
  onSave,
}: {
  row: LabTestSampleInstance | null
  draft: RowDraft
  canEdit: boolean
  minimal: boolean
  saving: boolean
  userOptions: LinkFieldOption[]
  userQuery: string
  userOpen: boolean
  onUserQueryChange: (q: string) => void
  onUserOpenChange: (open: boolean) => void
  onDraftChange: (patch: Partial<RowDraft>) => void
  onSave: () => void
}) {
  const hasSample = Boolean(row?.sample)
  const hasInstructions = Boolean(instructionPreview(row?.sample_details))
  const title = hasSample ? row?.sample : 'Sample collection'
  const isExisting = Boolean(draft.existingCollection)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {hasSample && row?.sample_qty != null ? (
            <p className="text-xs text-slate-500 mt-0.5">Expected qty: {row.sample_qty}</p>
          ) : null}
        </div>
        {isExisting ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              Collected
            </span>
            <button
              type="button"
              onClick={() => window.open(`/app/sample-collection/${encodeURIComponent(draft.existingCollection!)}`, '_blank')}
              className="text-xs text-primary hover:underline"
            >
              Open record
            </button>
          </div>
        ) : null}
      </div>

      {hasInstructions ? (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
          {instructionPreview(row?.sample_details)}
        </p>
      ) : null}

      {draft.loadingExisting ? (
        <p className="text-xs text-slate-500">Loading collection details…</p>
      ) : canEdit ? (
        <>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.collected}
              onChange={(e) => onDraftChange({ collected: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-800">Sample collected</span>
          </label>

          {minimal ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea
                value={draft.notes}
                onChange={(e) => onDraftChange({ notes: e.target.value })}
                placeholder="Enter collection notes…"
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-y min-h-[72px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft.qty}
                  onChange={(e) => onDraftChange({ qty: e.target.value })}
                  placeholder="Qty"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-slate-600 mb-1">Collected by</label>
                <input
                  type="text"
                  value={draft.collectedBy ? draft.collectedByLabel : userQuery}
                  onChange={(e) => {
                    onDraftChange({ collectedBy: '', collectedByLabel: '' })
                    onUserQueryChange(e.target.value)
                    onUserOpenChange(true)
                  }}
                  onFocus={() => onUserOpenChange(true)}
                  placeholder="Search user…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {userOpen && userOptions.length > 0 ? (
                  <div className="absolute z-30 mt-1 w-full max-h-40 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                    {userOptions.map((opt) => (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => {
                          onDraftChange({ collectedBy: opt.name, collectedByLabel: opt.label || opt.name })
                          onUserQueryChange('')
                          onUserOpenChange(false)
                        }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        {opt.label || opt.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Collected from</label>
                <input
                  type="text"
                  value={draft.collectionPoint}
                  onChange={(e) => onDraftChange({ collectionPoint: e.target.value })}
                  placeholder="Ward, clinic, bedside, etc."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => onDraftChange({ notes: e.target.value })}
                  placeholder="Collection notes…"
                  rows={hasInstructions ? 2 : 3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-y min-h-[72px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={saving || !draft.collected}
              onClick={onSave}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isExisting ? 'Update collection' : 'Save collection'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500 italic">This lab test is no longer in the sample collection workflow.</p>
      )}
    </div>
  )
}

const EMPTY_SAMPLE_ROWS: (LabTestSampleInstance | null)[] = [null]

export function LabTestSampleCollectionModal({
  labTest,
  groupChildren,
  groupLabel,
  groupServiceRequest,
  loading = false,
  error = null,
  onClose,
  onSaved,
}: LabTestSampleCollectionModalProps) {
  const serviceRequest = (groupServiceRequest || labTest.service_request || '').trim()
  const isGroupMode = (groupChildren?.length ?? 0) > 0 && Boolean(serviceRequest)
  const groupCount = groupChildren?.length ?? 0

  const sampleInstancesKey = useMemo(
    () => JSON.stringify(labTest.sample_instances ?? []),
    [labTest.sample_instances]
  )

  // Group collection is a single general form that applies to all children.
  const rows = useMemo((): (LabTestSampleInstance | null)[] => {
    if (isGroupMode) return EMPTY_SAMPLE_ROWS
    if (labTest.sample_instances?.length) return labTest.sample_instances
    return EMPTY_SAMPLE_ROWS
  }, [isGroupMode, sampleInstancesKey, labTest.sample_instances])

  const isSimpleCollectionRow = (row: LabTestSampleInstance | null) => {
    if (isGroupMode) return true
    if (!row?.sample && !instructionPreview(row?.sample_details)) return true
    const qty = row?.sample_qty
    return qty == null || qty === 0
  }

  const rowCanEdit = (_row: LabTestSampleInstance | null, draft: RowDraft) => {
    if (isGroupMode) {
      return (groupChildren || []).some((c) => canRecordAdHocSampleCollection(c))
    }
    if (draft.existingCollection) {
      return canEditLabTestSampleCollection(labTest.status)
    }
    return canRecordAdHocSampleCollection(labTest)
  }

  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [savingRow, setSavingRow] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [userOptions, setUserOptions] = useState<LinkFieldOption[]>([])
  const [userOpenRow, setUserOpenRow] = useState<number | null>(null)

  const initDraftForRow = useCallback((row: LabTestSampleInstance | null): RowDraft => {
    const base = defaultDraft()
    if (row?.sample_qty != null) base.qty = String(row.sample_qty)
    if (row?.sample_collection) base.existingCollection = row.sample_collection
    return base
  }, [])

  useEffect(() => {
    const next: Record<number, RowDraft> = {}
    rows.forEach((row, idx) => {
      next[idx] = initDraftForRow(row)
    })
    setDrafts(next)
  }, [labTest.name, sampleInstancesKey, initDraftForRow, rows, isGroupMode])

  useEffect(() => {
    if (isGroupMode) return
    rows.forEach((row, idx) => {
      if (!row?.sample_collection) return
      setDrafts((prev) => ({
        ...prev,
        [idx]: { ...(prev[idx] || defaultDraft()), loadingExisting: true },
      }))
      getSampleCollectionForLabSample(labTest.name, idx)
        .then((data) => {
          setDrafts((prev) => ({
            ...prev,
            [idx]: {
              ...(prev[idx] || defaultDraft()),
              collected: true,
              qty: data.sample_qty != null ? String(data.sample_qty) : prev[idx]?.qty || '',
              notes: stripHtmlToText(data.sample_details || row.sample_details || ''),
              collectionPoint: data.collection_point || '',
              collectedBy: data.collected_by || '',
              collectedByLabel: data.collected_by_name || data.collected_by || '',
              existingCollection: data.sample_collection,
              loadingExisting: false,
            },
          }))
        })
        .catch(() => {
          setDrafts((prev) => ({
            ...prev,
            [idx]: { ...(prev[idx] || defaultDraft()), loadingExisting: false },
          }))
        })
    })
  }, [labTest.name, sampleInstancesKey, rows, isGroupMode])

  useEffect(() => {
    if (userOpenRow === null) return
    const t = setTimeout(async () => {
      try {
        setUserOptions(await fetchUsers(userQuery.trim() || undefined))
      } catch {
        setUserOptions([])
      }
    }, userQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [userQuery, userOpenRow])

  const patchDraft = (idx: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({ ...prev, [idx]: { ...(prev[idx] || defaultDraft()), ...patch } }))
  }

  const handleSaveRow = async (idx: number) => {
    const draft = drafts[idx] || defaultDraft()
    const row = rows[idx]
    if (!draft.collected) {
      setFormError('Tick “Sample collected” before saving.')
      return
    }
    const notes = draft.notes.trim()
    const qty = draft.qty.trim() === '' ? undefined : parseFloat(draft.qty)

    const observationRows = row?.sample
      ? [
          {
            sample: row.sample,
            sample_qty: qty ?? row.sample_qty ?? 0,
            status: 'Collected' as const,
            collection_date_time: nowForObservation(),
            collection_point: draft.collectionPoint.trim() || undefined,
            collected_by: draft.collectedBy || undefined,
          },
        ]
      : undefined

    try {
      setSavingRow(idx)
      setFormError(null)
      if (isGroupMode) {
        if (!serviceRequest) {
          throw new Error('This group is missing a service request')
        }
        const res = await createSampleCollectionForLabGroup(
          serviceRequest,
          notes || undefined,
          draft.collectionPoint.trim() || undefined,
          undefined,
          qty,
          draft.collectedBy || undefined
        )
        toast.success(
          `Sample collection saved for ${res.count} test${res.count === 1 ? '' : 's'} in this group`
        )
      } else if (draft.existingCollection) {
        await updateSampleCollectionForLabSample(
          labTest.name,
          idx,
          notes || undefined,
          draft.collectionPoint.trim() || undefined,
          undefined,
          observationRows,
          qty,
          draft.collectedBy || undefined
        )
        toast.success('Sample collection updated')
      } else {
        const res = await createSampleCollectionForLabSample(
          labTest.name,
          idx,
          notes || undefined,
          draft.collectionPoint.trim() || undefined,
          undefined,
          observationRows,
          qty,
          draft.collectedBy || undefined
        )
        toast.success(`Sample collection ${res.sample_collection} saved`)
      }
      await onSaved()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save sample collection'
      setFormError(msg)
      toast.error(msg)
    } finally {
      setSavingRow(null)
    }
  }

  const subtitle = useMemo(() => {
    if (isGroupMode) {
      return [
        labTest.patient_name || labTest.patient,
        groupLabel || labTest.lab_test_group_name || labTest.lab_test_group,
        `Applies to all ${groupCount} test${groupCount === 1 ? '' : 's'} in this group`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    return [labTest.patient_name || labTest.patient, labTest.lab_test_name].filter(Boolean).join(' · ')
  }, [isGroupMode, labTest, groupLabel, groupCount])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[90] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isGroupMode
                ? `Sample Collection — ${groupLabel || labTest.lab_test_group_name || 'Group'}`
                : `Sample Collection — ${labTest.name}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? <p className="text-sm text-slate-600">Loading sample instances…</p> : null}
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">{error}</div>
          ) : null}
          {formError ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-md px-3 py-2">
              {formError}
            </div>
          ) : null}
          {isGroupMode && !loading ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
              Ticking sample collected here marks sample collection done for every test in this group.
              Use Sample Collection on an individual row to update one test only.
            </div>
          ) : null}

          {!loading ? (
            <div className="space-y-4">
              {rows.map((row, idx) => {
                const draft = drafts[idx] || defaultDraft()
                const minimal = isSimpleCollectionRow(row)
                return (
                <SampleRowForm
                  key={idx}
                  row={row}
                  draft={draft}
                  canEdit={rowCanEdit(row, draft)}
                  minimal={minimal}
                  saving={savingRow === idx}
                  userOptions={userOpenRow === idx ? userOptions : []}
                  userQuery={userOpenRow === idx ? userQuery : ''}
                  userOpen={userOpenRow === idx}
                  onUserQueryChange={setUserQuery}
                  onUserOpenChange={(open) => {
                    setUserOpenRow(open ? idx : null)
                    if (!open) setUserQuery('')
                  }}
                  onDraftChange={(patch) => patchDraft(idx, patch)}
                  onSave={() => void handleSaveRow(idx)}
                />
              )})}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
