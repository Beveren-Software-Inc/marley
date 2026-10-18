import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { formatDateOnlyDisplay } from '../../utils/admissionDateTime'
import {
  changeAdmissionPackage,
  fetchAdmissionPackageDetails,
  type AdmissionPackageDetailsResponse,
  type InpatientPackage,
} from '../../services/inpatientRecords'
import { PackageSelectionModal } from './PackageSelectionModal'

interface AdmissionPackageTabProps {
  admissionName: string
  onChanged?: () => void
}

function money(value: number | undefined, currency: string): string {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} ${currency}`
}

function sourceLabel(source: AdmissionPackageDetailsResponse['package_source']): string {
  switch (source) {
    case 'admission':
      return 'Admission'
    case 'enrollment':
      return 'Enrollment'
    case 'quotation':
      return 'Quotation'
    case 'package_detail':
      return 'Package charges'
    case 'custom':
      return 'Custom rate'
    default:
      return ''
  }
}

function PackageStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export const AdmissionPackageTab = ({ admissionName, onChanged }: AdmissionPackageTabProps) => {
  const [data, setData] = useState<AdmissionPackageDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showChangeModal, setShowChangeModal] = useState(false)
  const [changing, setChanging] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchAdmissionPackageDetails(admissionName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load package details'))
    } finally {
      setLoading(false)
    }
  }, [admissionName])

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectPackage = async (pkg: InpatientPackage) => {
    setShowChangeModal(false)
    setChanging(true)
    try {
      const result = await changeAdmissionPackage(
        admissionName,
        pkg.name,
        pkg.name === '__custom__' ? pkg.package_rate : undefined
      )
      setData(result)
      toast.success(result.message || `Package updated to ${pkg.package_name}`)
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change package')
    } finally {
      setChanging(false)
    }
  }

  if (loading && !data) {
    return <div className="py-8 text-center text-slate-500">Loading package details...</div>
  }

  if (error && !data) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-600">{error.message}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { active_package: pkg, summary, default_currency: currency } = data
  const dailyRate = pkg?.daily_rate || pkg?.package_rate || 0
  const source = sourceLabel(data.package_source)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Active Package</h3>
          <p className="text-xs text-slate-500">
            Package applied to this admission and the charges posted against it.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh package details"
            className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {data.can_change_package ? (
            <button
              type="button"
              onClick={() => setShowChangeModal(true)}
              disabled={changing}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {changing ? 'Updating...' : pkg ? 'Change Package' : 'Assign Package'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error.message}</p> : null}

      {pkg ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold text-slate-900">{pkg.package_name}</h4>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Active
                </span>
                {pkg.is_custom ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Custom
                  </span>
                ) : null}
                {source ? <span className="text-xs text-slate-500">via {source}</span> : null}
              </div>
              {pkg.category_name ? (
                <p className="mt-0.5 text-xs text-slate-500">{pkg.category_name}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-slate-900">{money(dailyRate, currency)}</p>
              <p className="text-xs text-slate-500">per day</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PackageStat
              label="Program days"
              value={pkg.no_of_days > 0 ? `${pkg.no_of_days} days` : 'Daily rate'}
            />
            <PackageStat
              label="Package total"
              value={Number(pkg.base_total || 0) > 0 ? money(pkg.base_total, currency) : '—'}
            />
            <PackageStat
              label="Days billed"
              value={String(summary.package_days_billed || summary.billed_days)}
            />
            <PackageStat label="Stay days" value={String(summary.stay_days)} />
          </div>

          {pkg.services?.length ? (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Included services
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pkg.services.slice(0, 12).map((service, index) => (
                  <span
                    key={`${service.reference || service.label || 'service'}-${index}`}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                  >
                    {service.label || service.service_type || 'Service'}
                    {service.is_unlimited
                      ? ' · Unlimited'
                      : service.quantity_days
                        ? ` · ${service.quantity_days}`
                        : ''}
                  </span>
                ))}
                {pkg.services.length > 12 ? (
                  <span className="px-2 py-0.5 text-xs text-slate-500">
                    +{pkg.services.length - 12} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-medium text-slate-700">
            No package is assigned to this admission.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Assign a package so stay charges are posted at the agreed rate.
          </p>
        </div>
      )}


      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">Package charge history</h4>
          <span className="text-xs text-slate-500">
            {data.package_details.length} entr{data.package_details.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {data.package_details.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Package</th>
                  <th className="px-3 py-2 text-right font-medium">Days</th>
                  <th className="px-3 py-2 text-right font-medium">Rate / day</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.package_details.map((row) => {
                  const rowDays = Number(row.total_days || 0)
                  const rowAmount = Number(row.transaction_amount || 0)
                  const rowRate = Number(
                    row.amount_per_day ?? (rowDays > 0 ? rowAmount / rowDays : 0)
                  )
                  return (
                    <tr key={row.name} className="text-slate-700">
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDateOnlyDisplay(row.from_date)} — {formatDateOnlyDisplay(row.to_date)}
                      </td>
                      <td className="px-3 py-2">{row.inpatient_package || '—'}</td>
                      <td className="px-3 py-2 text-right">{rowDays}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {money(rowRate, row.currency || currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">
                        {money(rowAmount, row.currency || currency)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            row.vch_status === 'Closed'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {row.vch_status || 'Open'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            No package charges have been posted for this admission yet.
          </p>
        )}
      </div>

      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        Changing the package applies to future stay charges only. Package charges already posted keep
        the package used at the time.
      </p>

      {!data.can_change_package ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
          The package can no longer be changed because the admission is{' '}
          {data.admission.status.toLowerCase()}.
        </p>
      ) : null}

      {showChangeModal ? (
        <PackageSelectionModal
          admissionNo={admissionName}
          currentPackage={pkg ? (pkg.is_custom ? '__custom__' : pkg.name) : null}
          currentRate={pkg?.is_custom ? dailyRate : null}
          onSelect={(next) => void handleSelectPackage(next)}
          onClose={() => setShowChangeModal(false)}
        />
      ) : null}
    </div>
  )
}

