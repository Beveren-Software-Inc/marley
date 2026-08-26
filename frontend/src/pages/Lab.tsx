// import { useState, useEffect, useCallback } from 'react'
// import { useSearchParams } from 'react-router-dom'
// import { useCareContext } from '../providers/CareContextProvider'
// import { ClipboardList, FlaskConical, BookOpen, AlertTriangle, Droplet, FileCode } from 'lucide-react'
// import { PatientSearch } from '../components/patients/PatientSearch'
// import { NotificationBell } from '../components/notifications/NotificationBell'
// import { UserMenu } from '../components/user/UserMenu'
// import { ServiceRequestList } from '../components/serviceRequests/ServiceRequestList'
// import { LabTestList } from '../components/labTests/LabTestList'
// import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
// import { CreateServiceRequestModal } from '../components/serviceRequests/CreateServiceRequestModal'
// import { MedicalHistoryView } from '../components/medicalHistory/MedicalHistoryView'
// import { WarningMessagesList } from '../components/warnings/WarningMessagesList'
// import { CreateLabTestTemplateModal } from '../components/labTests/CreateLabTestTemplateModal'
// import { LabTestTemplateList } from '../components/labTests/LabTestTemplateList'
// import { CreateLabTestSampleModal } from '../components/labTests/CreateLabTestSampleModal'
// import { CreateSampleTypeModal } from '../components/labTests/CreateSampleTypeModal'
// import { SampleCollectionList } from '../components/labTests/SampleCollectionList'
// import { fetchLabTestSamples, fetchSampleTypes, type LabTestSampleOption, type LinkFieldOption } from '../services/common'

// type LabTab = 'service-requests' | 'lab-tests' | 'medical-history' | 'warnings' | 'sample-collection' | 'lab-templates'

// const NAV_CARDS = [
//   {
//     id: 'service-requests' as LabTab,
//     title: 'Service Requests',
//     desc: 'Lab test requests from doctors and departments',
//     icon: ClipboardList,
//     color: 'bg-primary/10 text-primary border-primary/20',
//     iconColor: 'text-primary',
//   },
//   {
//     id: 'lab-tests' as LabTab,
//     title: 'Lab Tests & Results',
//     desc: 'Process tests, enter results and track status',
//     icon: FlaskConical,
//     color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
//     iconColor: 'text-emerald-600',
//   },
//   {
//     id: 'sample-collection' as LabTab,
//     title: 'Sample Collection',
//     desc: 'Track sample collection details and linked tests',
//     icon: Droplet,
//     color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
//     iconColor: 'text-cyan-600',
//   },
//   {
//     id: 'lab-templates' as LabTab,
//     title: 'Lab Test Templates',
//     desc: 'Manage test templates, parameters and reference ranges',
//     icon: FileCode,
//     color: 'bg-purple-50 text-purple-700 border-purple-200',
//     iconColor: 'text-purple-600',
//   },
//   {
//     id: 'medical-history' as LabTab,
//     title: 'Medical History',
//     desc: 'Patient background, diagnoses and clinical notes',
//     icon: BookOpen,
//     color: 'bg-blue-50 text-blue-700 border-blue-200',
//     iconColor: 'text-blue-600',
//   },
//   {
//     id: 'warnings' as LabTab,
//     title: 'Allergies & Warnings',
//     desc: 'Critical alerts, allergies and contraindications',
//     icon: AlertTriangle,
//     color: 'bg-amber-50 text-amber-700 border-amber-200',
//     iconColor: 'text-amber-600',
//   },
// ]

// export const LabPage = () => {
//   const {
//     selectedPatient: globalPatient,
//     setSelectedPatient: setGlobalPatient,
//     userRole,
//   } = useCareContext()
//   const [searchParams, setSearchParams] = useSearchParams()
//   const patientFromUrl = searchParams.get('patient')
//   const screen = searchParams.get('screen')
//   const roles = userRole || []
//   /** Lab home "Service Requests" tab: admins only (not Doctor / lab staff). */
//   const canSeeServiceRequestsTab = roles.some((role) =>
//     ['System Manager', 'Healthcare Administrator', 'Administrator'].includes(role)
//   )
//   const canCreateLabServiceRequests = roles.some((role) =>
//     ['Doctor', 'System Manager', 'Healthcare Administrator', 'Administrator'].includes(role)
//   )

//   const rawTab = (searchParams.get('tab') ||
//     (canSeeServiceRequestsTab ? 'service-requests' : 'lab-tests')) as LabTab
//   const tabFromUrl =
//     !canSeeServiceRequestsTab && rawTab === 'service-requests' ? 'lab-tests' : rawTab

//   const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
//   const [activeTab, setActiveTab] = useState<LabTab>(tabFromUrl)
//   const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
//   const [showLabTestModal, setShowLabTestModal] = useState(false)
//   const [showServiceRequestModal, setShowServiceRequestModal] = useState(false)
//   const [serviceRequestRefreshKey, setServiceRequestRefreshKey] = useState(0)
//   const [sampleCollectionRefreshKey, setSampleCollectionRefreshKey] = useState(0)

