import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, X, ChevronDown, Users, ShieldCheck, FileText, List, Ban } from 'lucide-react'
import {
  fetchHealthInsurances, fetchHealthInsuranceDetail, fetchInsuranceCompanies,
  type HealthInsuranceRow, type HealthInsuranceDetail, type LinkFieldOption,
} from '../../services/common'

type DetailTab = 'overview' | 'inclusive' | 'exclusive' | 'groups'

interface Props {
  refreshKey?: number
  onCreateNew: () => void
}

function Pct({ value }: { value?: number | null }) {
  if (value == null || value === 0) return <span className="text-slate-400">—</span>
  return <span className="font-medium text-emerald-700">{value}%</span>
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value ?? <span className="text-slate-400 italic">—</span>}</p>
    </div>
  )
}

function ItemTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      {name}
    </span>
  )
}

export const HealthInsuranceList = ({ refreshKey = 0, onCreateNew }: Props) => {
  const [rows, setRows] = useState<HealthInsuranceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Insurance company filter dropdown
  const [companyOptions, setCompanyOptions] = useState<LinkFieldOption[]>([])
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<LinkFieldOption | null>(null)
  const companyRef = useRef<HTMLDivElement>(null)

  // Detail slide-over
  const [detailRow, setDetailRow] = useState<HealthInsuranceRow | null>(null)
  const [detail, setDetail] = useState<HealthInsuranceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHealthInsurances(search || undefined, selectedCompany?.name)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [search, selectedCompany, refreshKey])

  useEffect(() => { load() }, [load])

  // Company dropdown search
  useEffect(() => {
    if (!companyOpen) return
    const t = setTimeout(async () => {
      const opts = await fetchInsuranceCompanies(companyQuery || undefined)
      setCompanyOptions(opts)
    }, companyQuery ? 300 : 0)
    return () => clearTimeout(t)
  }, [companyQuery, companyOpen])

  // Close company dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) setCompanyOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDetail = async (row: HealthInsuranceRow) => {
    setDetailRow(row)
    setDetail(null)
    setDetailTab('overview')
    setDetailLoading(true)
    try {
      const d = await fetchHealthInsuranceDetail(row.name)
      setDetail(d)
    } catch {
      // show basic info from row
    } finally {
      setDetailLoading(false)
    }
  }

  const DETAIL_TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',  label: 'Overview',        icon: ShieldCheck },
    { id: 'inclusive', label: 'Inclusive Items',  icon: List },
    { id: 'exclusive', label: 'Exclusive Items',  icon: Ban },
    { id: 'groups',    label: 'Excl. Groups',     icon: FileText },
  ]

  const inclusiveItems: any[] = detail?.doc?.inclusive_item ?? []
  const exclusiveItems: any[] = detail?.doc?.exclusive_item ?? []
  const exclusiveGroups: any[] = detail?.doc?.exclusive_item_group ?? []

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-48"
        />

        {/* Insurance company filter */}
        <div className="relative" ref={companyRef}>
          <button
            type="button"
            onClick={() => setCompanyOpen(v => !v)}
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span>{selectedCompany ? selectedCompany.label : 'All Companies'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {companyOpen && (
            <div className="absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg">
              <div className="p-2 border-b border-slate-100">
                <input
                  autoFocus
                  type="text"
                  value={companyQuery}
                  onChange={e => setCompanyQuery(e.target.value)}
                  placeholder="Search company…"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setSelectedCompany(null); setCompanyOpen(false); setCompanyQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  All Companies
                </button>
                {companyOptions.map(opt => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => { setSelectedCompany(opt); setCompanyOpen(false); setCompanyQuery('') }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedCompany && (
          <button
            type="button"
            onClick={() => setSelectedCompany(null)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500"
          >
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        )}

        <button
          type="button"
          onClick={onCreateNew}
          className="ml-auto flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 transition"
        >
          <span className="text-base leading-none">+</span> New Insurance
        </button>
      </div>

      {loading && <div className="py-6 text-center text-sm text-slate-400">Loading…</div>}
      {error && <div className="py-2 text-sm text-red-600">{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-400">No health insurance records found.</div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">Insurance</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">Company</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">Policy No</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide text-center">OP %</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide text-center">IP %</th>
                <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide text-center">Coverage %</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => (
                <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openDetail(row)}
                      className="font-medium text-primary hover:underline text-left"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{row.insurance_company || <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.policy_no || <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-center"><Pct value={row.outpatient_discount} /></td>
                  <td className="px-3 py-2.5 text-center"><Pct value={row.inpatient_discount} /></td>
                  <td className="px-3 py-2.5 text-center"><Pct value={row.insurance_coverage_} /></td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openDetail(row)}
                      className="p-1 rounded text-slate-400 hover:text-primary hover:bg-slate-100 transition"
                      title="View details"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={() => setDetailRow(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative z-10 flex flex-col bg-white shadow-2xl h-full w-full max-w-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{detailRow.name}</p>
                    <a
                      href={`/app/health-insurance/${encodeURIComponent(detailRow.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open in Frappe
                    </a>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{detailRow.insurance_company || 'Health Insurance'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailRow(null)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tab bar */}
              <div className="flex -mb-4 mt-3">
                {DETAIL_TABS.map(tab => {
                  const count = tab.id === 'inclusive' ? inclusiveItems.length
                    : tab.id === 'exclusive' ? exclusiveItems.length
                    : tab.id === 'groups' ? exclusiveGroups.length : null
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDetailTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                        detailTab === tab.id
                          ? 'border-primary text-primary'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                      {count !== null && count > 0 && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs ${
                          detailTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                        }`}>{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {detailLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-slate-400">Loading details…</div>
              )}

              {/* ── Overview ── */}
              {!detailLoading && detailTab === 'overview' && (
                <>
                  {detail && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-3 text-center">
                        <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                        <p className="text-2xl font-bold text-primary">{detail.patient_count}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Patients</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-center">
                        <ShieldCheck className="w-5 h-5 text-green-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-green-700">{detail.active_register_count}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Active Registers</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-center">
                        <p className="text-2xl font-bold text-slate-600">{detail.unused_register_count}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Unused Registers</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Basic Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Insurance Company" value={detailRow.insurance_company} />
                      <Field label="Policy No" value={detailRow.policy_no} />
                      <Field label="Insurance No" value={detailRow.insurance_no} />
                      <Field label="Default Mode of Payment" value={detailRow.mode_of_payment} />
                      <Field label="Coverage %" value={detailRow.insurance_coverage_ ? `${detailRow.insurance_coverage_}%` : undefined} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Discounts</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                        <p className="text-2xl font-bold text-emerald-700">{detailRow.outpatient_discount ?? 0}%</p>
                        <p className="text-xs text-slate-500 mt-1">Outpatient Discount</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-center">
                        <p className="text-2xl font-bold text-blue-700">{detailRow.inpatient_discount ?? 0}%</p>
                        <p className="text-xs text-slate-500 mt-1">Inpatient Discount</p>
                      </div>
                    </div>
                  </div>
                  {detail?.doc?.special_note && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Special Note</h3>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap rounded bg-slate-50 border border-slate-200 px-3 py-2">
                        {detail.doc.special_note}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ── Inclusive Items ── */}
              {!detailLoading && detailTab === 'inclusive' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">
                    Items listed here receive the insurance discount. If empty, the discount applies to all items (unless excluded).
                  </p>
                  {inclusiveItems.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No inclusive items — discount applies to all items.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {inclusiveItems.map((item, i) => (
                        <ItemTag key={i} name={item.item_code || item.name || ''} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Exclusive Items ── */}
              {!detailLoading && detailTab === 'exclusive' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">
                    Items listed here are <strong>excluded</strong> from the insurance discount — full price applies.
                  </p>
                  {exclusiveItems.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No exclusive items defined.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {exclusiveItems.map((item, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          {item.item_code || item.name || ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Exclusive Groups ── */}
              {!detailLoading && detailTab === 'groups' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">
                    Item groups listed here are <strong>excluded</strong> from the insurance discount.
                  </p>
                  {exclusiveGroups.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No exclusive item groups defined.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {exclusiveGroups.map((g, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                          {g.item_group || g.name || ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
              <a
                href={`/app/health-insurance/${encodeURIComponent(detailRow.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition"
              >
                <ExternalLink className="w-4 h-4" /> Edit in Frappe
              </a>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
