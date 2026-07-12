import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_TABBED_BODY,
  CREATE_MODAL_TABBED_SHELL,
  CreateModalFooter,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createMentalState } from '../../services/mentalState'
import { fetchInpatientAdmissions, fetchBranches, syncCostCenterFromCareEpisode, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateMentalStateModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

type Tab = 'details' | 'behaviour' | 'orientation' | 'sleep'

const CF = ({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: 0 | 1) => void
}) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <div
      onClick={() => onChange(checked ? 0 : 1)}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${
        checked ? 'bg-primary border-primary' : 'bg-white border-slate-300 hover:border-primary/60'
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
    <span className="text-sm text-slate-700">{label}</span>
  </label>
)

const Sub = ({ label }: { label: string }) => (
  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-2">{label}</h4>
)

export const CreateMentalStateModal = ({ onClose, onSuccess, patient }: CreateMentalStateModalProps) => {
  const { mode, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  const isIPMode = mode === 'IP'

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Header fields
  const [patientId, setPatientId] = useState(patient || contextPatient || '')
  const [patientName, setPatientName] = useState('')
  const [admissionNo, setAdmissionNo] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    return ''
  })
  const [branch, setBranch] = useState('')
  const [transShift, setTransShift] = useState('')
  const [normalAt, setNormalAt] = useState('')

  // Behaviour checks
  const [cooperative, setCooperative] = useState<0|1>(0)
  const [aggressive, setAggressive] = useState<0|1>(0)
  const [paranoid, setParanoid] = useState<0|1>(0)
  const [demanding, setDemanding] = useState<0|1>(0)
  const [preoccupied, setPreoccupied] = useState<0|1>(0)
  const [defence, setDefence] = useState<0|1>(0)
  const [impulsive, setImpulsive] = useState<0|1>(0)
  const [sedative, setSedative] = useState<0|1>(0)
  const [dellusion, setDellusion] = useState<0|1>(0)
  // Speech checks
  const [normalS, setNormalS] = useState<0|1>(0)
  const [rapid, setRapid] = useState<0|1>(0)
  const [slow, setSlow] = useState<0|1>(0)
  const [poorSp, setPoorSp] = useState<0|1>(0)
  const [slurred, setSlurred] = useState<0|1>(0)
  const [coherent, setCoherent] = useState<0|1>(0)
  const [incoherent, setIncoherent] = useState<0|1>(0)
  const [talkative, setTalkative] = useState<0|1>(0)
  // Mood / Affect
  const [anxious, setAnxious] = useState<0|1>(0)
  const [angry, setAngry] = useState<0|1>(0)
  const [depressed, setDepressed] = useState<0|1>(0)
  const [elated, setElated] = useState<0|1>(0)
  const [euthymic, setEuthymic] = useState<0|1>(0)
  const [irritable, setIrritable] = useState<0|1>(0)
  // Motor
  const [twitches, setTwitches] = useState<0|1>(0)
  const [hyperactive, setHyperactive] = useState<0|1>(0)
  const [stereotypes, setStereotypes] = useState<0|1>(0)
  const [restless, setRestless] = useState<0|1>(0)
  const [gait, setGait] = useState<0|1>(0)
  const [tics, setTics] = useState<0|1>(0)
  const [agitated, setAgitated] = useState<0|1>(0)
  const [abnormal, setAbnormal] = useState<0|1>(0)
  const [hallucinatoryBehaviour, setHallucinatoryBehaviour] = useState<0|1>(0)
  const [normalMotor, setNormalMotor] = useState<0|1>(0)

  // Orientation & Appetite
  const [place, setPlace] = useState<0|1>(0)
  const [time, setTime] = useState<0|1>(0)
  const [person, setPerson] = useState<0|1>(0)
  const [normalAp, setNormalAp] = useState<0|1>(0)
  const [increased, setIncreased] = useState<0|1>(0)
  const [poorAp, setPoorAp] = useState<0|1>(0)
  const [reported, setReported] = useState<0|1>(0)
  const [reportedType, setReportedType] = useState('')

  // Sleep & Consciousness
  const [sleepDuration, setSleepDuration] = useState('')
  const [normalSleep, setNormalSleep] = useState<0|1>(0)
  const [disturbed, setDisturbed] = useState<0|1>(0)
  const [intermittent, setIntermittent] = useState<0|1>(0)
  const [excessive, setExcessive] = useState<0|1>(0)
  const [aLittle, setALittle] = useState<0|1>(0)
  const [conscious, setConscious] = useState<0|1>(0)
  const [alert, setAlert] = useState<0|1>(0)
  const [disturbedCon, setDisturbedCon] = useState<0|1>(0)

  // Psychotic Symptoms
  const [delusion, setDelusion] = useState<0|1>(0)
  const [perception, setPerception] = useState<0|1>(0)
  const [remark, setRemark] = useState('')

  const showDelusionRemark = !!dellusion || !!delusion

  // Patient dropdown
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientLoading, setPatientLoading] = useState(false)

  // Admission dropdown
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [selectedAdmission, setSelectedAdmission] = useState<LinkFieldOption | null>(null)

  // Branch dropdown
  const [branchOptions, setBranchOptions] = useState<LinkFieldOption[]>([])
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')
  const [selectedBranch, setSelectedBranch] = useState<LinkFieldOption | null>(null)

  useEffect(() => {
    const patientToLoad = patient || contextPatient
    if (patientToLoad) {
      setPatientId(patientToLoad)
      fetchPatients(1, 0, patientToLoad)
        .then((res) => {
          if (res.length > 0) {
            setPatientQuery(res[0].patient_name)
            setPatientName(res[0].patient_name)
          }
        })
        .catch(() => {})
    }
  }, [patient, contextPatient])

  useEffect(() => {
    if (isIPMode && activeAdmission) {
      setAdmissionNo(activeAdmission)
    }
  }, [isIPMode, activeAdmission])

  useEffect(() => {
    if (isIPMode && activeAdmission && patientId) {
      const loadAdmissionLabel = async () => {
        try {
          const admissions = await fetchInpatientAdmissions(patientId, activeAdmission)
          setAdmissionOptions(admissions)
          const matched = admissions.find((a) => a.name === activeAdmission)
          if (matched) {
            setSelectedAdmission(matched)
            setAdmissionQuery(matched.label)
          }
        } catch {
          // keep admission no even if label fetch fails
        }
      }
      loadAdmissionLabel()
    }
  }, [isIPMode, activeAdmission, patientId])

  useEffect(() => {
    if (!isIPMode || !admissionNo) return
    let cancelled = false
    void syncCostCenterFromCareEpisode('IP', {
      inpatientRecord: admissionNo,
      admissions: admissionOptions,
    }).then((cc) => {
      if (cancelled || !cc) return
      setBranch(cc)
      setBranchQuery(cc)
      setSelectedBranch({ name: cc, label: cc })
    })
    return () => {
      cancelled = true
    }
  }, [isIPMode, admissionNo, admissionOptions])

  useEffect(() => {
    if (!patientOpen) return
    let cancelled = false
    const run = async () => {
      setPatientLoading(true)
      try {
        const res = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
        if (!cancelled) setPatientOptions(res)
      } catch { if (!cancelled) setPatientOptions([]) }
      finally { if (!cancelled) setPatientLoading(false) }
    }
    const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!admissionOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchInpatientAdmissions(patientId || undefined, admissionQuery || undefined)
        if (!cancelled) setAdmissionOptions(res)
      } catch { if (!cancelled) setAdmissionOptions([]) }
    }
    const t = setTimeout(run, admissionQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [admissionQuery, admissionOpen, patientId])

  useEffect(() => {
    if (!branchOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchBranches(branchQuery || undefined)
        if (!cancelled) setBranchOptions(res)
      } catch { if (!cancelled) setBranchOptions([]) }
    }
    const t = setTimeout(run, branchQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [branchQuery, branchOpen])

  const closeAllDropdowns = () => { setPatientOpen(false); setAdmissionOpen(false); setBranchOpen(false) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient (File No) is required'); return }
    if (!admissionNo) { setError('Admission No is required'); return }
    if (showDelusionRemark && !remark.trim()) {
      setError('Remark is required when Delusion is selected')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createMentalState({
        file_no: patientId,
        patient_name: patientName || undefined,
        admission_no: admissionNo,
        branch: branch || undefined,
        trans_shift: transShift ? parseInt(transShift) : undefined,
        normal_at: normalAt || undefined,
        cooperative, aggressive, paranoid, demanding, preoccupied, defence, impulsive, sedative,
        dellusion,
        normal_s: normalS, rapid, slow, poor_sp: poorSp, slurred, coherent, incoherent, talkative,
        anxious, angry, depressed, elated, euthymic, irritable,
        twitches, hyperactive, stereotypes, restless, gait, tics, agitated, abnormal,
        hallucinatory_behaviour: hallucinatoryBehaviour,
        normal: normalMotor,
        place, time, person,
        normal_ap: normalAp, increased, poor_ap: poorAp, reported,
        reported_type: reportedType || undefined,
        sleep_duration: sleepDuration ? parseInt(sleepDuration) : undefined,
        normal_sleep: normalSleep, disturbed, intermittent, excessive, a_little: aLittle,
        conscious, alert, disturbed_con: disturbedCon,
        delusion, perception,
        remark: showDelusionRemark ? remark.trim() : undefined,
      })
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || 'Failed to create mental state record')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create record')
    } finally {
      setSaving(false)
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'behaviour', label: 'Behaviour & Speech' },
    { id: 'orientation', label: 'Orientation & Appetite' },
    { id: 'sleep', label: 'Sleep & Consciousness' },
  ]

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass(CREATE_MODAL_TABBED_SHELL)}>
        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New Mental State</h2>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 flex-shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body with consistent minimum height and fixed footer */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) closeAllDropdowns()
          }}
        >
          {/* Scrollable content area */}
          <div className={CREATE_MODAL_TABBED_BODY}>
            {/* ── Details ── */}
            {activeTab === 'details' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient & Admission</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Patient */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Patient (File No) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={patientQuery}
                          onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true) }}
                          onFocus={() => setPatientOpen(true)}
                          placeholder="Search patient…"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {patientLoading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>}
                        {patientOpen && patientOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {patientOptions.map((p) => (
                              <button key={p.name} type="button"
                                onClick={() => { setPatientId(p.name); setPatientQuery(p.patient_name); setPatientName(p.patient_name); setPatientOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                                <div className="font-medium">{p.patient_name}</div>
                                {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Admission No */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Admission No <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        {isIPMode && activeAdmission ? (
                          <div>
                            <input
                              type="text"
                              value={selectedAdmission?.label || admissionNo}
                              readOnly
                              className="w-full cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-400">Auto-selected from IP context</p>
                          </div>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={admissionOpen ? admissionQuery : (selectedAdmission?.label ?? admissionQuery)}
                              onChange={(e) => {
                                setAdmissionQuery(e.target.value)
                                setAdmissionOpen(true)
                                if (!e.target.value) {
                                  setAdmissionNo('')
                                  setSelectedAdmission(null)
                                }
                              }}
                              onFocus={() => setAdmissionOpen(true)}
                              placeholder="Search admission…"
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            {admissionOpen && admissionOptions.length > 0 && (
                              <div className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg">
                                {admissionOptions.map((a) => (
                                  <button
                                    key={a.name}
                                    type="button"
                                    onClick={() => {
                                      setAdmissionNo(a.name)
                                      setSelectedAdmission(a)
                                      setAdmissionQuery(a.label)
                                      setAdmissionOpen(false)
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Trans Shift */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Trans Shift</label>
                      <input
                        type="number"
                        value={transShift}
                        onChange={(e) => setTransShift(e.target.value)}
                        placeholder="Shift number"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Branch */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={branchOpen ? branchQuery : (selectedBranch?.label ?? branchQuery)}
                          onChange={(e) => { setBranchQuery(e.target.value); setBranchOpen(true); if (!e.target.value) { setBranch(''); setSelectedBranch(null) } }}
                          onFocus={() => setBranchOpen(true)}
                          placeholder="Search branch…"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {branchOpen && branchOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {branchOptions.map((b) => (
                              <button key={b.name} type="button"
                                onClick={() => { setBranch(b.name); setSelectedBranch(b); setBranchQuery(b.label); setBranchOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">{b.label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Normal AT */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Normal AT</label>
                      <input
                        type="text"
                        value={normalAt}
                        onChange={(e) => setNormalAt(e.target.value)}
                        placeholder="Normal AT value"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Behaviour & Speech ── */}
            {activeTab === 'behaviour' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Behaviour & Speech</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
                    <div>
                      <Sub label="Behaviour" />
                      <div className="space-y-2">
                        <CF label="Cooperative" checked={!!cooperative} onChange={setCooperative} />
                        <CF label="Aggressive" checked={!!aggressive} onChange={setAggressive} />
                        <CF label="Paranoid" checked={!!paranoid} onChange={setParanoid} />
                        <CF label="Demanding" checked={!!demanding} onChange={setDemanding} />
                        <CF label="Preoccupied" checked={!!preoccupied} onChange={setPreoccupied} />
                        <CF label="Defence" checked={!!defence} onChange={setDefence} />
                        <CF label="Impulsive" checked={!!impulsive} onChange={setImpulsive} />
                        <CF label="Sedative" checked={!!sedative} onChange={setSedative} />
                        <CF label="Delusion" checked={!!dellusion} onChange={setDellusion} />
                      </div>
                      <Sub label="Mood / Affect" />
                      <div className="space-y-2">
                        <CF label="Anxious" checked={!!anxious} onChange={setAnxious} />
                        <CF label="Angry" checked={!!angry} onChange={setAngry} />
                        <CF label="Depressed" checked={!!depressed} onChange={setDepressed} />
                        <CF label="Elated" checked={!!elated} onChange={setElated} />
                        <CF label="Euthymic" checked={!!euthymic} onChange={setEuthymic} />
                        <CF label="Irritable" checked={!!irritable} onChange={setIrritable} />
                      </div>
                    </div>
                    <div>
                      <Sub label="Speech" />
                      <div className="space-y-2">
                        <CF label="Normal S" checked={!!normalS} onChange={setNormalS} />
                        <CF label="Rapid" checked={!!rapid} onChange={setRapid} />
                        <CF label="Slow" checked={!!slow} onChange={setSlow} />
                        <CF label="Poor SP" checked={!!poorSp} onChange={setPoorSp} />
                        <CF label="Slurred" checked={!!slurred} onChange={setSlurred} />
                        <CF label="Coherent" checked={!!coherent} onChange={setCoherent} />
                        <CF label="Incoherent" checked={!!incoherent} onChange={setIncoherent} />
                        <CF label="Talkative" checked={!!talkative} onChange={setTalkative} />
                      </div>
                    </div>
                    <div>
                      <Sub label="Motor" />
                      <div className="space-y-2">
                        <CF label="Twitches" checked={!!twitches} onChange={setTwitches} />
                        <CF label="Hyperactive" checked={!!hyperactive} onChange={setHyperactive} />
                        <CF label="Stereotypes" checked={!!stereotypes} onChange={setStereotypes} />
                        <CF label="Restless" checked={!!restless} onChange={setRestless} />
                        <CF label="Gait" checked={!!gait} onChange={setGait} />
                        <CF label="Tics" checked={!!tics} onChange={setTics} />
                        <CF label="Agitated" checked={!!agitated} onChange={setAgitated} />
                        <CF label="Abnormal" checked={!!abnormal} onChange={setAbnormal} />
                        <CF label="Hallucinatory Behaviour" checked={!!hallucinatoryBehaviour} onChange={setHallucinatoryBehaviour} />
                        <CF label="Normal" checked={!!normalMotor} onChange={setNormalMotor} />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Orientation & Appetite ── */}
            {activeTab === 'orientation' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Orientation</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <CF label="Place" checked={!!place} onChange={setPlace} />
                    <CF label="Time" checked={!!time} onChange={setTime} />
                    <CF label="Person" checked={!!person} onChange={setPerson} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-2">Appetite</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                    <CF label="Normal Appetite" checked={!!normalAp} onChange={setNormalAp} />
                    <CF label="Increased" checked={!!increased} onChange={setIncreased} />
                    <CF label="Poor Appetite" checked={!!poorAp} onChange={setPoorAp} />
                    <CF label="Reported" checked={!!reported} onChange={setReported} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reported Type</label>
                    <input type="text" value={reportedType} onChange={(e) => setReportedType(e.target.value)} placeholder="Reported type description" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </>
            )}

            {/* ── Sleep & Consciousness ── */}
            {activeTab === 'sleep' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Sleep</h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sleep Duration (hrs)</label>
                    <input type="number" min="0" value={sleepDuration} onChange={(e) => setSleepDuration(e.target.value)} placeholder="e.g. 7" className="w-full md:w-48 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <CF label="Normal Sleep" checked={!!normalSleep} onChange={setNormalSleep} />
                    <CF label="Disturbed" checked={!!disturbed} onChange={setDisturbed} />
                    <CF label="Intermittent" checked={!!intermittent} onChange={setIntermittent} />
                    <CF label="Excessive" checked={!!excessive} onChange={setExcessive} />
                    <CF label="A Little" checked={!!aLittle} onChange={setALittle} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-2">Consciousness</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <CF label="Conscious" checked={!!conscious} onChange={setConscious} />
                    <CF label="Alert" checked={!!alert} onChange={setAlert} />
                    <CF label="Disturbed Con" checked={!!disturbedCon} onChange={setDisturbedCon} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-2">Psychotic Symptom</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <CF label="Delusion" checked={!!delusion} onChange={setDelusion} />
                    <CF label="Perception" checked={!!perception} onChange={setPerception} />
                  </div>
                </div>
              </>
            )}

            {showDelusionRemark ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Remark <span className="text-red-500">*</span>
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  Required when Delusion is selected (Behaviour or Psychotic Symptom).
                </p>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={3}
                  placeholder="Enter remark for delusion…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                />
              </div>
            ) : null}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
            )}
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save Record'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}