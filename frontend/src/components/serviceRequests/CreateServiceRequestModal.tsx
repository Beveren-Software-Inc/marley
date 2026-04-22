// import { useState, useEffect } from 'react'
// import {
//   searchPatients,
//   fetchPatients,
//   type PatientListItem
// } from '../../services/patients'

// import {
//   fetchHealthcarePractitioners,
//   getCurrentUserPractitioner,
//   fetchServiceRequestTemplateTypes,
//   fetchServiceRequestTemplates,
//   fetchPatientVisits,
//   fetchInpatientAdmissions,
//   fetchCostCenters,
//   type LinkFieldOption,
// } from '../../services/common'

// import {
//   createServiceRequest,
//   type CreateServiceRequestData
// } from '../../services/serviceRequests'

// import { toast } from '../../hooks/useToast'
// import { X, ChevronDown } from 'lucide-react'
// import { useCareContext } from '../../providers/CareContextProvider'

// interface CreateServiceRequestModalProps {
//   onClose: () => void
//   onSuccess: () => void
//   initialPatient?: string
//   /** Pre-fill with either a template type or a specific template name/docname */
//   initialTemplate?: string
//   /** Default template type for nursing context */
//   defaultTemplateType?: string
// }

// interface PricingRow {
//   patient_category: string
//   price: number | null
// }

// interface GroupTemplateItem {
//   template_dn: string
//   template_label: string
//   pricing: PricingRow[]
// }

// export const CreateServiceRequestModal = ({
//   onClose,
//   onSuccess,
//   initialPatient,
//   initialTemplate,
//   defaultTemplateType,
// }: CreateServiceRequestModalProps) => {
//   // Get context from CareContextProvider
//   const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
//   // Determine if we're in IP or OP mode based on context
//   const isIPMode = mode === 'IP'
//   const isOPMode = mode === 'OP'

//   /* ────────────── PATIENT ────────────── */
//   const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
//   const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
//   const [patientCategory, setPatientCategory] = useState('')
//   const [patients, setPatients] = useState<PatientListItem[]>([])
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [loadingPatients, setLoadingPatients] = useState(false)

//   /* ────────────── LOOKUPS ────────────── */
//   const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
//   const [templates, setTemplates] = useState<LinkFieldOption[]>([])
//   const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
//   const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
//   const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
//   const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])

//   const [practOpen, setPractOpen] = useState(false)
//   const [practQuery, setPractQuery] = useState('')
//   const [costCenterOpen, setCostCenterOpen] = useState(false)
//   const [costCenterSearch, setCostCenterSearch] = useState('')

//   // Template search state
//   const [templateOpen, setTemplateOpen] = useState(false)
//   const [templateQuery, setTemplateQuery] = useState('')
//   const [templateLoading, setTemplateLoading] = useState(false)
//   const [selectedTemplate, setSelectedTemplate] = useState<LinkFieldOption | null>(null)
//   const [showOnlyGroupTemplates, setShowOnlyGroupTemplates] = useState(false)

//   /* ────────────── PRICING & DISCOUNT ────────────── */
//   const [pricing, setPricing] = useState<PricingRow[]>([])
//   const [selectedPrice, setSelectedPrice] = useState<number | null>(null)
//   const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage')
//   const [discountValue, setDiscountValue] = useState<number>(0)
//   const [discountAmount, setDiscountAmount] = useState<number>(0)
//   const [grandTotal, setGrandTotal] = useState<number>(0)

//   /* ────────────── GROUP TEMPLATE ────────────── */
//   const [isGroupTemplate, setIsGroupTemplate] = useState(false)
//   const [groupTemplates, setGroupTemplates] = useState<GroupTemplateItem[]>([])

//   /* ────────────── FORM ────────────── */
//   const [formData, setFormData] = useState({
//     template_dt: defaultTemplateType || '',
//     template_dn: '',
//     practitioner: '',
//     patient_visit: (isOPMode && activeVisit) ? activeVisit : '',
//     inpatient_record: (isIPMode && activeAdmission) ? activeAdmission : '',
//     order_date: new Date().toISOString().split('T')[0],
//     order_time: new Date().toTimeString().slice(0, 5),
//     department: '',
//     cost_center: ''
//   })

//   const [submitting, setSubmitting] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // Get effective patient
//   const effectivePatient = selectedPatient?.name || initialPatient || contextPatient || ''

//   // Auto-load patient label if context exists
//   useEffect(() => {
//     const patientToLoad = initialPatient || contextPatient
//     if (patientToLoad && !selectedPatient) {
//       fetchPatients(1, 0, patientToLoad).then((res) => {
//         if (res.length > 0) {
//           setSelectedPatient(res[0])
//           setPatientQuery(res[0].patient_name || res[0].name)
//           setPatientCategory((res[0] as any).category || '')
//         }
//       }).catch(() => {})
//     }
//   }, [initialPatient, contextPatient, selectedPatient])

//   // Auto-load visit/admission label if context exists
//   useEffect(() => {
//     if (isIPMode && activeAdmission && effectivePatient) {
//       const loadAdmissionLabel = async () => {
//         try {
//           const admissionsList = await fetchInpatientAdmissions(effectivePatient, activeAdmission)
//           const matched = admissionsList.find(a => a.name === activeAdmission)
//           if (matched && !selectedPatient) {
//             // Admission label loaded
//           }
//         } catch (err) {
//           console.error('Failed to load admission label:', err)
//         }
//       }
//       loadAdmissionLabel()
//     } else if (isOPMode && activeVisit && effectivePatient) {
//       const loadVisitLabel = async () => {
//         try {
//           const visits = await fetchPatientVisits(effectivePatient, activeVisit)
//           const matched = visits.find(v => v.name === activeVisit)
//           if (matched && !selectedPatient) {
//             // Visit label loaded
//           }
//         } catch (err) {
//           console.error('Failed to load visit label:', err)
//         }
//       }
//       loadVisitLabel()
//     }
//   }, [isIPMode, isOPMode, activeAdmission, activeVisit, effectivePatient, selectedPatient])

//   /* ────────────── INITIAL LOAD ────────────── */
//   useEffect(() => {
//     const loadInitialData = async () => {
//       try {
//         const types = await fetchServiceRequestTemplateTypes()
//         setTemplateTypes(types)

//         const practitionersList = await fetchHealthcarePractitioners()
//         setPractitioners(practitionersList)

//         const initialTemplateIsType = !!initialTemplate && types.some(
//           (t) => t.name === initialTemplate || t.label === initialTemplate
//         )

//         const templateType = initialTemplateIsType
//           ? initialTemplate
//           : defaultTemplateType || (initialTemplate ? 'Lab Test Template' : '')

//         const templateDn = !initialTemplateIsType && initialTemplate ? initialTemplate : ''

//         if (templateType) {
//           setFormData((prev) => ({ ...prev, template_dt: templateType }))
          
//           if (templateDn) {
//             const templateList = await fetchServiceRequestTemplates(templateType)
//             const matchedTemplate = templateList.find(t => t.name === templateDn || t.label === templateDn)
//             if (matchedTemplate) {
//               setSelectedTemplate(matchedTemplate)
//               setFormData((prev) => ({ ...prev, template_dn: matchedTemplate.name }))
//               setTemplateQuery(matchedTemplate.label)
//             }
//           }
          
//           const templateList = await fetchServiceRequestTemplates(templateType)
//           setTemplates(templateList)
//         }
//       } catch (err) {
//         console.error('Failed to load service request initial data:', err)
//       }
//     }

//     loadInitialData()
//   }, [initialTemplate, defaultTemplateType])