//   // Template management state
//   const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
//   const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
//   const [editTemplateName, setEditTemplateName] = useState<string | undefined>(undefined)

//   // Setup screen state (existing)
//   const [showCreateSampleModal, setShowCreateSampleModal] = useState(false)
//   const [sampleRefreshKey, setSampleRefreshKey] = useState(0)
//   const [labSamples, setLabSamples] = useState<LabTestSampleOption[]>([])
//   const [samplesLoading, setSamplesLoading] = useState(false)

//   const [showCreateSampleTypeModal, setShowCreateSampleTypeModal] = useState(false)
//   const [sampleTypeRefreshKey, setSampleTypeRefreshKey] = useState(0)
//   const [sampleTypes, setSampleTypes] = useState<LinkFieldOption[]>([])
//   const [sampleTypesLoading, setSampleTypesLoading] = useState(false)

//   const loadLabSamples = useCallback(async () => {
//     setSamplesLoading(true)
//     try {
//       const data = await fetchLabTestSamples()
//       setLabSamples(data)
//     } catch { setLabSamples([]) }
//     finally { setSamplesLoading(false) }
//   }, [sampleRefreshKey])

//   const loadSampleTypes = useCallback(async () => {
//     setSampleTypesLoading(true)
//     try {
//       const data = await fetchSampleTypes()
//       setSampleTypes(data)
//     } catch { setSampleTypes([]) }
//     finally { setSampleTypesLoading(false) }
//   }, [sampleTypeRefreshKey])

//   useEffect(() => {
//     if (screen === 'l-setup') {
//       loadLabSamples()
//       loadSampleTypes()
//     }
//   }, [screen, loadLabSamples, loadSampleTypes])

//   // Sync selectedPatient and activeTab with URL
//   useEffect(() => {
//     const patientParam = searchParams.get('patient')
//     if (patientParam && patientParam !== selectedPatient) {
//       setSelectedPatient(patientParam)
//     }
//   }, [searchParams])

//   const handlePatientSelect = (patient: string | undefined) => {
//     setSelectedPatient(patient)
//     setGlobalPatient(patient)
//     const newSearchParams = new URLSearchParams(searchParams)
//     if (patient) {
//       newSearchParams.set('patient', patient)
//     } else {
//       newSearchParams.delete('patient')
//     }
//     setSearchParams(newSearchParams, { replace: true })
//   }

//   const handleTabChange = (newTab: LabTab) => {
//     if (newTab === 'service-requests' && !canSeeServiceRequestsTab) return
//     setActiveTab(newTab)
//     const newSearchParams = new URLSearchParams(searchParams)
//     newSearchParams.set('tab', newTab)
//     setSearchParams(newSearchParams, { replace: true })
//   }

//   useEffect(() => {
//     if (!canSeeServiceRequestsTab && activeTab === 'service-requests') {
//       handleTabChange('lab-tests')
//     }
//   }, [canSeeServiceRequestsTab, activeTab])

//   const handleLabTestCreated = () => {
//     setLabTestRefreshKey(prev => prev + 1)
//     setServiceRequestRefreshKey(prev => prev + 1)
//     setSampleCollectionRefreshKey(prev => prev + 1)
//   }

//   const handleServiceRequestCreated = () => {
//     setServiceRequestRefreshKey(prev => prev + 1)
//   }

//   const handleTemplateCreated = () => {
//     setTemplateRefreshKey(prev => prev + 1)
//   }

//   const handleEditTemplate = (templateName: string) => {
//     setEditTemplateName(templateName)
//     setShowCreateTemplateModal(true)
//   }

//   // ─── l-setup ───────────────────────────────────────────
//   if (screen === 'l-setup') {
//     return (
//       <div className="flex flex-col min-w-0">
//         <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//           <div className="flex-1 min-w-0">
//             <PatientSearch selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
//           </div>
//           <div className="flex items-center gap-3 flex-shrink-0">
//             <UserMenu />
//             <NotificationBell />
//           </div>
//         </header>

//         <div className="p-4 space-y-4">

//           {/* Lab Test Templates */}
//           <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
//             <div className="font-semibold mb-4 flex items-center justify-between">
//               <span>Lab Test Templates</span>
//               <button
//                 onClick={() => { setEditTemplateName(undefined); setShowCreateTemplateModal(true) }}
//                 className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
//                 title="Create Lab Test Template"
//               >
//                 +
//               </button>
//             </div>
//             <div className="overflow-y-auto max-h-72" style={{ scrollbarWidth: 'thin' }}>
//               <LabTestTemplateList
//                 refreshKey={templateRefreshKey}
//                 selectedPatient={selectedPatient}
//                 onEditClick={handleEditTemplate}
//               />
//             </div>
//           </section>

