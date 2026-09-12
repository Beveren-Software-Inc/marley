import { useNavigate, useLocation } from 'react-router-dom'
import { PatientCareHeader } from '../patients/PatientCareHeader'
import { useCareContext } from '../../providers/CareContextProvider'

/** Empty portal workspace after double-clicking a role (Doctor / Nurse / Lab / …). */
export function PortalBlankWorkspace() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSelectedPatient } = useCareContext()

  const handlePatientSelect = (patient: string | undefined) => {
    setSelectedPatient(patient)
    const params = new URLSearchParams(location.search)
    params.delete('blank')
    if (patient) params.set('patient', patient)
    else params.delete('patient')
    const qs = params.toString()
    navigate(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true })
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      <PatientCareHeader selectedPatient="" onPatientSelect={handlePatientSelect} patients={[]} />
      <div className="flex-1 min-h-0" aria-hidden />
    </div>
  )
}