//   /* ────────────── AUTO-POPULATE PRACTITIONER ────────────── */
//   useEffect(() => {
//     const autoPopulatePractitioner = async () => {
//       try {
//         const practitioner = await getCurrentUserPractitioner()
//         if (practitioner) {
//           setFormData(prev => ({ ...prev, practitioner }))
//           // Also set the query for display
//           const practitionerOption = practitioners.find(p => p.name === practitioner)
//           if (practitionerOption) {
//             setPractQuery(practitionerOption.label)
//           }
//         }
//       } catch (err) {
//         console.error('Failed to auto-populate practitioner:', err)
//       }
//     }
//     autoPopulatePractitioner()
//   }, [practitioners])

//   /* ────────────── TEMPLATE TYPE CHANGE ────────────── */
//   useEffect(() => {
//     // Skip if we already have templates loaded from initialTemplate
//     if (initialTemplate && templates.length > 0) return
    
//     if (!formData.template_dt) {
//       setTemplates([])
//       setSelectedTemplate(null)
//       return
//     }

//     const loadTemplates = async () => {
//       setTemplateLoading(true)
//       try {
//         const templateList = await fetchServiceRequestTemplates(formData.template_dt)
//         setTemplates(templateList)
//       } catch (err) {
//         console.error('Failed to load templates:', err)
//         setTemplates([])
//       } finally {
//         setTemplateLoading(false)
//       }
//     }
    
//     loadTemplates()
//   }, [formData.template_dt])

//   // Search templates with debounce and group filter
//   useEffect(() => {
//     if (!templateOpen) {
//       setTemplateLoading(false)
//       return
//     }

//     const search = async () => {
//       if (!formData.template_dt) return
      
//       setTemplateLoading(true)
//       try {
//         let results = await fetchServiceRequestTemplates(
//           formData.template_dt,
//           templateQuery.trim() === '' ? undefined : templateQuery
//         )
//         console.log('Fetched templates:', results)
//         // Apply group filter if template type is "Lab Test Template"
//         if (formData.template_dt === 'Lab Test Template') {
//           results = results.filter(template => {
//             // Check if the template has an is_group property
//             // You may need to adjust this based on your actual data structure
//             const isGroup = (template as any).is_group === 1 || (template as any).is_group === true
//             return showOnlyGroupTemplates ? isGroup : !isGroup
//           })
//         }
        
//         setTemplates(results)
//       } catch (err) {
//         console.error('Failed to search templates:', err)
//         setTemplates([])
//       } finally {
//         setTemplateLoading(false)
//       }
//     }

//     const timeoutId = setTimeout(() => {
//       search()
//     }, templateQuery.trim() === '' ? 0 : 300)

//     return () => clearTimeout(timeoutId)
//   }, [templateQuery, templateOpen, formData.template_dt, showOnlyGroupTemplates])

//   /* ────────────── LOAD TEMPLATE SERVICE PRICING ────────────── */
//   useEffect(() => {
//     if (!formData.template_dt || !formData.template_dn) {
//       setPricing([])
//       setSelectedPrice(null)
//       setIsGroupTemplate(false)
//       setGroupTemplates([])
//       return
//     }

//     const load = async () => {
//       try {
//         const res = await fetch(
//           `/api/method/healthcare.api.service_request.get_service_request_template_pricing?template_dt=${encodeURIComponent(formData.template_dt)}&template_dn=${encodeURIComponent(formData.template_dn)}`
//         )
//         const resData = await res.json()
//         const info = resData?.message
//         console.log("template group pricing response:", info)
//         if (!info) {
//           setPricing([])
//           setSelectedPrice(null)
//           setIsGroupTemplate(false)
//           setGroupTemplates([])
//           return
//         }

//         if (info.is_group) {
//           setIsGroupTemplate(true)
//           setGroupTemplates(info.group_templates || [])
//           setPricing([])
//             console.log('Calculating total price for group template based on patient category:', info.group_templates)
//           const total = (info.group_templates as GroupTemplateItem[]).reduce((sum, gt) => {
//             const match = patientCategory
//               ? gt.pricing.find((p) => p.patient_category === patientCategory)
//               : gt.pricing[0]
//             return sum + (match?.price ?? 0)
//           }, 0)
//           setSelectedPrice(total > 0 ? total : null)
//         } else {
//           setIsGroupTemplate(false)
//           setGroupTemplates([])
//           const pricingRows: PricingRow[] = info.pricing || []
//           setPricing(pricingRows)
//           if (pricingRows.length > 0 && patientCategory) {
//             const match = pricingRows.find((p) => p.patient_category === patientCategory)
//             setSelectedPrice(match?.price ?? null)
//           } else {
//             setSelectedPrice(null)
//           }
//         }
//       } catch (err) {
//         console.error('Error loading template pricing:', err)
//         setPricing([])
//         setSelectedPrice(null)
//         setIsGroupTemplate(false)
//         setGroupTemplates([])
//       }
//     }

//     load()
//   }, [formData.template_dt, formData.template_dn, patientCategory])

//   /* ────────────── RECALCULATE GRAND TOTAL ────────────── */
//   useEffect(() => {
//     let total = selectedPrice || 0

//     if (discountType === 'percentage' && discountValue > 0) {
//       const discount = (total * discountValue) / 100
//       setDiscountAmount(discount)
//       total -= discount
//     } else if (discountType === 'amount' && discountValue > 0) {
//       setDiscountAmount(discountValue)
//       total -= discountValue
//     } else {
//       setDiscountAmount(0)
//     }

//     setGrandTotal(Math.max(0, total))
//   }, [selectedPrice, discountType, discountValue])

//   /* ────────────── LOAD VISITS + ADMISSIONS ────────────── */
//   useEffect(() => {
//     if (!selectedPatient) return

//     fetchPatientVisits(selectedPatient.name)
//       .then(setPatientVisits)
//       .catch(() => setPatientVisits([]))

//     fetchInpatientAdmissions(selectedPatient.name)
//       .then(setAdmissions)
//       .catch(() => setAdmissions([]))
//   }, [selectedPatient])

//   /* ────────────── PATIENT SEARCH ────────────── */
//   useEffect(() => {
//     if (!patientOpen) return

//     const search = async () => {
//       setLoadingPatients(true)
//       try {
//         const results =
//           patientQuery.trim() === ''
//             ? await fetchPatients(20, 0)
//             : await searchPatients(patientQuery, 20)

//         setPatients(results)
//       } finally {
//         setLoadingPatients(false)
//       }
//     }

//     const t = setTimeout(search, 300)
//     return () => clearTimeout(t)
//   }, [patientQuery, patientOpen])

//   /* ────────────── PRACTITIONER SEARCH ────────────── */
//   useEffect(() => {
//     if (!practOpen) return

//     const t = setTimeout(async () => {
//       const res = await fetchHealthcarePractitioners(practQuery || undefined)
//       setPractitioners(res)
//     }, 300)

//     return () => clearTimeout(t)
//   }, [practQuery, practOpen])

//   /* ────────────── COST CENTER LOOKUP ────────────── */
//   useEffect(() => {
//     if (!costCenterOpen) return

//     const t = setTimeout(() => {
//       fetchCostCenters(undefined, costCenterSearch || undefined)
//         .then(setCostCenters)
//         .catch(() => setCostCenters([]))
//     }, costCenterSearch.trim() === '' ? 0 : 300)

//     return () => clearTimeout(t)
//   }, [costCenterOpen, costCenterSearch])

//   // Reset group filter when template type changes
//   useEffect(() => {
//     setShowOnlyGroupTemplates(false)
//   }, [formData.template_dt])

//   // Get mode-specific help text
//   const getModeHelpText = () => {
//     if (isIPMode) {
//       return `Creating service request for IP admission: ${formData.inpatient_record || 'not selected yet'}`
//     }
//     if (isOPMode) {
//       return `Creating service request for OP visit: ${formData.patient_visit || 'not selected yet'}`
//     }
//     return 'Select either IP or OP mode from the context switcher above'
//   }

//   /* ────────────── SUBMIT ────────────── */
//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setError(null)

//     if (!selectedPatient) {
//       setError('Please select a patient')
//       return
//     }

//     if (!formData.template_dt || !formData.template_dn) {
//       setError('Please select template')
//       return
//     }

