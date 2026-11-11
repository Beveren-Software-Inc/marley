import { useState } from 'react'
import { AdmissionOtherServicesTab } from './AdmissionOtherServicesTab'
import type { InpatientPackage } from '../../services/inpatientRecords'

export const ModifyPackageModal = ({ admissionName, onClose }: {
  admissionName: string
  onClose: () => void
}) => {
  const [resolvedPackage, setResolvedPackage] = useState<InpatientPackage | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [hydrated, setHydrated] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="modify-package-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <h2 id="modify-package-title" className="text-xl font-semibold text-slate-900">Modify Package</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl text-slate-500 hover:text-slate-700">×</button>
        </div>
        <div className="overflow-y-auto p-6">
          {resolvedPackage && (
            <section className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Currently assigned package">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Currently assigned package</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{resolvedPackage.package_name || resolvedPackage.name}</p>
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
          <AdmissionOtherServicesTab
            admissionName={admissionName}
            selectedPackage={null}
            onResolvedPackageChange={setResolvedPackage}
            selectedServices={services}
            onSelectedServicesChange={setServices}
            refreshKey={0}
            otherServicesHydrated={hydrated}
            setOtherServicesHydrated={setHydrated}
            requireExistingQuotation
          />
        </div>
        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  )
}
