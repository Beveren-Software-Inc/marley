import { useEffect, useState } from 'react'
import {
  fetchPackageDetailDashboard,
  type PackageDetailDashboard,
  type AvailablePackage,
  type PackageDetailRecord,
} from '../../services/packageDetails'

interface PackageDetailViewProps {
  patient?: string
}

export const PackageDetailView = ({ patient }: PackageDetailViewProps) => {
  const [data, setData] = useState<PackageDetailDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const dashboard = await fetchPackageDetailDashboard(patient)
        setData(dashboard)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load package details')
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [patient])

  if (loading) {
    return (
      <div className="text-sm text-slate-600 py-6 text-center">
        Loading package details…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { available_packages, packages_available_count, default_currency, active_admission, assigned_package, package_detail_records } = data

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Packages available</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{packages_available_count}</div>
          <div className="text-xs text-slate-600 mt-0.5">Inpatient Package (active)</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Active admission</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {active_admission ? active_admission.name : '—'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {active_admission ? `${active_admission.status} • ${active_admission.patient_name || active_admission.patient}` : 'Select a patient to see'}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Assigned package</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {assigned_package ? assigned_package.package_name : '—'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {assigned_package ? `Quotation: ${assigned_package.quotation_name}` : 'From admission quotation'}
          </div>
        </div>
      </div>

      {/* Current active admission (when patient selected) */}
      {patient && active_admission && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900">Current active inpatient admission</h3>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Admission</span>
              <p className="font-medium text-slate-900">{active_admission.name}</p>
            </div>
            <div>
              <span className="text-slate-500">Status</span>
              <p className="font-medium text-slate-900">{active_admission.status}</p>
            </div>
            {active_admission.scheduled_date && (
              <div>
                <span className="text-slate-500">Scheduled</span>
                <p className="font-medium text-slate-900">{active_admission.scheduled_date}</p>
              </div>
            )}
            {active_admission.admitted_datetime && (
              <div>
                <span className="text-slate-500">Admitted</span>
                <p className="font-medium text-slate-900">{active_admission.admitted_datetime}</p>
              </div>
            )}
            {active_admission.expected_discharge && (
              <div>
                <span className="text-slate-500">Expected discharge</span>
                <p className="font-medium text-slate-900">{active_admission.expected_discharge}</p>
              </div>
            )}
          </div>
          {assigned_package && (
            <div className="px-4 pb-4">
              <a
                href={`/app/quotation/${encodeURIComponent(assigned_package.quotation_name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                Open quotation →
              </a>
            </div>
          )}
        </section>
      )}

      {/* Assigned treatment package (from Quotation) */}
      {assigned_package && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900">Assigned treatment package</h3>
            <p className="text-xs text-slate-500 mt-0.5">Inpatient Package linked via quotation</p>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Package</span>
              <p className="font-medium text-slate-900">{assigned_package.package_name}</p>
            </div>
            <div>
              <span className="text-slate-500">Quotation</span>
              <p className="font-medium text-slate-900">{assigned_package.quotation_name}</p>
            </div>
            {assigned_package.no_of_days != null && (
              <div>
                <span className="text-slate-500">Days</span>
                <p className="font-medium text-slate-900">{assigned_package.no_of_days}</p>
              </div>
            )}
            {assigned_package.package_rate != null && (
              <div>
                <span className="text-slate-500">Rate</span>
                <p className="font-medium text-slate-900">
                  {assigned_package.package_rate} {default_currency}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Package Detail records (standalone doctype) for this admission */}
      {patient && active_admission && package_detail_records.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900">Package Detail records</h3>
            <p className="text-xs text-slate-500 mt-0.5">Assigned package detail for this admission</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">From</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">To</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Days</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {package_detail_records.map((row: PackageDetailRecord) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800">{row.from_date || '—'}</td>
                    <td className="px-3 py-2 text-slate-800">{row.to_date || '—'}</td>
                    <td className="px-3 py-2 text-slate-800">{row.total_days ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {row.transaction_amount != null ? `${row.transaction_amount} ${row.currency || default_currency}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded border px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-800 border-slate-200">
                        {row.vch_status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Available Inpatient Packages (master list) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">Available Inpatient Packages</h3>
          <p className="text-xs text-slate-500 mt-0.5">Treatment packages (Inpatient Package) — assigned via quotation on admission</p>
        </div>
        {available_packages.length === 0 ? (
          <div className="p-4 text-sm text-slate-500 text-center">No active packages found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Package</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Category</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Days</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {available_packages.map((pkg: AvailablePackage) => (
                  <tr key={pkg.name} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{pkg.package_name}</td>
                    <td className="px-3 py-2 text-slate-700">{pkg.category_name || pkg.package_category || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{pkg.no_of_days ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-800">
                      {pkg.package_rate != null ? `${pkg.package_rate} ${default_currency}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