//     if (!formData.cost_center) {
//       setError('Please select Cost Center')
//       return
//     }

//     // Validate based on mode
//     if (isIPMode && !formData.inpatient_record) {
//       setError('Please select an inpatient admission (IP mode active)')
//       return
//     }
//     if (isOPMode && !formData.patient_visit) {
//       setError('Please select a patient visit (OP mode active)')
//       return
//     }
//     if (!isIPMode && !isOPMode && !formData.patient_visit && !formData.inpatient_record) {
//       setError('Please select either Patient Visit or Inpatient Admission')
//       return
//     }

//     if (selectedPrice === null && !isGroupTemplate) {
//       setError('Please select a price from pricing table')
//       return
//     }

//     try {
//       setSubmitting(true)

//       const payload: CreateServiceRequestData = {
//         patient: selectedPatient.name,
//         template_dt: formData.template_dt,
//         template_dn: formData.template_dn,
//         practitioner: formData.practitioner || undefined,
//         patient_visit: formData.patient_visit || undefined,
//         inpatient_record: formData.inpatient_record || undefined,
//         order_date: formData.order_date,
//         order_time: formData.order_time,
//         department: formData.department || undefined,
//         cost_center: formData.cost_center || undefined,
//         cost: selectedPrice,
//         discount_value: discountType === 'percentage' ? 'Percentage' : 'Fixed Amount',
//         discount: discountType === 'percentage' ? discountValue : 0,
//         discount_amount: discountAmount,
//         grand_total: grandTotal,
//       }

//       await createServiceRequest(payload)

//       toast.success('Service request created')
//       onSuccess()
//       onClose()

//     } catch (err) {
//       const msg = err instanceof Error ? err.message : 'Failed to create service request'
//       setError(msg)
//       toast.error(msg)
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   // Check if template type is locked (when initialTemplate or default template type is provided)
//   const isTemplateTypeLocked = !!initialTemplate || !!defaultTemplateType

//   const handleTemplateSelect = (template: LinkFieldOption) => {
//     setSelectedTemplate(template)
//     setFormData(prev => ({ ...prev, template_dn: template.name }))
//     setTemplateQuery(template.label)
//     setTemplateOpen(false)
//   }

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
//       <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

//         {/* HEADER */}
//         <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
//           <div>
//             <h2 className="text-xl font-semibold text-slate-900">
//               {formData.template_dt === 'Lab Test Template' ? 'Create Lab Request' : 'Create Service Request'}
//             </h2>
//             <p className="text-xs text-slate-500 mt-0.5">
//               {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
//               {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
//               {getModeHelpText()}
//             </p>
//           </div>
//           <button
//             type="button"
//             onClick={onClose}
//             className="text-slate-400 hover:text-slate-600 transition"
//           >
//             <X className="w-5 h-5" />
//           </button>
//         </div>

//         <form onSubmit={handleSubmit} className="p-6 space-y-6">

//           {/* Mode indicator box */}
//           <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
//             <p className="text-xs font-semibold text-primary mb-1">
//               {isIPMode ? '🏥 Creating Service Request for Inpatient' : isOPMode ? '👤 Creating Service Request for Outpatient' : '📋 Select Context'}
//             </p>
//             <p className="text-xs text-slate-600">
//               {isIPMode 
//                 ? `The service request will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
//                 : isOPMode
//                 ? `The service request will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
//                 : 'Please select either IP or OP mode from the top navbar before creating a service request.'
//               }
//             </p>
//           </div>

//           {error && (
//             <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
//               {error}
//             </div>
//           )}

//           {/* ═══════════ PATIENT ═══════════ */}
//           <div>
//             <label className="block text-sm font-semibold text-slate-900 mb-2">
//               Patient <span className="text-red-500">*</span>
//             </label>

//             <div className="relative">
//               <input
//                 type="text"
//                 value={
//                   selectedPatient
//                     ? selectedPatient.patient_name || selectedPatient.name
//                     : patientQuery
//                 }
//                 onChange={(e) => {
//                   setPatientQuery(e.target.value)
//                   setSelectedPatient(null)
//                   setPatientCategory('')
//                   setPatientOpen(true)
//                 }}
//                 onFocus={() => setPatientOpen(true)}
//                 placeholder="Search patient..."
//                 disabled={Boolean(contextPatient)}
//                 className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${contextPatient ? 'bg-slate-100 cursor-not-allowed' : ''}`}
//               />
//               {contextPatient && (
//                 <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
//               )}

//               {patientOpen && !contextPatient && (
//                 <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                   {loadingPatients ? (
//                     <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
//                   ) : patients.length ? (
//                     patients.map((p) => (
//                       <button
//                         key={p.name}
//                         type="button"
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
//                         onClick={() => {
//                           setSelectedPatient(p)
//                           setPatientQuery(p.patient_name || p.name)
//                           setPatientCategory((p as any).category || '')
//                           setPatientOpen(false)
//                         }}
//                       >
//                         <div className="font-medium text-slate-900">{p.patient_name || p.name}</div>
//                         <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
//                           {(p as any).file_number && <span>File: {(p as any).file_number}</span>}
//                           {(p as any).id_number && <span>ID: {(p as any).id_number}</span>}
//                           {(p as any).category && <span>Category: {(p as any).category}</span>}
//                         </div>
//                       </button>
//                     ))
//                   ) : (
//                     <div className="px-3 py-2 text-xs text-slate-500">No patients found</div>
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* ═══════════ PRACTITIONER ═══════════ */}
//           <div>
//             <label className="block text-sm font-semibold text-slate-900 mb-2">
//               Practitioner
//             </label>

//             <div className="relative">
//               <input
//                 type="text"
//                 value={practOpen ? practQuery : (formData.practitioner ? practitioners.find(p => p.name === formData.practitioner)?.label || formData.practitioner : '')}
//                 onChange={(e) => {
//                   const value = e.target.value
//                   setPractQuery(value)
//                   if (!value) {
//                     setFormData(prev => ({ ...prev, practitioner: '' }))
//                   }
//                   setPractOpen(true)
//                 }}
//                 onFocus={() => setPractOpen(true)}
//                 placeholder="Search practitioner..."
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
//               />



//               {practOpen && (
//                 <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                   {practitioners.length ? (
//                     practitioners.map((p) => (
//                       <button
//                         key={p.name}
//                         type="button"
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
//                         onClick={() => {
//                           setFormData({ ...formData, practitioner: p.name })
//                           setPractQuery(p.label)
//                           setPractOpen(false)
//                         }}
//                       >
//                         {p.label || p.name}
//                       </button>
//                     ))
//                   ) : (
//                     <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* ═══════════ VISIT + ADMISSION (Mode-aware) ═══════════ */}
//           <div className="grid grid-cols-2 gap-4">
//             {/* Patient Visit - only editable in OP mode or no mode */}
//             <div>
//               <label className="block text-sm font-semibold text-slate-900 mb-2">
//                 Patient Visit {isOPMode && <span className="text-red-500">*</span>}
//               </label>
//               {activeVisit ? (
//                 <div>
//                   <input
//                     type="text"
//                     value={formData.patient_visit}
//                     readOnly
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
//                   />
//                   <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
//                 </div>
//               ) : (
//                 <select
//                   value={formData.patient_visit}
//                   onChange={(e) => setFormData({ ...formData, patient_visit: e.target.value })}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
//                   disabled={isIPMode}
//                 >
//                   <option value="">Select visit</option>
//                   {patientVisits.map((v) => (
//                     <option key={v.name} value={v.name}>{v.label || v.name}</option>
//                   ))}
//                 </select>
//               )}
//             </div>

