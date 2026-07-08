import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  importInsuranceClaims,
  uploadInsuranceImportFile,
  type ImportInsuranceClaimsResult,
} from '../../services/common'

interface ImportInsuranceClaimsModalProps {
  onClose: () => void
  onImported?: () => void
}

interface FilePickerProps {
  label: string
  hint: string
  file: File | null
  required?: boolean
  onPick: (file: File | null) => void
}

const FilePicker = ({ label, hint, file, required, onPick }: FilePickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
      >
        <div className="rounded-md bg-emerald-50 p-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          {file ? (
            <div className="truncate text-sm font-medium text-slate-800">{file.name}</div>
          ) : (
            <div className="text-sm text-slate-500">Click to choose an Excel file (.xlsx)</div>
          )}
          <div className="text-[11px] text-slate-400">{hint}</div>
        </div>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPick(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  )
}

const SummaryStat = ({ label, value, tone = 'slate' }: { label: string; value: number; tone?: string }) => {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${tones[tone] || tones.slate}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}

export const ImportInsuranceClaimsModal = ({ onClose, onImported }: ImportInsuranceClaimsModalProps) => {
  const [masterFile, setMasterFile] = useState<File | null>(null)
  const [childFile, setChildFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportInsuranceClaimsResult | null>(null)

  const runImport = async () => {
    if (!masterFile) {
      setError('The master claim file (INSURANCE_00_01) is required')
      return
    }
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      setStage('Uploading master file…')
      const masterUrl = await uploadInsuranceImportFile(masterFile)

      let childUrl: string | undefined
      if (childFile) {
        setStage('Uploading services file…')
        childUrl = await uploadInsuranceImportFile(childFile)
      }

      setStage('Importing claims (this can take a minute)…')
      const res = await importInsuranceClaims(masterUrl, childUrl)
      setResult(res)
      toast.success(`Imported ${res.created} insurance claim(s)`) 
      onImported?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
      setStage('')
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={createModalShellClass('max-w-xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Import Insurance Claims"
          subtitle="Upload the TRICARE legacy claim files (master + services)"
          icon={<UploadCloud className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error || undefined}
        />

        <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-5 sm:px-6 space-y-4`}>
          {!result ? (
            <>
              <section className={`${MODAL_SECTION_CLASS} space-y-3`}>
                <h3 className={MODAL_SECTION_TITLE_CLASS}>Files</h3>
                <FilePicker
                  label="Master claims (INSURANCE_00_01)"
                  hint="One row per claim — TRANS_NUM, patient, amounts, status"
                  file={masterFile}
                  required
                  onPick={setMasterFile}
                />
                <FilePicker
                  label="Claim services (INSURANCE_00_02)"
                  hint="Service lines linked to each claim by TRANS_NUM"
                  file={childFile}
                  onPick={setChildFile}
                />
              </section>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-xs text-emerald-900">
                Claims import as <strong>TRICARE</strong> and are tagged <strong>Legacy</strong>. Each
                patient is marked insured (TRICARE) and gets an Insurance Patient Register if they don't
                already have one. Existing claims (same Trans No) are skipped.
              </div>

              {busy && stage && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  {stage}
                </div>
              )}
            </>
          ) : (
            <section className={`${MODAL_SECTION_CLASS} space-y-4`}>
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="text-sm font-semibold">Import complete</h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <SummaryStat label="Created" value={result.created} tone="emerald" />
                <SummaryStat label="Updated" value={result.updated} tone="emerald" />
                <SummaryStat label="Submitted" value={result.submitted} tone="emerald" />
                <SummaryStat label="Skipped" value={result.skipped} tone="amber" />
                <SummaryStat label="Errors" value={result.error_count} tone={result.error_count ? 'red' : 'slate'} />
                <SummaryStat label="Master rows" value={result.total_master_rows} />
                <SummaryStat label="Patients insured" value={result.patients_insured} />
                <SummaryStat label="Registers created" value={result.registers_created} />
                <SummaryStat label="New patients" value={result.patients_created} />
              </div>
              {result.patients_created > 0 && (
                <p className="text-xs text-slate-500">
                  {result.patients_created} new patient record(s) were created for unknown patient numbers.
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> First {result.errors.length} error(s)
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-[11px] text-red-700">
                        <span className="font-mono font-medium">{e.trans_no}</span>: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <CreateModalFooter hint={result ? 'Done' : 'Large files may take up to a minute to import.'}>
          <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={busy}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button type="button" onClick={runImport} disabled={busy || !masterFile} className={CM_BTN_PRIMARY}>
              {busy ? 'Importing…' : 'Upload & Import'}
            </button>
          )}
        </CreateModalFooter>
      </div>
    </div>
  )
}
