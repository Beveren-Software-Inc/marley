import { useEffect, useMemo, useState } from 'react'
import { AdmissionOtherServicesTab } from './AdmissionOtherServicesTab'
import { calculatePackagePrice, changeAdmissionPackage, type AdmissionPackageDetailsResponse, type InpatientPackage, getPackagePricingModes, type RoomPricingMode } from '../../services/inpatientRecords'
import { PackageSelectionModal } from './PackageSelectionModal'
import { PackagePricingSelector } from './PackagePricingSelector'
import { PackageChangeHistory } from './PackageChangeHistory'
import { toast } from '../../hooks/useToast'

export const ModifyPackageModal = ({ admissionName, onClose }: {
  admissionName: string
  onClose: () => void
}) => {
  const [resolvedPackage, setResolvedPackage] = useState<InpatientPackage | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [hydrated, setHydrated] = useState<string | null>(null)
  const [details, setDetails] = useState<AdmissionPackageDetailsResponse | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pendingPackage, setPendingPackage] = useState<InpatientPackage | null>(null)
  const [pricingMode, setPricingMode] = useState<RoomPricingMode>('Daily')
  const [preview, setPreview] = useState<{ rate: number; periodPrice: number; source?: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [changing, setChanging] = useState(false)
  const [servicesDirty, setServicesDirty] = useState(true)
  const [changeError, setChangeError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const modes = useMemo(() => pendingPackage ? getPackagePricingModes(pendingPackage) : [], [pendingPackage])
  const assignedMode = details?.admission.package_pricing_mode
  const latestChange = details?.package_changes?.[0]
  const assignedPeriodDays = assignedMode === 'Weekly' ? 7 : assignedMode === 'Monthly' ? 30 : 1
  const configuredPeriodPrice = assignedMode === 'Daily' ? details?.admission.rate_per_day
    : resolvedPackage?.duration_pricing?.find((row) => Number(row.from_day) === 1 && Number(row.to_day) === assignedPeriodDays)?.amount
  const assignedPeriodPrice = latestChange && latestChange.new_package === resolvedPackage?.name && latestChange.new_mode === assignedMode
    ? latestChange.new_package_price ?? configuredPeriodPrice
    : configuredPeriodPrice
  const formatPrice = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const canChange = Boolean(details?.can_change_package && ['Admitted', 'Discharge Scheduled'].includes(details.admission.status))

  const selectPackage = (pkg: InpatientPackage) => {
    setShowPicker(false)
    setPendingPackage(pkg)
    const available = getPackagePricingModes(pkg)
    const current = details?.admission.package_pricing_mode
    setPricingMode(current && available.includes(current) ? current : available.includes('Weekly') ? 'Weekly' : 'Daily')
    setPreview(null)
  }

  useEffect(() => {
    if (!pendingPackage) return
    let cancelled = false
    setPreview(null)
    setPreviewLoading(false)
    setChangeError('')
    if (pendingPackage.name === '__custom__') {
      setPreview({ rate: pendingPackage.package_rate, periodPrice: pendingPackage.package_rate })
      return
    }
    setPreviewLoading(true)
    calculatePackagePrice(pendingPackage.name, 1, { pricingMode, admissionName,
      company: details?.admission.company }).then((result) => {
      if (!cancelled && result.daily_rate != null) setPreview({ rate: result.daily_rate, periodPrice: result.period_price ?? result.daily_rate * (pricingMode === 'Weekly' ? 7 : pricingMode === 'Monthly' ? 30 : 1), source: result.package_name })
    }).catch((error) => {
      if (!cancelled) setChangeError(error instanceof Error ? error.message : 'Unable to calculate package price')
    }).finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [pendingPackage, pricingMode, admissionName, details?.admission.company])

  const applyPackageChange = async () => {
    if (!pendingPackage || !preview || servicesDirty || !canChange) return
    setChanging(true)
    setChangeError('')
    try {
      const result = await changeAdmissionPackage(admissionName, pendingPackage.name,
        pendingPackage.name === '__custom__' ? pendingPackage.package_rate : undefined, pricingMode)
      setDetails(result)
      setResolvedPackage(result.active_package)
      setPendingPackage(null)
      setRefreshKey((value) => value + 1)
      toast.success(result.message || 'Package changed successfully')
    } catch (error) {
      setChangeError(error instanceof Error ? error.message : 'Unable to change package')
    } finally { setChanging(false) }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="modify-package-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <h2 id="modify-package-title" className="text-xl font-semibold text-slate-900">Modify Package</h2>
          <button type="button" onClick={onClose} disabled={changing} aria-label="Close" className="text-xl text-slate-500 hover:text-slate-700">×</button>
        </div>
        <div className="overflow-y-auto p-6">
          {resolvedPackage && (
            <section className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Currently assigned package">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Currently assigned package</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{resolvedPackage.package_name || resolvedPackage.name}</p>
              {details && <p className="mt-1 text-sm text-slate-600">{assignedMode || 'Legacy pricing'}{assignedPeriodPrice != null ? ` · ${formatPrice(Number(assignedPeriodPrice))} ${details.default_currency}` : ''}</p>}
              <h3 className="mt-4 text-sm font-semibold text-slate-700">Included services</h3>
              {resolvedPackage.services?.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {resolvedPackage.services.map((service, index) => (
                    <li key={`${service.reference || 'service'}-${index}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                      {service.label || service.reference || service.service_type || 'Service'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No services are included in this package.</p>
              )}
            </section>
          )}
          {canChange && (
            <section className="mb-5 rounded-lg border border-slate-200 p-4" aria-label="Change Package">
              <h3 className="text-base font-semibold text-slate-900">Change Package</h3>
              <p className="mt-1 text-xs text-slate-500">The new rate applies to all remaining unbilled stay days, including earlier days. Posted charges remain unchanged.</p>
              <button type="button" disabled={changing} onClick={() => setShowPicker(true)}
                className="mt-3 rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5">Select Package</button>
              {pendingPackage && <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">{pendingPackage.package_name}</p>
                {modes.length > 0 && <PackagePricingSelector modes={modes} value={pricingMode} onChange={(mode) => { setPricingMode(mode); setPreview(null) }} disabled={changing} />}
                {previewLoading ? <p className="text-sm text-slate-500">Calculating rate...</p> : preview && <p className="text-sm text-slate-700">{pricingMode} · {formatPrice(preview.periodPrice)} {details?.default_currency || 'BHD'}</p>}
                {pricingMode === 'Daily' && preview?.source && <p className="mt-1 text-xs text-slate-500">Daily rate source: {preview.source} · Room Type: {details?.admission.admission_service_unit_type || '—'}</p>}
                {servicesDirty && <p className="mt-2 text-xs text-amber-700">Save any Additional Services, Lab Tests or Observation edits with Update Quotation before changing the package.</p>}
                <button type="button" disabled={changing || previewLoading || !preview || servicesDirty} onClick={applyPackageChange}
                  className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">{changing ? 'Applying...' : 'Apply Package Change'}</button>
              </div>}
              {changeError && <p role="alert" className="mt-2 text-sm text-red-600">{changeError}</p>}
            </section>
          )}
          <AdmissionOtherServicesTab
            admissionName={admissionName}
            selectedPackage={null}
            onResolvedPackageChange={setResolvedPackage}
            onPackageDetailsChange={setDetails}
            onDirtyChange={setServicesDirty}
            selectedServices={services}
            onSelectedServicesChange={setServices}
            refreshKey={refreshKey}
            otherServicesHydrated={hydrated}
            setOtherServicesHydrated={setHydrated}
            requireExistingQuotation
          />
          <PackageChangeHistory changes={details?.package_changes || []} currency={details?.default_currency} />
        </div>
        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button type="button" disabled={changing} onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
        </div>
      </div>
      {showPicker && <PackageSelectionModal admissionNo={admissionName} currentPackage={resolvedPackage?.name}
        currentRate={resolvedPackage?.name === '__custom__' ? details?.admission.rate_per_day : undefined}
        onSelect={selectPackage} onClose={() => setShowPicker(false)} />}
    </div>
  )
}
