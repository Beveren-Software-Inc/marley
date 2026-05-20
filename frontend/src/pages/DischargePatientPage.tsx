import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

/** Legacy route — redirects into doctor portal with ?discharge= so the top navbar stays visible. */
export const DischargePatientPage = () => {
  const { admissionName } = useParams<{ admissionName: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!admissionName) {
      navigate('/doctor?screen=df', { replace: true })
      return
    }
    const params = new URLSearchParams()
    params.set('screen', 'df')
    params.set('discharge', admissionName)
    const patient = searchParams.get('patient')
    if (patient) params.set('patient', patient)
    navigate(`/doctor?${params.toString()}`, { replace: true })
  }, [admissionName, navigate, searchParams])

  return (
    <div className="flex items-center justify-center min-h-[200px] text-slate-600 text-sm">
      Opening discharge…
    </div>
  )
}