//             {/* Inpatient Admission - only editable in IP mode or no mode */}
//             <div>
//               <label className="block text-sm font-semibold text-slate-900 mb-2">
//                 Inpatient Admission {isIPMode && <span className="text-red-500">*</span>}
//               </label>
//               {activeAdmission ? (
//                 <div>
//                   <input
//                     type="text"
//                     value={formData.inpatient_record}
//                     readOnly
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
//                   />
//                   <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
//                 </div>
//               ) : (
//                 <select
//                   value={formData.inpatient_record}
//                   onChange={(e) => setFormData({ ...formData, inpatient_record: e.target.value })}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
//                   disabled={isOPMode}
//                 >
//                   <option value="">Select admission</option>
//                   {admissions.map((a) => (
//                     <option key={a.name} value={a.name}>{a.label || a.name}</option>
//                   ))}
//                 </select>
//               )}
//             </div>
//           </div>

//           {/* ═══════════ TEMPLATE ═══════════ */}
// <div className="grid grid-cols-2 gap-4">
//   <div>
//     <label className="block text-sm font-semibold text-slate-900 mb-2">
//       Template Type <span className="text-red-500">*</span>
//     </label>
//     <select
//       value={formData.template_dt}
//       onChange={(e) => {
//         setFormData({ ...formData, template_dt: e.target.value, template_dn: '' })
//         setSelectedTemplate(null)
//         setTemplateQuery('')
//       }}
//       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
//       disabled={isTemplateTypeLocked}
//     >
//       <option value="">Select type</option>
//       {templateTypes.map((t) => (
//         <option key={t.name} value={t.name}>{t.label || t.name}</option>
//       ))}
//     </select>
//     {isTemplateTypeLocked && (
//       <p className="text-xs text-slate-400 mt-1">Template type is pre-selected for this request</p>
//     )}
//   </div>

//   <div>
//     <div className="flex items-center justify-between mb-2">
//       <label className="block text-sm font-semibold text-slate-900">
//         Template <span className="text-red-500">*</span>
//       </label>
//       {formData.template_dt === 'Lab Test Template' && (
//         <label className="flex items-center gap-2 text-sm">
//           <input
//             type="checkbox"
//             checked={showOnlyGroupTemplates}
//             onChange={(e) => {
//               setShowOnlyGroupTemplates(e.target.checked)
//               setSelectedTemplate(null)
//               setFormData(prev => ({ ...prev, template_dn: '' }))
//               setTemplateQuery('')
//             }}
//             className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
//           />
//           <span className="text-slate-700">Group</span>
//         </label>
//       )}
//     </div>
//     <div className="relative">
//       <input
//         type="text"
//         value={templateOpen ? templateQuery : (selectedTemplate ? selectedTemplate.label : '')}
//         onChange={(e) => {
//           const value = e.target.value
//           setTemplateQuery(value)
//           if (!value) {
//             setSelectedTemplate(null)
//             setFormData(prev => ({ ...prev, template_dn: '' }))
//           }
//           setTemplateOpen(true)
//         }}
//         onFocus={() => setTemplateOpen(true)}
//         placeholder={formData.template_dt ? "Search template..." : "Select template type first"}
//         disabled={!formData.template_dt}
//         className={`w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${!formData.template_dt ? 'bg-slate-50 text-slate-500' : ''}`}
//       />
//       {templateLoading && (
//         <div className="absolute right-8 top-2.5 text-slate-400 text-xs">Loading...</div>
//       )}
//       <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
      
//       {templateOpen && formData.template_dt && (
//         <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//           {templates.length === 0 && !templateLoading && (
//             <div className="px-3 py-2 text-xs text-slate-500">
//               {showOnlyGroupTemplates ? 'No group templates found' : 'No templates found'}
//             </div>
//           )}
//           {templates.map((template) => (
//             <button
//               key={template.name}
//               type="button"
//               className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
//               onClick={() => handleTemplateSelect(template)}
//             >
//               <div className="flex flex-col">
//                 <div className="font-medium text-slate-900">
//                   {template.label || template.name}
//                 </div>
//                 {/* Display the template ID/name in a smaller, lighter text */}
//                 <div className="text-xs text-slate-500 mt-0.5">
//                   ID: {template.name}
//                 </div>
//                 {template.department && (
//                   <div className="text-xs text-slate-500">Dept: {template.department}</div>
//                 )}
//                 {(template as any).is_group && (
//                   <div className="text-xs text-amber-600 mt-0.5">Group Template</div>
//                 )}
//               </div>
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   </div>
// </div>

//           {/* ═══════════ GROUP TEMPLATE BREAKDOWN ═══════════ */}
//           {isGroupTemplate && groupTemplates.length > 0 && (
//             <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
//               <div className="flex items-center gap-2 mb-3">
//                 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 text-amber-800">Group Template</span>
//                 <label className="block text-sm font-semibold text-slate-900">
//                   Included Tests
//                 </label>
//               </div>
//               <div className="space-y-1 mb-3">
//                 {groupTemplates.map((gt, idx) => {
//                   const matchedPrice = patientCategory
//                     ? gt.pricing.find((p) => p.patient_category === patientCategory)?.price
//                     : gt.pricing[0]?.price
//                   return (
//                     <div key={idx} className="flex items-center justify-between py-1.5 px-2 bg-white rounded border border-amber-100 text-sm">
//                       <span className="font-medium text-slate-800">{gt.template_label}</span>
//                       <span className="text-slate-600 font-semibold">
//                         {matchedPrice != null ? matchedPrice.toFixed(2) : <span className="text-slate-400 italic">No price</span>}
//                       </span>
//                     </div>
//                   )
//                 })}
//               </div>
//               <div className="flex items-center justify-between pt-2 border-t border-amber-200">
//                 <span className="text-sm font-semibold text-slate-700">
//                   Total {patientCategory ? `(${patientCategory})` : ''}
//                 </span>
//                 <span className="text-base font-bold text-primary">
//                   {(selectedPrice ?? 0).toFixed(2)}
//                 </span>
//               </div>
//               {!patientCategory && (
//                 <p className="text-xs text-amber-700 mt-2">⚠ Patient has no category — prices may not be accurate.</p>
//               )}
//             </div>
//           )}

//           {/* ═══════════ PRICING TABLE ═══════════ */}
//           {pricing.length > 0 && (
//             <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
//               <label className="block text-sm font-semibold text-slate-900 mb-3">
//                 Select Price by Patient Category <span className="text-red-500">*</span>
//               </label>
//               <div className="space-y-2">
//                 {pricing.map((row, idx) => (
//                   <label key={idx} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition ${row.patient_category === patientCategory ? 'bg-green-50 border border-green-200' : 'hover:bg-white'}`}>
//                     <input
//                       type="radio"
//                       name="pricing"
//                       checked={selectedPrice === row.price}
//                       onChange={() => setSelectedPrice(row.price || null)}
//                       className="w-4 h-4 text-primary focus:ring-primary border-slate-300"
//                     />
//                     <div className="flex-1">
//                       <span className="text-sm font-medium text-slate-900">
//                         {row.patient_category}
//                       </span>
//                       {row.patient_category === patientCategory && (
//                         <span className="ml-2 text-xs text-green-600 font-medium">(Patient's category)</span>
//                       )}
//                     </div>
//                     <div className="text-sm font-semibold text-slate-900">
//                       {row.price?.toFixed(2) || 'N/A'}
//                     </div>
//                   </label>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* ═══════════ DISCOUNT ═══════════ */}
//           {selectedPrice !== null && (
//             <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
//               <label className="block text-sm font-semibold text-slate-900 mb-1">
//                 Discount & Total
//               </label>
//               <p className="text-xs text-slate-500 mb-4">Base price: <strong>{(selectedPrice || 0).toFixed(2)}</strong></p>

//               <div className="grid grid-cols-3 gap-4 mb-4">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-700 mb-2">
//                     Discount Margin
//                   </label>
//                   <select
//                     value={discountType}
//                     onChange={(e) => { setDiscountType(e.target.value as 'percentage' | 'amount'); setDiscountValue(0) }}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
//                   >
//                     <option value="percentage">Percentage (%)</option>
//                     <option value="amount">Fixed Amount</option>
//                   </select>
//                 </div>

