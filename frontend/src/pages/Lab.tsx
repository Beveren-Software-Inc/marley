import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PatientSearch } from '../components/patients/PatientSearch'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
import { LabTestList } from '../components/labTests/LabTestList'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
import { CreateLabTestTemplateModal } from '../components/labTests/CreateLabTestTemplateModal'
import { LabTestTemplateList } from '../components/labTests/LabTestTemplateList'
import { CreateLabTestSampleModal } from '../components/labTests/CreateLabTestSampleModal'
import { CreateSampleTypeModal } from '../components/labTests/CreateSampleTypeModal'
import { fetchLabTestSamples, fetchSampleTypes, type LabTestSampleOption, type LinkFieldOption } from '../services/common'

export const LabPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const screen = searchParams.get('screen')
  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(patientFromUrl || undefined)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
  const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)

  // Setup screen state
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [editTemplateName, setEditTemplateName] = useState<string | undefined>(undefined)

  const [showCreateSampleModal, setShowCreateSampleModal] = useState(false)
  const [sampleRefreshKey, setSampleRefreshKey] = useState(0)
  const [labSamples, setLabSamples] = useState<LabTestSampleOption[]>([])
  const [samplesLoading, setSamplesLoading] = useState(false)

  const [showCreateSampleTypeModal, setShowCreateSampleTypeModal] = useState(false)
  const [sampleTypeRefreshKey, setSampleTypeRefreshKey] = useState(0)
  const [sampleTypes, setSampleTypes] = useState<LinkFieldOption[]>([])
  const [sampleTypesLoading, setSampleTypesLoading] = useState(false)

  const loadLabSamples = useCallback(async () => {
    setSamplesLoading(true)
    try {
      const data = await fetchLabTestSamples()
      setLabSamples(data)
    } catch { setLabSamples([]) }
    finally { setSamplesLoading(false) }
  }, [sampleRefreshKey])

  const loadSampleTypes = useCallback(async () => {
    setSampleTypesLoading(true)
    try {
      const data = await fetchSampleTypes()
      setSampleTypes(data)
    } catch { setSampleTypes([]) }
    finally { setSampleTypesLoading(false) }
  }, [sampleTypeRefreshKey])

  useEffect(() => {
    if (screen === 'l-setup') {
      loadLabSamples()
      loadSampleTypes()
    }
  }, [screen, loadLabSamples, loadSampleTypes])

  // Sync selectedPatient with URL on mount and when URL changes
  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleLabTestCreated = () => {
    setLabTestRefreshKey(prev => prev + 1)
    setServiceRequestRefreshKey(prev => prev + 1) // Also refresh service requests
  }

  const handleServiceRequestCreated = () => {
    setServiceRequestRefreshKey(prev => prev + 1)
  }

  // ─── l-setup ───────────────────────────────────────────
  if (screen === 'l-setup') {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="p-4 space-y-4">

          {/* Lab Test Templates */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="font-semibold mb-4 flex items-center justify-between">
              <span>Lab Test Templates</span>
              <button
                onClick={() => { setEditTemplateName(undefined); setShowCreateTemplateModal(true) }}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                title="Create Lab Test Template"
              >
                +
              </button>
            </div>
            <div className="overflow-y-auto max-h-72" style={{ scrollbarWidth: 'thin' }}>
              <LabTestTemplateList
                refreshKey={templateRefreshKey}
                selectedPatient={selectedPatient}
                onEditClick={name => { setEditTemplateName(name); setShowCreateTemplateModal(true) }}
              />
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Lab Test Samples */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-3 flex items-center justify-between">
                <span>Lab Test Samples</span>
                <button
                  onClick={() => setShowCreateSampleModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Create Lab Test Sample"
                >
                  +
                </button>
              </div>
              <div className="overflow-y-auto max-h-56" style={{ scrollbarWidth: 'thin' }}>
                {samplesLoading ? (
                  <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
                ) : labSamples.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-4">No lab test samples yet</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Sample</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labSamples.map(s => (
                        <tr key={s.name} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{s.sample || s.name}</td>
                          <td className="px-3 py-2 text-slate-500">{s.sample_type || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{s.sample_uom || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Sample Types */}
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="font-semibold mb-3 flex items-center justify-between">
                <span>Sample Types</span>
                <button
                  onClick={() => setShowCreateSampleTypeModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
                  title="Create Sample Type"
                >
                  +
                </button>
              </div>
              <div className="overflow-y-auto max-h-56" style={{ scrollbarWidth: 'thin' }}>
                {sampleTypesLoading ? (
                  <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
                ) : sampleTypes.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-4">No sample types yet</div>
                ) : (
                  <div className="flex flex-wrap gap-2 p-1">
                    {sampleTypes.map(t => (
                      <span key={t.name}
                        className="inline-block px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                        {t.label || t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {showCreateTemplateModal && (
          <CreateLabTestTemplateModal
            onClose={() => { setShowCreateTemplateModal(false); setEditTemplateName(undefined) }}
            onSuccess={() => {
              setShowCreateTemplateModal(false)
              setEditTemplateName(undefined)
              setTemplateRefreshKey(k => k + 1)
            }}
            templateName={editTemplateName}
          />
        )}
        {showCreateSampleModal && (
          <CreateLabTestSampleModal
            onClose={() => setShowCreateSampleModal(false)}
            onSuccess={() => { setShowCreateSampleModal(false); setSampleRefreshKey(k => k + 1) }}
          />
        )}
        {showCreateSampleTypeModal && (
          <CreateSampleTypeModal
            onClose={() => setShowCreateSampleTypeModal(false)}
            onSuccess={() => { setShowCreateSampleTypeModal(false); setSampleTypeRefreshKey(k => k + 1) }}
          />
        )}
      </div>
    )
  }

  // Render based on screen
  if (screen === 'l-req') {
    // Lab Test Requests - show service requests with Lab Test Template
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Lab Test Requests</span>
              <button
                onClick={() => setShowServiceRequestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Service Request"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <ServiceRequestList 
                patient={selectedPatient} 
                onLabTestCreated={handleLabTestCreated}
                refreshKey={serviceRequestRefreshKey}
                template_dt="Lab Test Template"
              />
            </div>
          </section>
        </div>
        {showServiceRequestModal && (
          <CreateServiceRequestModal
            onClose={() => setShowServiceRequestModal(false)}
            onSuccess={() => {
              setShowServiceRequestModal(false)
              handleServiceRequestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  if (screen === 'l-out') {
    // Outsourced Tests - show only lab tests where is_outsourced = 1
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Outsourced Tests</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <LabTestList patient={selectedPatient} isOutsourced={true} key={labTestRefreshKey} />
            </div>
          </section>
        </div>
        {showLabTestModal && (
          <CreateLabTestModal
            onClose={() => setShowLabTestModal(false)}
            onSuccess={() => {
              setShowLabTestModal(false)
              handleLabTestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  if (screen === 'l-results') {
    // Lab Test & Result - show all lab tests
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
          <div className="flex-1 min-w-0">
            <PatientSearch
              selectedPatient={selectedPatient || ''}
              onPatientSelect={handlePatientSelect}
              patients={[]}
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <UserMenu />
            <NotificationBell />
          </div>
        </header>

        <div className="p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Lab Test & Result</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
              <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
            </div>
          </section>
        </div>
        {showLabTestModal && (
          <CreateLabTestModal
            onClose={() => setShowLabTestModal(false)}
            onSuccess={() => {
              setShowLabTestModal(false)
              handleLabTestCreated()
            }}
            initialPatient={selectedPatient}
          />
        )}
      </div>
    )
  }

  // Default view - when no special screen is selected
  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
        <div className="flex-1 min-w-0">
          <PatientSearch
            selectedPatient={selectedPatient || ''}
            onPatientSelect={handlePatientSelect}
            patients={[]}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      {selectedPatient ? (
        <>
          {/* Patient context: medical background and warnings */}
          <div className="grid gap-4 md:grid-cols-2 p-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Patient Medical History</span>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <MedicalHistoryView patient={selectedPatient} />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Warnings & Allergies</span>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <WarningMessagesList patient={selectedPatient} />
              </div>
            </section>
          </div>

          {/* Requests and tests for this patient */}
          <div className="grid gap-4 md:grid-cols-2 px-4 pb-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Service Requests</span>
                <button
                  onClick={() => setShowServiceRequestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Service Request"
                >
                  +
                </button>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <ServiceRequestList
                  patient={selectedPatient}
                  onLabTestCreated={handleLabTestCreated}
                  refreshKey={serviceRequestRefreshKey}
                  template_dt="Lab Test Template"
                />
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
              <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
                <span>Lab Tests</span>
                <button
                  onClick={() => setShowLabTestModal(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                  title="Add Lab Test"
                >
                  +
                </button>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 p-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Service Requests</span>
              <button
                onClick={() => setShowServiceRequestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Service Request"
              >
                +
              </button>
            </div>
            <div
              className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'thin' }}
            >
              <ServiceRequestList
                patient={selectedPatient}
                onLabTestCreated={handleLabTestCreated}
                refreshKey={serviceRequestRefreshKey}
                template_dt="Lab Test Template"
              />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col max-h-[400px]">
            <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
              <span>Lab Tests</span>
              <button
                onClick={() => setShowLabTestModal(true)}
                className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
                title="Add Lab Test"
              >
                +
              </button>
            </div>
            <div
              className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'thin' }}
            >
              <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
            </div>
          </section>
        </div>
      )}

      {showLabTestModal && (
        <CreateLabTestModal
          onClose={() => setShowLabTestModal(false)}
          onSuccess={() => {
            setShowLabTestModal(false)
            handleLabTestCreated()
          }}
          initialPatient={selectedPatient}
        />
      )}

      {showServiceRequestModal && (
        <CreateServiceRequestModal
          onClose={() => setShowServiceRequestModal(false)}
          onSuccess={() => {
            setShowServiceRequestModal(false)
            handleServiceRequestCreated()
          }}
          initialPatient={selectedPatient}
        />
      )}
    </div>
  )
}



