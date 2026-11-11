
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkAdmissionQuotation,
  updateAdmissionQuotationOtherServices,
  fetchAdmissionPackageDetails,
  type AdmissionPackageDetailsResponse,
  type InpatientPackage,
} from '../../services/inpatientRecords'
import {
  type LinkFieldOption,
} from '../../services/common'
import { apiRequest } from '../../services/apiClient'

interface AdmissionOtherServicesTabProps {
  admissionName: string
  selectedPackage: InpatientPackage | null
  onResolvedPackageChange?: (pkg: InpatientPackage | null) => void
  loadInitialQuotation?: () => ReturnType<typeof checkAdmissionQuotation>
  selectedServices: string[]
  onSelectedServicesChange: (services: string[]) => void
  refreshKey: number
  requireExistingQuotation?: boolean
  otherServicesHydrated: string | null
  setOtherServicesHydrated: (hydrated: string | null) => void
}

export const AdmissionOtherServicesTab = ({
  admissionName,
  selectedPackage,
  onResolvedPackageChange,
  loadInitialQuotation,
  selectedServices,
  onSelectedServicesChange,
  refreshKey,
  requireExistingQuotation = false,
  otherServicesHydrated,
  setOtherServicesHydrated,
}: AdmissionOtherServicesTabProps) => {
  const [packageData, setPackageData] =
    useState<AdmissionPackageDetailsResponse | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [quotationSettings, setQuotationSettings] = useState({ include_lab_tests: 0, include_observation: 0 })
  const [savedSettings, setSavedSettings] = useState({ include_lab_tests: 0, include_observation: 0 })
  const settingsIdentityRef = useRef<string | null>(null)

  const [quotationName, setQuotationName] = useState<string | null>(null)
  const [savedServices, setSavedServices] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [pendingServices, setPendingServices] = useState<string[]>([])
  const [searchError, setSearchError] = useState('')
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [serviceLabels, setServiceLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    if (!selectedServices.length) return
    const params = new URLSearchParams({
      doctype: 'Healthcare Service Template',
      fields: JSON.stringify(['name', 'service_name']),
      filters: JSON.stringify([['name', 'in', selectedServices]]),
      limit_page_length: String(selectedServices.length),
    })
    apiRequest<Array<{ name: string; service_name?: string }>>(
      `/api/method/frappe.client.get_list?${params.toString()}`,
    ).then((templates) => {
      if (!cancelled) setServiceLabels((current) => ({
        ...current,
        ...Object.fromEntries(templates.map((template) => [template.name, template.service_name || template.name])),
      }))
    }).catch(() => { /* Keep IDs visible if labels are unavailable. */ })
    return () => { cancelled = true }
  }, [selectedServices])


  const activePackage = selectedPackage || packageData?.active_package || null
  const loadGeneration = useRef(0)
  const otherServicesHydratedRef = useRef(otherServicesHydrated)
  useEffect(() => {
    otherServicesHydratedRef.current = otherServicesHydrated
  }, [otherServicesHydrated])
  useEffect(() => () => { loadGeneration.current += 1 }, [])
  const selectionIdentity = activePackage
    ? JSON.stringify([admissionName, activePackage.name, quotationName])
    : null
  const selectionReady = !loading && !error && selectionIdentity === otherServicesHydrated
    && (!requireExistingQuotation || Boolean(quotationName))


  const includedTemplates = useMemo(
    () =>
      new Set(
        (activePackage?.services || [])
          .filter(
            (service) =>
              service.reference_doctype === 'Healthcare Service Template',
          )
          .map((service) => service.reference)
          .filter((name): name is string => Boolean(name)),
      ),
    [activePackage?.services],
  )

  const load = useCallback(async (useInitialQuotation = false) => {
    const generation = ++loadGeneration.current
    try {
      setLoading(true)
      setError(null)

      const details = await fetchAdmissionPackageDetails(admissionName)
      if (generation !== loadGeneration.current) return
      setPackageData(details)

      const packageName =
        selectedPackage?.name || details.active_package?.name

      if (!packageName) {
        onResolvedPackageChange?.(details.active_package)
        setSubmitted(false)
        setQuotationName(null)
        setSavedServices([])
        return
      }

      const quotation = await (useInitialQuotation && loadInitialQuotation
        ? loadInitialQuotation()
        : checkAdmissionQuotation(admissionName, packageName))

      if (generation !== loadGeneration.current) return
      onResolvedPackageChange?.(details.active_package)
      setSubmitted(quotation.docstatus === 1)
      setQuotationName(quotation.exists ? quotation.quotation_name || null : null)
      setSavedServices(Array.from(new Set(quotation.other_services || [])))

      const identity = JSON.stringify([admissionName, packageName, quotation.quotation_name || null])
      const settings = {
        include_lab_tests: Number(quotation.include_lab_tests) === 1 ? 1 : 0,
        include_observation: Number(quotation.include_observation) === 1 ? 1 : 0,
      }
      setSavedSettings(settings)
      if (settingsIdentityRef.current !== identity || quotation.docstatus === 1) {
        setQuotationSettings(settings)
        settingsIdentityRef.current = identity
      }

      if (quotation.docstatus === 1 || otherServicesHydratedRef.current !== identity) {
        onSelectedServicesChange(Array.from(new Set(quotation.other_services || [])))
        setOtherServicesHydrated(identity)
      }

    } catch (err) {
      if (generation !== loadGeneration.current) return
      setQuotationName(null)
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to load other services'),
      )
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }, [
    admissionName,
    onResolvedPackageChange,
    loadInitialQuotation,
    onSelectedServicesChange,
    refreshKey,
    setOtherServicesHydrated,
    selectedPackage?.name,
  ])

  useEffect(() => {
    void load(true)
  }, [load])

  useEffect(() => {
    if (!activePackage || submitted || !pickerOpen) return

    let cancelled = false

    const timer = window.setTimeout(() => {
      setLoadingOptions(true)
      setSearchError('')

      fetch('/api/method/healthcare.api.common.get_service_request_templates?' + new URLSearchParams({
        template_dt: 'Healthcare Service Template', search: query.trim(),
      }), { credentials: 'include' })
        .then(async (response) => {
          const data = await response.json()
          if (!response.ok || data.exc || !Array.isArray(data.message)) throw new Error('Search failed')
          return data.message as LinkFieldOption[]
        })
        .then((templates) => {
          if (!cancelled) {
            setOptions(
              templates.filter(
                (template) =>
                  !includedTemplates.has(template.name) &&
                  !selectedServices.includes(template.name),
              ),
            )
          }
        })
        .catch(() => {
          if (!cancelled) { setOptions([]); setSearchError('Unable to search services. Please retry.') }
        })
        .finally(() => {
          if (!cancelled) setLoadingOptions(false)
        })
    }, query.trim() ? 250 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    activePackage,
    includedTemplates,
    pickerOpen,
    query,
    selectedServices,
    submitted,
  ])

  useEffect(() => {
    if (!pickerOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPickerOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => window.removeEventListener('keydown', handleEscape)
  }, [pickerOpen])

  const openPicker = () => {
    setQuery('')
    setPendingServices([])
    setPickerOpen(true)
  }

  const closePicker = () => {
    setPickerOpen(false)
    setQuery('')
    setPendingServices([])
  }

  const addService = () => {
    onSelectedServicesChange(Array.from(new Set([
      ...selectedServices,
      ...pendingServices.filter((name) => !includedTemplates.has(name)),
    ])))
    setPendingServices([])
    setQuery('')
  }

  const settingsChanged = requireExistingQuotation && (
    quotationSettings.include_lab_tests !== savedSettings.include_lab_tests
    || quotationSettings.include_observation !== savedSettings.include_observation
  )
  const servicesChanged = settingsChanged || selectedServices.length !== savedServices.length
    || selectedServices.some((name) => !savedServices.includes(name))

  const updateQuotation = async () => {
    if (!selectionReady || !activePackage || !quotationName || submitted || !servicesChanged) return
    try {
      setUpdating(true)
      setError(null)
      setUpdateMessage('')
      const result = await updateAdmissionQuotationOtherServices(
        admissionName, activePackage.name, selectedServices,
        requireExistingQuotation ? quotationSettings : undefined,
      )
      if (requireExistingQuotation) setSavedSettings(quotationSettings)
      setSavedServices(result.other_services)
      onSelectedServicesChange(result.other_services)
      setUpdateMessage(result.message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update quotation'))
    } finally {
      setUpdating(false)
    }
  }

  const removeService = (name: string) => {
    if (requireExistingQuotation && (!selectionReady || submitted)) return
    onSelectedServicesChange(
      selectedServices.filter((service) => service !== name),
    )
  }

  const packageServices = activePackage?.services || []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Other Services
          </h3>
          <p className="text-xs text-slate-500">
            Additional services will be saved with the package quotation
            {requireExistingQuotation ? 'when Update Quotation is clicked.' : 'when Create Quotation is clicked.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error.message}
        </p>
      )}

      {requireExistingQuotation && (
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" disabled={!selectionReady || submitted || updating}
              checked={quotationSettings.include_lab_tests === 1}
              onChange={(event) => setQuotationSettings((current) => ({ ...current, include_lab_tests: event.target.checked ? 1 : 0 }))}
              className="h-4 w-4 rounded border-slate-300" />
            Include Lab Tests
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" disabled={!selectionReady || submitted || updating}
              checked={quotationSettings.include_observation === 1}
              onChange={(event) => setQuotationSettings((current) => ({ ...current, include_observation: event.target.checked ? 1 : 0 }))}
              className="h-4 w-4 rounded border-slate-300" />
            Include Observation
          </label>
        </div>
      )}
      {requireExistingQuotation && !loading && !error && !quotationName && (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No existing quotation is available for this admission and package. Additional services cannot be modified.</p>
      )}
      {!activePackage ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          Select a package first, then add its additional services here.
        </p>
      ) : (
        <>
          <section>
            <h4 className="text-sm font-semibold text-slate-900">
              Package services · {activePackage.package_name}
            </h4>

            {packageServices.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {packageServices.map((service, index) => (
                  <span
                    key={`${service.reference || service.label || 'service'}-${index}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {service.label ||
                      service.reference ||
                      service.service_type ||
                      'Service'}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No services are included in this package.
              </p>
            )}
          </section>

          {!submitted && selectionReady && (
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
            >
              <span className="text-lg leading-none">+</span>
              Add Service
            </button>
          )}

          {submitted && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              The linked quotation is submitted. Additional services are
              display-only.
            </p>
          )}

          <section>
            {quotationName && selectionReady && !submitted && servicesChanged && (
              <button type="button" onClick={() => void updateQuotation()} disabled={updating || loading}
                className="mb-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                {updating ? 'Updating Quotation...' : 'Update Quotation'}
              </button>
            )}
            {updateMessage && <p role="status" className="mb-3 text-sm text-emerald-700">{updateMessage}</p>}
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Additional services
              </h4>

              <span className="text-xs text-slate-500">
                {selectedServices.length}{' '}
                {selectedServices.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {selectedServices.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedServices.map((service) => (
                  <span
                    key={service}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-800"
                  >
                    {serviceLabels[service] || service}

                    {!submitted && (
                      <button
                        type="button"
                        onClick={() => removeService(service)}
                        className="rounded-full px-1 hover:bg-blue-100"
                        aria-label={`Remove ${serviceLabels[service] || service}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                No additional services selected.
              </p>
            )}
          </section>
        </>
      )}

      {/* Add Service Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePicker()
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-service-title"
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3
                  id="add-service-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Add Additional Service
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Search and select a Healthcare Service Template.
                </p>
              </div>

              <button
                type="button"
                onClick={closePicker}
                className="rounded-md p-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label
                  htmlFor="other-service-search"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Search services
                </label>

                <input
                  id="other-service-search"
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                  }}
                  placeholder="Search Healthcare Service Templates..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label
                  htmlFor="other-service-select"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Select a template
                </label>

                <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
                  {options.map((template) => (
                    <label key={template.name} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0 hover:bg-slate-50">
                      <input type="checkbox" checked={pendingServices.includes(template.name)}
                        onChange={(event) => setPendingServices((current) => event.target.checked
                          ? Array.from(new Set([...current, template.name]))
                          : current.filter((name) => name !== template.name))}
                        className="h-4 w-4 rounded border-slate-300 text-primary" />
                      <span><span className="font-medium">{template.name}</span>
                        {template.label && template.label !== template.name && <span className="block text-xs text-slate-500">{template.label}</span>}
                      </span>
                    </label>
                  ))}
                  {loadingOptions && <p role="status" className="p-4 text-sm text-slate-500">Searching services...</p>}
                </div>
                {searchError && <p role="alert" className="mt-2 text-sm text-red-600">{searchError}</p>}

                {!loadingOptions && !options.length && (
                  <p className="mt-2 text-xs text-slate-500">
                    No additional services found.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-500">
                  {selectedServices.length} service(s) selected
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closePicker}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Done
                  </button>

                  <button
                    type="button"
                    onClick={addService}
                    disabled={!pendingServices.length || loadingOptions}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