//                 <div>
//                   <label className="block text-xs font-medium text-slate-700 mb-2">
//                     {discountType === 'amount' ? 'Discount Amount' : 'Discount (%)'}
//                   </label>
//                   <input
//                     type="number"
//                     min="0"
//                     step="any"
//                     value={discountValue}
//                     onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
//                     placeholder="0"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
//                   />
//                 </div>

//                 <div>
//                   <label className="block text-xs font-medium text-slate-700 mb-2">
//                     Calculated Discount
//                   </label>
//                   <input
//                     type="text"
//                     readOnly
//                     value={discountAmount.toFixed(2)}
//                     className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
//                   />
//                 </div>
//               </div>

//               <div className="bg-white rounded-md border border-slate-200 p-3 flex items-center justify-between">
//                 <span className="text-sm font-semibold text-slate-900">Grand Total</span>
//                 <span className="text-lg font-bold text-primary">{grandTotal.toFixed(2)}</span>
//               </div>
//             </div>
//           )}

//           {/* ═══════════ COST CENTER ═══════════ */}
//           <div>
//             <label className="block text-sm font-semibold text-slate-900 mb-2">
//               Cost Center <span className="text-red-500">*</span>
//             </label>
//             <div className="relative">
//               <input
//                 type="text"
//                 value={
//                   costCenterOpen
//                     ? costCenterSearch
//                     : formData.cost_center
//                       ? costCenters.find((c) => c.name === formData.cost_center)?.label ?? formData.cost_center
//                       : ''
//                 }
//                 onChange={(e) => {
//                   setCostCenterSearch(e.target.value)
//                   if (!costCenterOpen) setCostCenterOpen(true)
//                 }}
//                 onFocus={() => setCostCenterOpen(true)}
//                 placeholder="Search cost center..."
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
//               />

//               {costCenterOpen && (
//                 <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                   {costCenters.length === 0 ? (
//                     <div className="px-3 py-2 text-xs text-slate-500">No cost centers found</div>
//                   ) : (
//                     costCenters.map((c) => (
//                       <button
//                         key={c.name}
//                         type="button"
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
//                         onClick={() => {
//                           setFormData((prev) => ({ ...prev, cost_center: c.name }))
//                           setCostCenterSearch('')
//                           setCostCenterOpen(false)
//                         }}
//                       >
//                         <div className="font-medium text-slate-800">{c.label || c.name}</div>
//                         {c.label && c.label !== c.name && (
//                           <div className="text-xs text-slate-500">{c.name}</div>
//                         )}
//                       </button>
//                     ))
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* ═══════════ ORDER DATE & TIME ═══════════ */}
//           <div className="grid grid-cols-2 gap-4">
//             <div>
//               <label className="block text-sm font-semibold text-slate-900 mb-2">
//                 Order Date <span className="text-red-500">*</span>
//               </label>
//               <input
//                 type="date"
//                 value={formData.order_date}
//                 onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-semibold text-slate-900 mb-2">
//                 Order Time <span className="text-red-500">*</span>
//               </label>
//               <input
//                 type="time"
//                 value={formData.order_time}
//                 onChange={(e) => setFormData({ ...formData, order_time: e.target.value })}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
//               />
//             </div>
//           </div>

//           {/* ═══════════ ACTIONS ═══════════ */}
//           <div className="flex justify-end gap-3 pt-5 border-t border-slate-200">
//             <button
//               type="button"
//               onClick={onClose}
//               className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
//             >
//               Cancel
//             </button>

//             <button
//               type="submit"
//               disabled={submitting || (!isIPMode && !isOPMode) || (isIPMode && !formData.inpatient_record) || (isOPMode && !formData.patient_visit)}
//               className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
//             >
//               {submitting ? 'Creating…' : 'Create Service Request'}
//             </button>
//           </div>

//         </form>
//       </div>
//     </div>
//   )
// }

import { useState, useEffect } from 'react'
import {
  searchPatients,
  fetchPatients,
  type PatientListItem
} from '../../services/patients'

import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  fetchServiceRequestTemplateTypes,
  fetchServiceRequestTemplates,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchCostCenters,
  type LinkFieldOption,
} from '../../services/common'

import {
  createServiceRequest,
  type CreateServiceRequestData
} from '../../services/serviceRequests'

import { toast } from '../../hooks/useToast'
import { X, ChevronDown } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateServiceRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  initialPatient?: string
  /** Pre-fill with either a template type or a specific template name/docname */
  initialTemplate?: string
  /** Default template type for nursing context */
  defaultTemplateType?: string
}

interface PricingRow {
  patient_category: string
  price: number | null
  multiplier?: number | null
}

interface GroupTemplateItem {
  template_dn: string
  template_label: string
  pricing: PricingRow[]
  selected?: boolean
}