//           <div className="grid gap-4 md:grid-cols-2">
//             {/* Lab Test Samples */}
//             <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
//               <div className="font-semibold mb-3 flex items-center justify-between">
//                 <span>Lab Test Samples</span>
//                 <button
//                   onClick={() => setShowCreateSampleModal(true)}
//                   className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
//                   title="Create Lab Test Sample"
//                 >
//                   +
//                 </button>
//               </div>
//               <div className="overflow-y-auto max-h-56" style={{ scrollbarWidth: 'thin' }}>
//                 {samplesLoading ? (
//                   <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
//                 ) : labSamples.length === 0 ? (
//                   <div className="text-center text-sm text-slate-400 py-4">NO LAB TEST SAMPLES YET</div>
//                 ) : (
//                   <table className="min-w-full text-sm">
//                     <thead>
//                       <tr className="bg-slate-50">
//                         <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Sample</th>
//                         <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Type</th>
//                         <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">UOM</th>
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {labSamples.map(s => (
//                         <tr key={s.name} className="border-t border-slate-100 hover:bg-slate-50">
//                           <td className="px-3 py-2 font-medium text-slate-800">{s.sample || s.name}</td>
//                           <td className="px-3 py-2 text-slate-500">{s.sample_type || '—'}</td>
//                           <td className="px-3 py-2 text-slate-500">{s.sample_uom || '—'}</td>
//                         </tr>
//                       ))}
//                     </tbody>
//                   </table>
//                 )}
//               </div>
//             </section>

//             {/* Sample Types */}
//             <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
//               <div className="font-semibold mb-3 flex items-center justify-between">
//                 <span>Sample Types</span>
//                 <button
//                   onClick={() => setShowCreateSampleTypeModal(true)}
//                   className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
//                   title="Create Sample Type"
//                 >
//                   +
//                 </button>
//               </div>
//               <div className="overflow-y-auto max-h-56" style={{ scrollbarWidth: 'thin' }}>
//                 {sampleTypesLoading ? (
//                   <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
//                 ) : sampleTypes.length === 0 ? (
//                   <div className="text-center text-sm text-slate-400 py-4">NO SAMPLE TYPES YET</div>
//                 ) : (
//                   <div className="flex flex-wrap gap-2 p-1">
//                     {sampleTypes.map(t => (
//                       <span key={t.name}
//                         className="inline-block px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">
//                         {t.label || t.name}
//                       </span>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             </section>
//           </div>
//         </div>

//         {showCreateTemplateModal && (
//           <CreateLabTestTemplateModal
//             onClose={() => { setShowCreateTemplateModal(false); setEditTemplateName(undefined) }}
//             onSuccess={() => {
//               setShowCreateTemplateModal(false)
//               setEditTemplateName(undefined)
//               setTemplateRefreshKey(k => k + 1)
//               handleTemplateCreated()
//             }}
//             templateName={editTemplateName}
//           />
//         )}
//         {showCreateSampleModal && (
//           <CreateLabTestSampleModal
//             onClose={() => setShowCreateSampleModal(false)}
//             onSuccess={() => { setShowCreateSampleModal(false); setSampleRefreshKey(k => k + 1) }}
//           />
//         )}
//         {showCreateSampleTypeModal && (
//           <CreateSampleTypeModal
//             onClose={() => setShowCreateSampleTypeModal(false)}
//             onSuccess={() => { setShowCreateSampleTypeModal(false); setSampleTypeRefreshKey(k => k + 1) }}
//           />
//         )}
//       </div>
//     )
//   }

//   // Render based on screen
//   if (screen === 'l-req') {
//     if (!canCreateLabServiceRequests) {
//       return (
//         <div className="flex flex-col">
//           <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//             <div className="flex-1 min-w-0">
//               <PatientSearch
//                 selectedPatient={selectedPatient || ''}
//                 onPatientSelect={handlePatientSelect}
//                 patients={[]}
//               />
//             </div>
//             <div className="flex items-center gap-3 flex-shrink-0">
//               <UserMenu />
//               <NotificationBell />
//             </div>
//           </header>
//           <div className="p-4">
//             <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
//               <p className="text-sm text-slate-700">
//                 You are not allowed to create Lab Service Requests. Please contact a Doctor, System Manager, or Healthcare Administrator.
//               </p>
//             </section>
//           </div>
//         </div>
//       )
//     }

//     // Lab Test Requests - show service requests with Lab Test Template
//     return (
//       <div className="flex flex-col min-w-0">
//         <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//           <div className="flex-1 min-w-0">
//             <PatientSearch
//               selectedPatient={selectedPatient || ''}
//               onPatientSelect={handlePatientSelect}
//               patients={[]}
//             />
//           </div>
//           <div className="flex items-center gap-3 flex-shrink-0">
//             <UserMenu />
//             <NotificationBell />
//           </div>
//         </header>

//         <div className="p-4">
//           <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
//             <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
//               <span>Lab Test Requests</span>
//               <button
//                 onClick={() => setShowServiceRequestModal(true)}
//                 className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
//                 title="Add Service Request"
//               >
//                 +
//               </button>
//             </div>
//             <div className="overflow-x-auto overflow-visible" style={{ scrollbarWidth: 'thin' }}>
//               <ServiceRequestList 
//                 patient={selectedPatient} 
//                 onLabTestCreated={handleLabTestCreated}
//                 refreshKey={serviceRequestRefreshKey}
//                 template_dt="Lab Test Template"
//               />
//             </div>
//           </section>
//         </div>
//         {showServiceRequestModal && (
//           <CreateServiceRequestModal
//             onClose={() => setShowServiceRequestModal(false)}
//             onSuccess={() => { 
//               setShowServiceRequestModal(false); 
//               handleServiceRequestCreated() 
//             }}
//             initialPatient={selectedPatient}
//             labTestTemplateOnly
//           />
//         )}
//       </div>
//     )
//   }

//   if (screen === 'l-out') {
//     // Outsourced Tests - show only lab tests where is_outsourced = 1
//     return (
//       <div className="flex flex-col min-w-0">
//         <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//           <div className="flex-1 min-w-0">
//             <PatientSearch
//               selectedPatient={selectedPatient || ''}
//               onPatientSelect={handlePatientSelect}
//               patients={[]}
//             />
//           </div>
//           <div className="flex items-center gap-3 flex-shrink-0">
//             <UserMenu />
//             <NotificationBell />
//           </div>
//         </header>

//         <div className="p-4">
//           <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
//             <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
//               <span>Outsourced Tests</span>
//               <button
//                 onClick={() => setShowLabTestModal(true)}
//                 className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
//                 title="Add Lab Test"
//               >
//                 +
//               </button>
//             </div>
//             <div className="overflow-x-auto overflow-visible" style={{ scrollbarWidth: 'thin' }}>
//               <LabTestList patient={selectedPatient} isOutsourced={true} key={labTestRefreshKey} />
//             </div>
//           </section>
//         </div>
//         {showLabTestModal && (
//           <CreateLabTestModal
//             onClose={() => setShowLabTestModal(false)}
//             onSuccess={() => {
//               setShowLabTestModal(false)
//               handleLabTestCreated()
//             }}
//             initialPatient={selectedPatient}
//           />
//         )}
//       </div>
//     )
//   }

//   if (screen === 'l-results') {
//     // Lab Test & Result - show all lab tests
//     return (
//       <div className="flex flex-col min-w-0">
//         <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//           <div className="flex-1 min-w-0">
//             <PatientSearch
//               selectedPatient={selectedPatient || ''}
//               onPatientSelect={handlePatientSelect}
//               patients={[]}
//             />
//           </div>
//           <div className="flex items-center gap-3 flex-shrink-0">
//             <UserMenu />
//             <NotificationBell />
//           </div>
//         </header>

//         <div className="p-4">
//           <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
//             <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
//               <span>Lab Test & Result</span>
//               <button
//                 onClick={() => setShowLabTestModal(true)}
//                 className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
//                 title="Add Lab Test"
//               >
//                 +
//               </button>
//             </div>
//             <div className="overflow-x-auto overflow-visible" style={{ scrollbarWidth: 'thin' }}>
//               <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
//             </div>
//           </section>
//         </div>
//         {showLabTestModal && (
//           <CreateLabTestModal
//             onClose={() => setShowLabTestModal(false)}
//             onSuccess={() => {
//               setShowLabTestModal(false)
//               handleLabTestCreated()
//             }}
//             initialPatient={selectedPatient}
//           />
//         )}
//       </div>
//     )
//   }

//   // Default view — card-based navigation
//   const labNavCards = NAV_CARDS.filter(
//     (card) => canSeeServiceRequestsTab || card.id !== 'service-requests'
//   )
//   const resolvedTab: LabTab =
//     !canSeeServiceRequestsTab && activeTab === 'service-requests' ? 'lab-tests' : activeTab
//   const activeCard =
//     labNavCards.find((c) => c.id === resolvedTab) ??
//     labNavCards.find((c) => c.id === 'lab-tests') ??
//     labNavCards[0]
//   const needsPatient = resolvedTab === 'medical-history' || resolvedTab === 'warnings'

//   return (
//     <div className="flex flex-col h-full min-w-0">
//       <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20">
//         <div className="flex-1 min-w-0">
//           <PatientSearch
//             selectedPatient={selectedPatient || ''}
//             onPatientSelect={handlePatientSelect}
//             patients={[]}
//           />
//         </div>
//         <div className="flex items-center gap-3 flex-shrink-0">
//           <UserMenu />
//           <NotificationBell />
//         </div>
//       </header>

//       <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">

//         {/* Navigation cards */}
//         <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
//           {labNavCards.map((card) => {
//             const Icon = card.icon
//             const isActive = resolvedTab === card.id
//             return (
//               <button
//                 key={card.id}
//                 type="button"
//                 onClick={() => handleTabChange(card.id)}
//                 className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all hover:shadow-md ${
//                   isActive
//                     ? `${card.color} shadow-sm`
//                     : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
//                 }`}
//               >
//                 <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
//                   <Icon className={`w-5 h-5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
//                 </div>
//                 <div>
//                   <p className={`text-sm font-semibold ${isActive ? '' : 'text-slate-800'}`}>{card.title}</p>
//                   <p className={`text-xs mt-0.5 ${isActive ? 'opacity-80' : 'text-slate-500'}`}>{card.desc}</p>
//                 </div>
//               </button>
//             )
//           })}
//         </div>

//         {/* Active section */}
//         <section className="bg-white border border-slate-200 rounded-lg shadow-sm">
//           <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
//             <div>
//               <h2 className="text-sm font-semibold text-slate-800">{activeCard.title}</h2>
//               <p className="text-xs text-slate-500 mt-0.5">{activeCard.desc}</p>
//             </div>
//             {resolvedTab === 'service-requests' && canSeeServiceRequestsTab && (
//               <button
//                 type="button"
//                 onClick={() => setShowServiceRequestModal(true)}
//                 className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-base font-bold"
//                 title="New Service Request"
//               >
//                 +
//               </button>
//             )}
//             {resolvedTab === 'lab-tests' && (
//               <button
//                 type="button"
//                 onClick={() => setShowLabTestModal(true)}
//                 className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-base font-bold"
//                 title="New Lab Test"
//               >
//                 +
//               </button>
//             )}
//             {resolvedTab === 'lab-templates' && (
//               <button
//                 type="button"
//                 onClick={() => { setEditTemplateName(undefined); setShowCreateTemplateModal(true) }}
//                 className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-base font-bold"
//                 title="New Lab Test Template"
//               >
//                 +
//               </button>
//             )}
//           </div>

//           <div className="overflow-x-auto overflow-y-auto max-h-[480px] p-1" style={{ scrollbarWidth: 'thin' }}>
//             {resolvedTab === 'service-requests' && canSeeServiceRequestsTab && (
//               <ServiceRequestList
//                 patient={selectedPatient}
//                 onLabTestCreated={handleLabTestCreated}
//                 refreshKey={serviceRequestRefreshKey}
//                 template_dt="Lab Test Template"
//               />
//             )}
//             {resolvedTab === 'lab-tests' && (
//               <LabTestList patient={selectedPatient} key={labTestRefreshKey} />
//             )}
//             {resolvedTab === 'sample-collection' && (
//               <div className="p-3">
//                 <SampleCollectionList
//                   patient={selectedPatient}
//                   refreshKey={sampleCollectionRefreshKey}
//                 />
//               </div>
//             )}
//             {resolvedTab === 'lab-templates' && (
//               <div className="p-3">
//                 <LabTestTemplateList
//                   refreshKey={templateRefreshKey}
//                   selectedPatient={selectedPatient}
//                   onEditClick={handleEditTemplate}
//                 />
//               </div>
//             )}
//             {resolvedTab === 'medical-history' && (
//               needsPatient && !selectedPatient ? (
//                 <div className="flex flex-col items-center justify-center py-12 text-slate-400">
//                   <BookOpen className="w-10 h-10 mb-3 opacity-40" />
//                   <p className="text-sm font-medium">Select a patient to view medical history</p>
//                 </div>
//               ) : (
//                 <div className="p-3">
//                   <MedicalHistoryView patient={selectedPatient!} />
//                 </div>
//               )
//             )}
//             {resolvedTab === 'warnings' && (
//               needsPatient && !selectedPatient ? (
//                 <div className="flex flex-col items-center justify-center py-12 text-slate-400">
//                   <AlertTriangle className="w-10 h-10 mb-3 opacity-40" />
//                   <p className="text-sm font-medium">Select a patient to view allergies & warnings</p>
//                 </div>
//               ) : (
//                 <div className="p-3">
//                   <WarningMessagesList patient={selectedPatient!} />
//                 </div>
//               )
//             )}
//           </div>
//         </section>

//       </div>

//       {showLabTestModal && (
//         <CreateLabTestModal
//           onClose={() => setShowLabTestModal(false)}
//           onSuccess={() => { setShowLabTestModal(false); handleLabTestCreated() }}
//           initialPatient={selectedPatient}
//         />
//       )}
//       {showServiceRequestModal && canSeeServiceRequestsTab && (
//         <CreateServiceRequestModal
//           onClose={() => setShowServiceRequestModal(false)}
//           onSuccess={() => { 
//             setShowServiceRequestModal(false); 
//             handleServiceRequestCreated() 
//           }}
//           initialPatient={selectedPatient}
//           labTestTemplateOnly
//         />
//       )}
//       {showCreateTemplateModal && (
//         <CreateLabTestTemplateModal
//           onClose={() => { setShowCreateTemplateModal(false); setEditTemplateName(undefined) }}
//           onSuccess={() => {
//             setShowCreateTemplateModal(false)
//             setEditTemplateName(undefined)
//             setTemplateRefreshKey(k => k + 1)
//             handleTemplateCreated()
//           }}
//           templateName={editTemplateName}
//         />
//       )}
//     </div>
//   )
// }

import { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useCareContext } from '../providers/CareContextProvider'
import { FlaskConical, Droplet, History, Clock, TestTube2, Tags, Layers, FileStack } from 'lucide-react'
import { PatientCareHeader } from '../components/patients/PatientCareHeader'
import { LabTestList, type LabTestListBatchSaveRef } from '../components/labTests/LabTestList'
import { LabBookedRequestList } from '../components/labTests/LabBookedRequestList'
import { DashboardCard } from '../components/ui/DashboardCard'
import { LabTestResultsSaveHeader } from '../components/labTests/LabTestResultsSaveHeader'
import { CreateLabTestModal } from '../components/labTests/CreateLabTestModal'
import { CreateLabTestTemplateModal } from '../components/labTests/CreateLabTestTemplateModal'
import { LabTestTemplateList } from '../components/labTests/LabTestTemplateList'
import { LabTestSetupGroups } from '../components/labTests/LabTestSetupGroups'
import { CreateLabTestSampleModal } from '../components/labTests/CreateLabTestSampleModal'
import { CreateSampleTypeModal } from '../components/labTests/CreateSampleTypeModal'
import { SampleCollectionList } from '../components/labTests/SampleCollectionList'
import { LabTestHistory } from '../components/labTests/LabTestHistory' // ADD THIS IMPORT
import { NursingInventoryDashboard } from '../components/nursingInventory/NursingInventoryDashboard'
import { fetchLabTestSamples, fetchSampleTypes, type LabTestSampleOption, type LinkFieldOption } from '../services/common'

type LabTab = 'pending-lab-tests' | 'lab-tests' | 'sample-collection' | 'lab-history'

type SetupTab = 'templates' | 'samples' | 'sample-types' | 'lab-setup'

const VALID_LAB_TABS: LabTab[] = [
  'pending-lab-tests',
  'sample-collection',
  'lab-tests',
  'lab-history',
]

const SETUP_NAV_CARDS = [
  {
    id: 'templates' as SetupTab,
    title: 'Lab Test Templates',
    icon: FileStack,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    iconColor: 'text-indigo-600',
  },
  {
    id: 'samples' as SetupTab,
    title: 'Lab Test Samples',
    icon: TestTube2,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    iconColor: 'text-cyan-600',
  },
  {
    id: 'sample-types' as SetupTab,
    title: 'Sample Types',
    icon: Tags,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    id: 'lab-setup' as SetupTab,
    title: 'Lab Setup',
    icon: Layers,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    iconColor: 'text-violet-600',
  },
]

const NAV_CARDS = [
  {
    id: 'pending-lab-tests' as LabTab,
    title: 'Lab Request',
    icon: Clock,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    iconColor: 'text-orange-600',
  },
  {
    id: 'sample-collection' as LabTab,
    title: 'Sample Collection',
    icon: Droplet,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    iconColor: 'text-cyan-600',
  },
  {
    id: 'lab-tests' as LabTab,
    title: 'Tests & Results',
    icon: FlaskConical,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'lab-history' as LabTab,
    title: 'Lab Test History',
    icon: History,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    iconColor: 'text-teal-600',
  },
]

export const LabPage = () => {
  const {
    selectedPatient: globalPatient,
    setSelectedPatient: setGlobalPatient,
    userRole,
  } = useCareContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const patientFromUrl = searchParams.get('patient')
  const screen = searchParams.get('screen')
  const roles = userRole || []
  const isLabTechnologist = roles.includes('Laboratory User') && !roles.some((role) =>
    ['Doctor', 'System Manager', 'Healthcare Administrator', 'Administrator'].includes(role)
  )

  const tabParam = searchParams.get('tab')
  const tabFromUrl: LabTab =
    tabParam && VALID_LAB_TABS.includes(tabParam as LabTab)
      ? (tabParam as LabTab)
      : 'lab-tests'

  const [selectedPatient, setSelectedPatient] = useState<string | undefined>(() => patientFromUrl || globalPatient || undefined)
  // 'l-results' (the old "Lab Test & Result" tab) was merged into this dashboard's
  // "Tests & Results" card; land legacy deep links on that tab.
  const [activeTab, setActiveTab] = useState<LabTab>(screen === 'l-results' ? 'lab-tests' : tabFromUrl)
  const [labTestRefreshKey, setLabTestRefreshKey] = useState(0)
  const [showLabTestModal, setShowLabTestModal] = useState(false)
  const [sampleCollectionRefreshKey, setSampleCollectionRefreshKey] = useState(0)

  // Template management state
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [editTemplateName, setEditTemplateName] = useState<string | undefined>(undefined)

  // Setup screen state (existing)
  const [showCreateSampleModal, setShowCreateSampleModal] = useState(false)
  const [sampleRefreshKey, setSampleRefreshKey] = useState(0)
  const [labSamples, setLabSamples] = useState<LabTestSampleOption[]>([])
  const [samplesLoading, setSamplesLoading] = useState(false)

  const [showCreateSampleTypeModal, setShowCreateSampleTypeModal] = useState(false)
  const [sampleTypeRefreshKey, setSampleTypeRefreshKey] = useState(0)
  const [sampleTypes, setSampleTypes] = useState<LinkFieldOption[]>([])
  const [sampleTypesLoading, setSampleTypesLoading] = useState(false)
  const [setupTab, setSetupTab] = useState<SetupTab>('templates')

  const [pendingResultCount, setPendingResultCount] = useState(0)
  const [batchSaving, setBatchSaving] = useState(false)
  const batchSaveRef = useRef<LabTestListBatchSaveRef | null>(null)

  const handleBatchSave = async () => {
    await batchSaveRef.current?.savePendingChanges()
  }

  const batchListProps = {
    onPendingCountChange: setPendingResultCount,
    onBatchSavingChange: setBatchSaving,
    batchSaveRef,
  }

  const labTestSaveHeader = (
    <LabTestResultsSaveHeader
      pendingCount={pendingResultCount}
      batchSaving={batchSaving}
      onSave={handleBatchSave}
    />
  )

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

  // Sync selectedPatient and activeTab with URL
  useEffect(() => {
    const patientParam = searchParams.get('patient')
    if (patientParam && patientParam !== selectedPatient) {
      setSelectedPatient(patientParam)
    }
  }, [searchParams])

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    setGlobalPatient(patient)
    const newSearchParams = new URLSearchParams(searchParams)
    if (patient) {
      newSearchParams.set('patient', patient)
    } else {
      newSearchParams.delete('patient')
    }
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleTabChange = (newTab: LabTab) => {
    setActiveTab(newTab)
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('tab', newTab)
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleLabTestCreated = () => {
    setLabTestRefreshKey(prev => prev + 1)
    setSampleCollectionRefreshKey(prev => prev + 1)
  }

  const handleTemplateCreated = () => {
    setTemplateRefreshKey(prev => prev + 1)
  }

  const handleEditTemplate = (templateName: string) => {
    setEditTemplateName(templateName)
    setShowCreateTemplateModal(true)
  }

  // ─── l-setup ───────────────────────────────────────────
  if (screen === 'l-setup') {
    const activeSetupCard =
      SETUP_NAV_CARDS.find((c) => c.id === setupTab) ?? SETUP_NAV_CARDS[0]

    return (
      <div className="flex flex-col flex-1 min-h-0 h-full min-w-0 overflow-hidden">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden p-4 gap-4">
          {/* Navigation cards — same pattern as lab main page */}
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-1.5 shrink-0">
            {SETUP_NAV_CARDS.map((card) => {
              const Icon = card.icon
              const isActive = setupTab === card.id
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSetupTab(card.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center transition-all hover:shadow-sm ${
                    isActive
                      ? `${card.color} shadow-sm`
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className={`rounded-md p-1 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                    <Icon className={`h-3.5 w-3.5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                  </div>
                  <p
                    className={`text-[10px] leading-tight sm:text-[11px] ${
                      isActive ? 'font-bold' : 'font-medium text-slate-800'
                    }`}
                  >
                    {card.title}
                  </p>
                </button>
              )
            })}
          </div>

          {setupTab === 'lab-setup' ? (
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <LabTestSetupGroups
                refreshKey={templateRefreshKey}
                onEditClick={handleEditTemplate}
              />
            </div>
          ) : (
            <DashboardCard
              noHeightLimit
              className="flex-1 min-h-0"
              openListingTitle={`Expand ${activeSetupCard.title}`}
              filterable={false}
              {...(setupTab === 'templates'
                ? {
                    onAdd: () => {
                      setEditTemplateName(undefined)
                      setShowCreateTemplateModal(true)
                    },
                    addButtonTitle: 'Create Lab Test Template',
                  }
                : {})}
              {...(setupTab === 'samples'
                ? {
                    onAdd: () => setShowCreateSampleModal(true),
                    addButtonTitle: 'Create Lab Test Sample',
                  }
                : {})}
              {...(setupTab === 'sample-types'
                ? {
                    onAdd: () => setShowCreateSampleTypeModal(true),
                    addButtonTitle: 'Create Sample Type',
                  }
                : {})}
            >
              {setupTab === 'templates' && (
                <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  <LabTestTemplateList
                    refreshKey={templateRefreshKey}
                    selectedPatient={selectedPatient}
                    onEditClick={handleEditTemplate}
                  />
                </div>
              )}

              {setupTab === 'samples' && (
                <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  {samplesLoading ? (
                    <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
                  ) : labSamples.length === 0 ? (
                    <div className="text-center text-sm text-slate-400 py-4">NO LAB TEST SAMPLES YET</div>
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
                        {labSamples.map((s) => (
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
              )}

              {setupTab === 'sample-types' && (
                <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  {sampleTypesLoading ? (
                    <div className="text-center text-sm text-slate-400 py-4">Loading…</div>
                  ) : sampleTypes.length === 0 ? (
                    <div className="text-center text-sm text-slate-400 py-4">NO SAMPLE TYPES YET</div>
                  ) : (
                    <div className="flex flex-wrap gap-2 p-1">
                      {sampleTypes.map((t) => (
                        <span
                          key={t.name}
                          className="inline-block px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium"
                        >
                          {t.label || t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </DashboardCard>
          )}
        </div>

        {showCreateTemplateModal && (
          <CreateLabTestTemplateModal
            onClose={() => {
              setShowCreateTemplateModal(false)
              setEditTemplateName(undefined)
            }}
            onSuccess={() => {
              setShowCreateTemplateModal(false)
              setEditTemplateName(undefined)
              setTemplateRefreshKey((k) => k + 1)
              handleTemplateCreated()
            }}
            templateName={editTemplateName}
          />
        )}
        {showCreateSampleModal && (
          <CreateLabTestSampleModal
            onClose={() => setShowCreateSampleModal(false)}
            onSuccess={() => {
              setShowCreateSampleModal(false)
              setSampleRefreshKey((k) => k + 1)
            }}
          />
        )}
        {showCreateSampleTypeModal && (
          <CreateSampleTypeModal
            onClose={() => setShowCreateSampleTypeModal(false)}
            onSuccess={() => {
              setShowCreateSampleTypeModal(false)
              setSampleTypeRefreshKey((k) => k + 1)
            }}
          />
        )}
      </div>
    )
  }

  // Render based on screen
  if (screen === 'l-out') {
    // Outsourced Tests - show only lab tests where is_outsourced = 1
    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

        <div className="p-4">
          <DashboardCard
            title="Outsourced Tests"
            noHeightLimit
            headerExtra={labTestSaveHeader}
            onAdd={() => setShowLabTestModal(true)}
            addButtonTitle="Add Lab Test"
          >
            <LabTestList
              patient={selectedPatient}
              isOutsourced={true}
              key={labTestRefreshKey}
              onPatientClick={handlePatientSelect}
              hideAmount={isLabTechnologist}
              {...batchListProps}
            />
          </DashboardCard>
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

  if (screen === 'l-inventory') {
    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto">
        <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />
        <div className="p-4">
          <DashboardCard title="Inventory Dashboard" filterable={false} noHeightLimit>
            <NursingInventoryDashboard warehouseContext="laboratory" />
          </DashboardCard>
        </div>
      </div>
    )
  }

  if (screen === 'l-mh') {
    // Past Medical History removed for lab technicians — send legacy deep links home.
    return <Navigate to="/lab" replace />
  }

  // Note: the old "Lab Test & Result" screen (screen === 'l-results') was merged into
  // the default dashboard's "Tests & Results" card (which now carries the status tabs).

  // Default view — card-based navigation
  const labNavCards = NAV_CARDS
  const resolvedTab = activeTab
  const activeCard =
    labNavCards.find((c) => c.id === resolvedTab) ??
    labNavCards.find((c) => c.id === 'lab-tests') ??
    labNavCards[0]
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-w-0 overflow-hidden">
      <PatientCareHeader selectedPatient={selectedPatient || ''} onPatientSelect={handlePatientSelect} patients={[]} />

      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden p-4 gap-4">

        {/* Navigation cards */}
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-1.5 shrink-0">
          {labNavCards.map((card) => {
            const Icon = card.icon
            const isActive = resolvedTab === card.id
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleTabChange(card.id)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center transition-all hover:shadow-sm ${
                  isActive
                    ? `${card.color} shadow-sm`
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className={`rounded-md p-1 ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? card.iconColor : 'text-slate-500'}`} />
                </div>
                <p className={`text-[10px] leading-tight sm:text-[11px] ${isActive ? 'font-bold' : 'font-medium text-slate-800'}`}>
                  {card.title}
                </p>
              </button>
            )
          })}
        </div>

        {/* Active section — listing card fills remaining page height (nav tabs already name the section) */}
        <DashboardCard
          noHeightLimit
          className="flex-1 min-h-0"
          openListingTitle={`Expand ${activeCard.title}`}
          filterable={false}
          {...(resolvedTab === 'lab-tests'
            ? {
                headerExtra: labTestSaveHeader,
                onAdd: () => setShowLabTestModal(true),
                addButtonTitle: 'Add Lab Test',
              }
            : {})}
        >
          {resolvedTab === 'pending-lab-tests' && (
            <LabBookedRequestList
              patient={selectedPatient}
              refreshKey={labTestRefreshKey}
              onPatientClick={handlePatientSelect}
              hideAmount={isLabTechnologist}
            />
          )}
          {resolvedTab === 'lab-tests' && (
            <LabTestList
              patient={selectedPatient}
              key={labTestRefreshKey}
              statusTabs
              onPatientClick={handlePatientSelect}
              hideAmount={isLabTechnologist}
              {...batchListProps}
            />
          )}
          {resolvedTab === 'sample-collection' && (
            <div className="flex flex-col flex-1 min-h-0 p-1">
              <SampleCollectionList patient={selectedPatient} refreshKey={sampleCollectionRefreshKey} />
            </div>
          )}
          {resolvedTab === 'lab-history' && (
            <div className="flex flex-col flex-1 min-h-0 p-1 overflow-auto">
              <LabTestHistory patientId={selectedPatient} onPatientChange={(p) => handlePatientSelect(p)} />
            </div>
          )}
        </DashboardCard>

      </div>

      {showLabTestModal && (
        <CreateLabTestModal
          onClose={() => setShowLabTestModal(false)}
          onSuccess={() => { setShowLabTestModal(false); handleLabTestCreated() }}
          initialPatient={selectedPatient}
        />
      )}
      {showCreateTemplateModal && (
        <CreateLabTestTemplateModal
          onClose={() => { setShowCreateTemplateModal(false); setEditTemplateName(undefined) }}
          onSuccess={() => {
            setShowCreateTemplateModal(false)
            setEditTemplateName(undefined)
            setTemplateRefreshKey(k => k + 1)
            handleTemplateCreated()
          }}
          templateName={editTemplateName}
        />
      )}
    </div>
  )
}