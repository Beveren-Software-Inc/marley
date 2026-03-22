import { useState, useEffect } from 'react'
import { Pencil, FlaskConical, X, ExternalLink } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PricingRow        { patient_category: string; price: number }
interface GroupRow          { lab_test_template: string; lab_test_description: string; group_event: string; group_test_uom: string; secondary_uom: string }
interface NormalRow         { lab_test_event: string; lab_test_uom: string; normal_range: string; secondary_uom: string; conversion_factor: string }
interface DescriptiveRow    { particulars: string }
interface SampleRow         { sample: string; sample_qty: number; sample_details: string }

interface TemplateDetail {
  name: string
  lab_test_name: string
  department: string
  lab_test_template_type: string
  is_group: number
  is_billable: number
  disabled: number
  nursing_checklist_template: string
  item: string
  lab_test_code: string
  lab_test_group: string
  link_existing_item: number
  lab_test_uom: string
  secondary_uom: string
  lab_test_description: string
  worksheet_instructions: string
  legend_print_position: string
  result_legend: string
  pricing: PricingRow[]
  lab_test_groups: GroupRow[]
  normal_test_templates: NormalRow[]
  descriptive_test_templates: DescriptiveRow[]
  sample_requirements: SampleRow[]
}

interface LabTestTemplateDetailPanelProps {
  templateName: string
  onClose: () => void
  onEdit: () => void
  onRequestLabTest: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 flex-1 break-words">{String(value)}</span>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
}

// ─── Main component ───────────────────────────────────────────────────────────

export const LabTestTemplateDetailPanel = ({
  templateName, onClose, onEdit, onRequestLabTest,
}: LabTestTemplateDetailPanelProps) => {
  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ name: templateName })
        const res = await fetch(`/api/method/healthcare.api.common.get_lab_test_template_detail?${params}`)
        const data = await res.json()
        if (data?.message) setDetail(data.message as TemplateDetail)
        else setError('Template not found')
      } catch {
        setError('Failed to load template details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [templateName])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Lab Test Template</p>
            <p className="text-sm font-semibold text-slate-800">{detail?.lab_test_name || templateName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRequestLabTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary rounded-md hover:bg-primary/5">
              <FlaskConical className="w-3.5 h-3.5" /> Request
            </button>
            <button type="button" onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <a href={`/app/lab-test-template/${encodeURIComponent(templateName)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button type="button" onClick={onClose}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ scrollbarWidth: 'thin' }}>
          {loading && <div className="text-sm text-slate-400 text-center py-10">Loading…</div>}
          {error && <div className="text-sm text-red-600 py-4">{error}</div>}

          {detail && (
            <>
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                {detail.is_group ? <Badge label="Group Template" color="bg-violet-100 text-violet-700" /> : null}
                <Badge label={detail.is_billable ? 'Billable' : 'Not Billable'} color={detail.is_billable ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} />
                <Badge label={detail.disabled ? 'Disabled' : 'Active'} color={detail.disabled ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'} />
                {detail.lab_test_template_type && <Badge label={detail.lab_test_template_type} color="bg-blue-100 text-blue-700" />}
              </div>

              {/* Basic Info */}
              <SectionCard title="Basic Information">
                <InfoRow label="Template Name" value={detail.lab_test_name} />
                <InfoRow label="Department" value={detail.department} />
                <InfoRow label="Result Format" value={detail.lab_test_template_type} />
                <InfoRow label="UOM" value={detail.lab_test_uom} />
                <InfoRow label="Secondary UOM" value={detail.secondary_uom} />
                <InfoRow label="Nursing Checklist" value={detail.nursing_checklist_template} />
              </SectionCard>

              {/* Billing */}
              <SectionCard title="Billing">
                <InfoRow label="Item" value={detail.item} />
                <InfoRow label="Lab Test Code" value={detail.lab_test_code} />
                <InfoRow label="Item Group" value={detail.lab_test_group} />
              </SectionCard>

              {/* Pricing tiers */}
              {detail.pricing?.length > 0 && (
                <SectionCard title={`Pricing (${detail.pricing.length} tier${detail.pricing.length !== 1 ? 's' : ''})`}>
                  <table className="min-w-full text-sm my-2">
                    <thead>
                      <tr className="text-left">
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-6">Patient Category</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.pricing.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-6 text-slate-700">{r.patient_category || '—'}</td>
                          <td className="py-1.5 text-slate-800 font-medium text-right">{r.price != null ? r.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {/* Normal test items (Single / Compound) */}
              {detail.normal_test_templates?.length > 0 && (
                <SectionCard title={`Test Parameters (${detail.normal_test_templates.length})`}>
                  <table className="min-w-full text-sm my-2">
                    <thead>
                      <tr className="text-left">
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Event / Test</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">UOM</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Secondary UOM</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1">Normal Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.normal_test_templates.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-4 text-slate-800 font-medium">{r.lab_test_event || '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600 text-xs">{r.lab_test_uom || '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600 text-xs">{r.secondary_uom || '—'}</td>
                          <td className="py-1.5 text-slate-600 text-xs">{r.normal_range || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {/* Descriptive test items */}
              {detail.descriptive_test_templates?.length > 0 && (
                <SectionCard title={`Descriptive Parameters (${detail.descriptive_test_templates.length})`}>
                  <ul className="divide-y divide-slate-100 py-1">
                    {detail.descriptive_test_templates.map((r, i) => (
                      <li key={i} className="py-1.5 text-sm text-slate-800">{r.particulars || '—'}</li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {/* Group tests */}
              {detail.lab_test_groups?.length > 0 && (
                <SectionCard title={`Group Tests (${detail.lab_test_groups.length})`}>
                  <table className="min-w-full text-sm my-2">
                    <thead>
                      <tr className="text-left">
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Template</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Event</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lab_test_groups.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-4 text-slate-800 font-medium">{r.lab_test_template || '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600 text-xs">{r.group_event || r.lab_test_description || '—'}</td>
                          <td className="py-1.5 text-slate-600 text-xs">{r.group_test_uom || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {/* Imaging description */}
              {detail.lab_test_description && detail.lab_test_template_type === 'Imaging' && (
                <SectionCard title="Imaging Description">
                  <p className="py-3 text-sm text-slate-700 whitespace-pre-wrap">{detail.lab_test_description}</p>
                </SectionCard>
              )}

              {/* Sample Requirements */}
              {detail.sample_requirements?.length > 0 && (
                <SectionCard title={`Sample Requirements (${detail.sample_requirements.length})`}>
                  <table className="min-w-full text-sm my-2">
                    <thead>
                      <tr className="text-left">
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Sample</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1 pr-4">Qty</th>
                        <th className="text-xs font-semibold text-slate-500 pb-1">Details / Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sample_requirements.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-4 text-slate-800 font-medium">{r.sample || '—'}</td>
                          <td className="py-1.5 pr-4 text-slate-600">{r.sample_qty ?? '—'}</td>
                          <td className="py-1.5 text-slate-600 text-xs">{r.sample_details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {/* Worksheet & Legend */}
              {(detail.worksheet_instructions || detail.result_legend || detail.legend_print_position) && (
                <SectionCard title="Worksheet & Legend">
                  <div className="py-3 space-y-3">
                    {detail.worksheet_instructions && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Worksheet Instructions</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.worksheet_instructions}</p>
                      </div>
                    )}
                    {detail.result_legend && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Result Legend</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.result_legend}</p>
                      </div>
                    )}
                    {detail.legend_print_position && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Legend Print Position</p>
                        <p className="text-sm text-slate-700">{detail.legend_print_position}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