export const CreateServiceRequestModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialTemplate,
  defaultTemplateType,
}: CreateServiceRequestModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'

  /* ────────────── PATIENT ────────────── */
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patientCategory, setPatientCategory] = useState('')
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loadingPatients, setLoadingPatients] = useState(false)

  /* ────────────── LOOKUPS ────────────── */
  const [templateTypes, setTemplateTypes] = useState<LinkFieldOption[]>([])
  const [templates, setTemplates] = useState<LinkFieldOption[]>([])
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [patientVisits, setPatientVisits] = useState<LinkFieldOption[]>([])
  const [admissions, setAdmissions] = useState<LinkFieldOption[]>([])
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])

  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterSearch, setCostCenterSearch] = useState('')

  // Template search state
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<LinkFieldOption | null>(null)
  const [showOnlyGroupTemplates, setShowOnlyGroupTemplates] = useState(false)

  /* ────────────── PRICING & DISCOUNT ────────────── */
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null)
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountAmount, setDiscountAmount] = useState<number>(0)
  const [grandTotal, setGrandTotal] = useState<number>(0)

  /* ────────────── GROUP TEMPLATE ────────────── */
  const [isGroupTemplate, setIsGroupTemplate] = useState(false)
  const [groupTemplates, setGroupTemplates] = useState<GroupTemplateItem[]>([])
  const [selectAllGroups, setSelectAllGroups] = useState(true)

  /* ────────────── FORM ────────────── */
  const [formData, setFormData] = useState({
    template_dt: defaultTemplateType || '',
    template_dn: '',
    practitioner: '',
    patient_visit: (isOPMode && activeVisit) ? activeVisit : '',
    inpatient_record: (isIPMode && activeAdmission) ? activeAdmission : '',
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().slice(0, 5),
    department: '',
    cost_center: ''
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get effective patient
  const effectivePatient = selectedPatient?.name || initialPatient || contextPatient || ''

  // Auto-load patient label if context exists
  useEffect(() => {
    const patientToLoad = initialPatient || contextPatient
    if (patientToLoad && !selectedPatient) {
      fetchPatients(1, 0, patientToLoad).then((res) => {
        if (res.length > 0) {
          setSelectedPatient(res[0])
          setPatientQuery(res[0].patient_name || res[0].name)
          setPatientCategory((res[0] as any).category || '')
        }
      }).catch(() => {})
    }
  }, [initialPatient, contextPatient, selectedPatient])

  // Auto-load visit/admission label if context exists
  useEffect(() => {
    if (isIPMode && activeAdmission && effectivePatient) {
      const loadAdmissionLabel = async () => {
        try {
          const admissionsList = await fetchInpatientAdmissions(effectivePatient, activeAdmission)
          const matched = admissionsList.find(a => a.name === activeAdmission)
          if (matched && !selectedPatient) {
            // Admission label loaded
          }
        } catch (err) {
          console.error('Failed to load admission label:', err)
        }
      }
      loadAdmissionLabel()
    } else if (isOPMode && activeVisit && effectivePatient) {
      const loadVisitLabel = async () => {
        try {
          const visits = await fetchPatientVisits(effectivePatient, activeVisit)
          const matched = visits.find(v => v.name === activeVisit)
          if (matched && !selectedPatient) {
            // Visit label loaded
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isIPMode, isOPMode, activeAdmission, activeVisit, effectivePatient, selectedPatient])

  /* ────────────── INITIAL LOAD ────────────── */
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const types = await fetchServiceRequestTemplateTypes()
        setTemplateTypes(types)

        const practitionersList = await fetchHealthcarePractitioners()
        setPractitioners(practitionersList)

        const initialTemplateIsType = !!initialTemplate && types.some(
          (t) => t.name === initialTemplate || t.label === initialTemplate
        )

        const templateType = initialTemplateIsType
          ? initialTemplate
          : defaultTemplateType || (initialTemplate ? 'Lab Test Template' : '')

        const templateDn = !initialTemplateIsType && initialTemplate ? initialTemplate : ''

        if (templateType) {
          setFormData((prev) => ({ ...prev, template_dt: templateType }))
          
          if (templateDn) {
            const templateList = await fetchServiceRequestTemplates(templateType)
            const matchedTemplate = templateList.find(t => t.name === templateDn || t.label === templateDn)
            if (matchedTemplate) {
              setSelectedTemplate(matchedTemplate)
              setFormData((prev) => ({ ...prev, template_dn: matchedTemplate.name }))
              setTemplateQuery(matchedTemplate.label)
            }
          }
          
          const templateList = await fetchServiceRequestTemplates(templateType)
          setTemplates(templateList)
        }
      } catch (err) {
        console.error('Failed to load service request initial data:', err)
      }
    }

    loadInitialData()
  }, [initialTemplate, defaultTemplateType])

  /* ────────────── AUTO-POPULATE PRACTITIONER ────────────── */
  useEffect(() => {
    const autoPopulatePractitioner = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (practitioner) {
          setFormData(prev => ({ ...prev, practitioner }))
          // Also set the query for display
          const practitionerOption = practitioners.find(p => p.name === practitioner)
          if (practitionerOption) {
            setPractQuery(practitionerOption.label)
          }
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    }
    autoPopulatePractitioner()
  }, [practitioners])

  /* ────────────── TEMPLATE TYPE CHANGE ────────────── */
  useEffect(() => {
    // Skip if we already have templates loaded from initialTemplate
    if (initialTemplate && templates.length > 0) return
    
    if (!formData.template_dt) {
      setTemplates([])
      setSelectedTemplate(null)
      return
    }

    const loadTemplates = async () => {
      setTemplateLoading(true)
      try {
        const templateList = await fetchServiceRequestTemplates(formData.template_dt)
        setTemplates(templateList)
      } catch (err) {
        console.error('Failed to load templates:', err)
        setTemplates([])
      } finally {
        setTemplateLoading(false)
      }
    }
    
    loadTemplates()
  }, [formData.template_dt])

  // Search templates with debounce and group filter
  useEffect(() => {
    if (!templateOpen) {
      setTemplateLoading(false)
      return
    }

    const search = async () => {
      if (!formData.template_dt) return
      
      setTemplateLoading(true)
      try {
        let results = await fetchServiceRequestTemplates(
          formData.template_dt,
          templateQuery.trim() === '' ? undefined : templateQuery
        )
        console.log('Fetched templates:', results)
        // Apply group filter if template type is "Lab Test Template"
        if (formData.template_dt === 'Lab Test Template') {
          results = results.filter(template => {
            // Check if the template has an is_group property
            // You may need to adjust this based on your actual data structure
            const isGroup = (template as any).is_group === 1 || (template as any).is_group === true
            return showOnlyGroupTemplates ? isGroup : !isGroup
          })
        }
        
        setTemplates(results)
      } catch (err) {
        console.error('Failed to search templates:', err)
        setTemplates([])
      } finally {
        setTemplateLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, templateQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [templateQuery, templateOpen, formData.template_dt, showOnlyGroupTemplates])

  /* ────────────── LOAD TEMPLATE SERVICE PRICING ────────────── */
  useEffect(() => {
    if (!formData.template_dt || !formData.template_dn) {
      setPricing([])
      setSelectedPrice(null)
      setIsGroupTemplate(false)
      setGroupTemplates([])
      setSelectAllGroups(true)
      return
    }

    const load = async () => {
      try {
        const res = await fetch(
          `/api/method/healthcare.api.service_request.get_service_request_template_pricing?template_dt=${encodeURIComponent(formData.template_dt)}&template_dn=${encodeURIComponent(formData.template_dn)}`
        )
        const resData = await res.json()
        const info = resData?.message
        console.log("template group pricing response:", info)
        if (!info) {
          setPricing([])
          setSelectedPrice(null)
          setIsGroupTemplate(false)
          setGroupTemplates([])
          setSelectAllGroups(true)
          return
        }

        if (info.is_group) {
          setIsGroupTemplate(true)
          // Initialize group templates with selected: true for all
          const groupTemplatesWithSelection = (info.group_templates || []).map((gt: GroupTemplateItem) => ({
            ...gt,
            selected: true
          }))
          setGroupTemplates(groupTemplatesWithSelection)
          setSelectAllGroups(true)
          setPricing([])
          
          // Calculate total price for selected group templates based on patient category
          calculateGroupTotal(groupTemplatesWithSelection, patientCategory)
        } else {
          setIsGroupTemplate(false)
          setGroupTemplates([])
          setSelectAllGroups(true)
          const pricingRows: PricingRow[] = info.pricing || []
          setPricing(pricingRows)
          if (pricingRows.length > 0 && patientCategory) {
            const match = pricingRows.find((p) => p.patient_category === patientCategory)
            setSelectedPrice(match?.price ?? null)
          } else {
            setSelectedPrice(null)
          }
        }
      } catch (err) {
        console.error('Error loading template pricing:', err)
        setPricing([])
        setSelectedPrice(null)
        setIsGroupTemplate(false)
        setGroupTemplates([])
        setSelectAllGroups(true)
      }
    }

    load()
  }, [formData.template_dt, formData.template_dn, patientCategory])

  // Calculate total for group templates
  const calculateGroupTotal = (groups: GroupTemplateItem[], category: string) => {
    const total = groups.reduce((sum, gt) => {
      if (!gt.selected) return sum
      const match = category
        ? gt.pricing.find((p) => p.patient_category === category)
        : gt.pricing[0]
      return sum + (match?.price ?? 0)
    }, 0)
    setSelectedPrice(total > 0 ? total : null)
    return total
  }

  // Handle group template selection toggle
  const toggleGroupSelection = (index: number) => {
    const updatedGroups = [...groupTemplates]
    updatedGroups[index].selected = !updatedGroups[index].selected
    setGroupTemplates(updatedGroups)
    
    // Update select all status
    const allSelected = updatedGroups.every(g => g.selected)
    setSelectAllGroups(allSelected)
    
    // Recalculate total
    calculateGroupTotal(updatedGroups, patientCategory)
  }

  // Handle select/deselect all
  const toggleSelectAll = () => {
    const newSelectAll = !selectAllGroups
    setSelectAllGroups(newSelectAll)
    const updatedGroups = groupTemplates.map(gt => ({
      ...gt,
      selected: newSelectAll
    }))
    setGroupTemplates(updatedGroups)
    calculateGroupTotal(updatedGroups, patientCategory)
  }

  /* ────────────── RECALCULATE GRAND TOTAL ────────────── */
  useEffect(() => {
    let total = selectedPrice || 0

    if (discountType === 'percentage' && discountValue > 0) {
      const discount = (total * discountValue) / 100
      setDiscountAmount(discount)
      total -= discount
    } else if (discountType === 'amount' && discountValue > 0) {
      setDiscountAmount(discountValue)
      total -= discountValue
    } else {
      setDiscountAmount(0)
    }

    setGrandTotal(Math.max(0, total))
  }, [selectedPrice, discountType, discountValue])

  /* ────────────── LOAD VISITS + ADMISSIONS ────────────── */
  useEffect(() => {
    if (!selectedPatient) return

    fetchPatientVisits(selectedPatient.name)
      .then(setPatientVisits)
      .catch(() => setPatientVisits([]))

    fetchInpatientAdmissions(selectedPatient.name)
      .then(setAdmissions)
      .catch(() => setAdmissions([]))
  }, [selectedPatient])

  /* ────────────── PATIENT SEARCH ────────────── */
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoadingPatients(true)
      try {
        const results =
          patientQuery.trim() === ''
            ? await fetchPatients(20, 0)
            : await searchPatients(patientQuery, 20)

        setPatients(results)
      } finally {
        setLoadingPatients(false)
      }
    }

    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  /* ────────────── PRACTITIONER SEARCH ────────────── */
  useEffect(() => {
    if (!practOpen) return

    const t = setTimeout(async () => {
      const res = await fetchHealthcarePractitioners(practQuery || undefined)
      setPractitioners(res)
    }, 300)

    return () => clearTimeout(t)
  }, [practQuery, practOpen])

  /* ────────────── COST CENTER LOOKUP ────────────── */
  useEffect(() => {
    if (!costCenterOpen) return

    const t = setTimeout(() => {
      fetchCostCenters(undefined, costCenterSearch || undefined)
        .then(setCostCenters)
        .catch(() => setCostCenters([]))
    }, costCenterSearch.trim() === '' ? 0 : 300)

    return () => clearTimeout(t)
  }, [costCenterOpen, costCenterSearch])

  // Reset group filter when template type changes
  useEffect(() => {
    setShowOnlyGroupTemplates(false)
  }, [formData.template_dt])

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating service request for IP admission: ${formData.inpatient_record || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating service request for OP visit: ${formData.patient_visit || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  /* ────────────── SUBMIT ────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }

    if (!formData.template_dt || !formData.template_dn) {
      setError('Please select template')
      return
    }

    if (!formData.cost_center) {
      setError('Please select Cost Center')
      return
    }

    // Validate based on mode
    if (isIPMode && !formData.inpatient_record) {
      setError('Please select an inpatient admission (IP mode active)')
      return
    }
    if (isOPMode && !formData.patient_visit) {
      setError('Please select a patient visit (OP mode active)')
      return
    }
    if (!isIPMode && !isOPMode && !formData.patient_visit && !formData.inpatient_record) {
      setError('Please select either Patient Visit or Inpatient Admission')
      return
    }

    if (selectedPrice === null && !isGroupTemplate) {
      setError('Please select a price from pricing table')
      return
    }

    // For group templates, check if at least one test is selected
    if (isGroupTemplate && groupTemplates.filter(gt => gt.selected).length === 0) {
      setError('Please select at least one test from the group template')
      return
    }

    try {
      setSubmitting(true)

      const payload: CreateServiceRequestData = {
        patient: selectedPatient.name,
        template_dt: formData.template_dt,
        template_dn: formData.template_dn,
        practitioner: formData.practitioner || undefined,
        patient_visit: formData.patient_visit || undefined,
        inpatient_record: formData.inpatient_record || undefined,
        order_date: formData.order_date,
        order_time: formData.order_time,
        department: formData.department || undefined,
        cost_center: formData.cost_center || undefined,
        cost: selectedPrice,
        discount_value: discountType === 'percentage' ? 'Percentage' : 'Fixed Amount',
        discount: discountType === 'percentage' ? discountValue : 0,
        discount_amount: discountAmount,
        grand_total: grandTotal,
        // Add selected group templates to the payload
        selected_group_templates: isGroupTemplate ? groupTemplates.filter(gt => gt.selected).map(gt => gt.template_dn) : undefined
      }

      await createServiceRequest(payload)

      toast.success('Service request created')
      onSuccess()
      onClose()

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create service request'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Check if template type is locked (when initialTemplate or default template type is provided)
  const isTemplateTypeLocked = !!initialTemplate || !!defaultTemplateType

  const handleTemplateSelect = (template: LinkFieldOption) => {
    setSelectedTemplate(template)
    setFormData(prev => ({ ...prev, template_dn: template.name }))
    setTemplateQuery(template.label)
    setTemplateOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {formData.template_dt === 'Lab Test Template' ? 'Create Lab Request' : 'Create Service Request'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {getModeHelpText()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Mode indicator box */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-semibold text-primary mb-1">
              {isIPMode ? '🏥 Creating Service Request for Inpatient' : isOPMode ? '👤 Creating Service Request for Outpatient' : '📋 Select Context'}
            </p>
            <p className="text-xs text-slate-600">
              {isIPMode 
                ? `The service request will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                : isOPMode
                ? `The service request will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                : 'Please select either IP or OP mode from the top navbar before creating a service request.'
              }
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* ═══════════ PATIENT ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Patient <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={
                  selectedPatient
                    ? selectedPatient.patient_name || selectedPatient.name
                    : patientQuery
                }
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setSelectedPatient(null)
                  setPatientCategory('')
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                disabled={Boolean(contextPatient)}
                className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${contextPatient ? 'bg-slate-100 cursor-not-allowed' : ''}`}
              />
              {contextPatient && (
                <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
              )}

              {patientOpen && !contextPatient && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loadingPatients ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
                  ) : patients.length ? (
                    patients.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setSelectedPatient(p)
                          setPatientQuery(p.patient_name || p.name)
                          setPatientCategory((p as any).category || '')
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium text-slate-900">{p.patient_name || p.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {(p as any).file_number && <span>File: {(p as any).file_number}</span>}
                          {(p as any).id_number && <span>ID: {(p as any).id_number}</span>}
                          {(p as any).category && <span>Category: {(p as any).category}</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No patients found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ PRACTITIONER ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Practitioner
            </label>

            <div className="relative">
              <input
                type="text"
                value={practOpen ? practQuery : (formData.practitioner ? practitioners.find(p => p.name === formData.practitioner)?.label || formData.practitioner : '')}
                onChange={(e) => {
                  const value = e.target.value
                  setPractQuery(value)
                  if (!value) {
                    setFormData(prev => ({ ...prev, practitioner: '' }))
                  }
                  setPractOpen(true)
                }}
                onFocus={() => setPractOpen(true)}
                placeholder="Search practitioner..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              {practOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {practitioners.length ? (
                    practitioners.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setFormData({ ...formData, practitioner: p.name })
                          setPractQuery(p.label)
                          setPractOpen(false)
                        }}
                      >
                        {p.label || p.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ VISIT + ADMISSION (Mode-aware) ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            {/* Patient Visit - only editable in OP mode or no mode */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Patient Visit {isOPMode && <span className="text-red-500">*</span>}
              </label>
              {activeVisit ? (
                <div>
                  <input
                    type="text"
                    value={formData.patient_visit}
                    readOnly
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                </div>
              ) : (
                <select
                  value={formData.patient_visit}
                  onChange={(e) => setFormData({ ...formData, patient_visit: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                  disabled={isIPMode}
                >
                  <option value="">Select visit</option>
                  {patientVisits.map((v) => (
                    <option key={v.name} value={v.name}>{v.label || v.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Inpatient Admission - only editable in IP mode or no mode */}
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Inpatient Admission {isIPMode && <span className="text-red-500">*</span>}
              </label>
              {activeAdmission ? (
                <div>
                  <input
                    type="text"
                    value={formData.inpatient_record}
                    readOnly
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                </div>
              ) : (
                <select
                  value={formData.inpatient_record}
                  onChange={(e) => setFormData({ ...formData, inpatient_record: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                  disabled={isOPMode}
                >
                  <option value="">Select admission</option>
                  {admissions.map((a) => (
                    <option key={a.name} value={a.name}>{a.label || a.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ═══════════ TEMPLATE ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Template Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.template_dt}
                onChange={(e) => {
                  setFormData({ ...formData, template_dt: e.target.value, template_dn: '' })
                  setSelectedTemplate(null)
                  setTemplateQuery('')
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                disabled={isTemplateTypeLocked}
              >
                <option value="">Select type</option>
                {templateTypes.map((t) => (
                  <option key={t.name} value={t.name}>{t.label || t.name}</option>
                ))}
              </select>
              {isTemplateTypeLocked && (
                <p className="text-xs text-slate-400 mt-1">Template type is pre-selected for this request</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-slate-900">
                  Template <span className="text-red-500">*</span>
                </label>
                {formData.template_dt === 'Lab Test Template' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showOnlyGroupTemplates}
                      onChange={(e) => {
                        setShowOnlyGroupTemplates(e.target.checked)
                        setSelectedTemplate(null)
                        setFormData(prev => ({ ...prev, template_dn: '' }))
                        setTemplateQuery('')
                      }}
                      className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                    />
                    <span className="text-slate-700">Group</span>
                  </label>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={templateOpen ? templateQuery : (selectedTemplate ? selectedTemplate.label : '')}
                  onChange={(e) => {
                    const value = e.target.value
                    setTemplateQuery(value)
                    if (!value) {
                      setSelectedTemplate(null)
                      setFormData(prev => ({ ...prev, template_dn: '' }))
                    }
                    setTemplateOpen(true)
                  }}
                  onFocus={() => setTemplateOpen(true)}
                  placeholder={formData.template_dt ? "Search template..." : "Select template type first"}
                  disabled={!formData.template_dt}
                  className={`w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${!formData.template_dt ? 'bg-slate-50 text-slate-500' : ''}`}
                />
                {templateLoading && (
                  <div className="absolute right-8 top-2.5 text-slate-400 text-xs">Loading...</div>
                )}
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                
                {templateOpen && formData.template_dt && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {templates.length === 0 && !templateLoading && (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        {showOnlyGroupTemplates ? 'No group templates found' : 'No templates found'}
                      </div>
                    )}
                    {templates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <div className="flex flex-col">
                          <div className="font-medium text-slate-900">
                            {template.label || template.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            ID: {template.name}
                          </div>
                          {template.department && (
                            <div className="text-xs text-slate-500">Dept: {template.department}</div>
                          )}
                          {(template as any).is_group && (
                            <div className="text-xs text-amber-600 mt-0.5">Group Template</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════ GROUP TEMPLATE BREAKDOWN WITH SELECTION ═══════════ */}
          {isGroupTemplate && groupTemplates.length > 0 && (
            <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 text-amber-800">Group Template</span>
                  <label className="block text-sm font-semibold text-slate-900">
                    Select Tests to Include
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectAllGroups}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                  />
                  <span className="text-slate-700 font-medium">Select All</span>
                </label>
              </div>
              
              <div className="space-y-2 mb-4">
                {groupTemplates.map((gt, idx) => {
                  const matched = patientCategory
                    ? gt.pricing.find((p) => p.patient_category === patientCategory)
                    : gt.pricing[0]
                  const matchedPrice = matched?.price
                  return (
                    <label 
                      key={idx} 
                      className={`flex items-center gap-3 py-2 px-3 rounded cursor-pointer transition ${
                        gt.selected ? 'bg-white border border-amber-200' : 'bg-white/60 border border-transparent hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={gt.selected}
                        onChange={() => toggleGroupSelection(idx)}
                        className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${gt.selected ? 'text-slate-800' : 'text-slate-600'}`}>
                            {gt.template_label}
                          </span>
                          <span className={`text-sm font-semibold ${gt.selected ? 'text-primary' : 'text-slate-400'}`}>
                            {matchedPrice != null ? matchedPrice.toFixed(2) : <span className="italic">No price</span>}
                          </span>
                        </div>
                        {matched?.multiplier != null && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {matched.patient_category} × {matched.multiplier}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-0.5">
                          ID: {gt.template_dn}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              
              <div className="flex items-center justify-between pt-3 border-t border-amber-200">
                <span className="text-sm font-semibold text-slate-700">
                  Total {patientCategory ? `(${patientCategory})` : ''}
                  <span className="text-xs text-slate-500 ml-2 font-normal">
                    ({groupTemplates.filter(g => g.selected).length} selected)
                  </span>
                </span>
                <span className="text-base font-bold text-primary">
                  {(selectedPrice ?? 0).toFixed(2)}
                </span>
              </div>
              {!patientCategory && (
                <p className="text-xs text-amber-700 mt-2">⚠ Patient has no category — prices may not be accurate.</p>
              )}
              {groupTemplates.filter(g => g.selected).length === 0 && (
                <p className="text-xs text-red-600 mt-2">⚠ Please select at least one test to continue.</p>
              )}
            </div>
          )}

          {/* ═══════════ PRICING TABLE ═══════════ */}
          {pricing.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <label className="block text-sm font-semibold text-slate-900 mb-3">
                Select Price by Patient Category <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {pricing.map((row, idx) => (
                  <label key={idx} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition ${row.patient_category === patientCategory ? 'bg-green-50 border border-green-200' : 'hover:bg-white'}`}>
                    <input
                      type="radio"
                      name="pricing"
                      checked={selectedPrice === row.price}
                      onChange={() => setSelectedPrice(row.price || null)}
                      className="w-4 h-4 text-primary focus:ring-primary border-slate-300"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900">
                        {row.patient_category}
                      </span>
                      {row.patient_category === patientCategory && (
                        <span className="ml-2 text-xs text-green-600 font-medium">(Patient's category)</span>
                      )}
                      {row.multiplier != null && (
                        <span className="ml-2 text-xs text-slate-500">× {row.multiplier}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {row.price?.toFixed(2) || 'N/A'}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════ DISCOUNT ═══════════ */}
          {selectedPrice !== null && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <label className="block text-sm font-semibold text-slate-900 mb-1">
                Discount & Total
              </label>
              <p className="text-xs text-slate-500 mb-4">Base price: <strong>{(selectedPrice || 0).toFixed(2)}</strong></p>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Discount Margin
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => { setDiscountType(e.target.value as 'percentage' | 'amount'); setDiscountValue(0) }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="amount">Fixed Amount</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    {discountType === 'amount' ? 'Discount Amount' : 'Discount (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Calculated Discount
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={discountAmount.toFixed(2)}
                    className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  />
                </div>
              </div>

              <div className="bg-white rounded-md border border-slate-200 p-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Grand Total</span>
                <span className="text-lg font-bold text-primary">{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ═══════════ COST CENTER ═══════════ */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Cost Center <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={
                  costCenterOpen
                    ? costCenterSearch
                    : formData.cost_center
                      ? costCenters.find((c) => c.name === formData.cost_center)?.label ?? formData.cost_center
                      : ''
                }
                onChange={(e) => {
                  setCostCenterSearch(e.target.value)
                  if (!costCenterOpen) setCostCenterOpen(true)
                }}
                onFocus={() => setCostCenterOpen(true)}
                placeholder="Search cost center..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />

              {costCenterOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {costCenters.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No cost centers found</div>
                  ) : (
                    costCenters.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, cost_center: c.name }))
                          setCostCenterSearch('')
                          setCostCenterOpen(false)
                        }}
                      >
                        <div className="font-medium text-slate-800">{c.label || c.name}</div>
                        {c.label && c.label !== c.name && (
                          <div className="text-xs text-slate-500">{c.name}</div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════ ORDER DATE & TIME ═══════════ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Order Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Order Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.order_time}
                onChange={(e) => setFormData({ ...formData, order_time: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* ═══════════ ACTIONS ═══════════ */}
          <div className="flex justify-end gap-3 pt-5 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || (!isIPMode && !isOPMode) || (isIPMode && !formData.inpatient_record) || (isOPMode && !formData.patient_visit) || (isGroupTemplate && groupTemplates.filter(gt => gt.selected).length === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Creating…' : 'Create Service Request'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}