import { useState, useEffect } from 'react'
import { getPatientReferrals, type PatientReferralRow } from '../../services/patientReferral'
import { CreatePatientReferralModal } from './CreatePatientReferralModal'

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Completed: 'bg-green-100 text-green-800 border-green-200',
  Cancelled: 'bg-red-100 text-red-800 border-red-200',
}

interface PatientReferralListProps {
  patient?: string
  refreshKey?: number | string
  showCreateButton?: boolean
  initialPatient?: string
}

export const PatientReferralList = ({
  patient,
  refreshKey,
  showCreateButton = false,
  initialPatient,
}: PatientReferralListProps) => {
  const [rows, setRows] = useState<PatientReferralRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await getPatientReferrals({
          patient: patient || undefined,
          referral_status: statusFilter || undefined,
          limit: 100,
        })
        setRows(data)
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patient, statusFilter, refreshKey, localRefresh])

  return (
    <div>
      {/* Filters + button row */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        {showCreateButton && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ml-auto w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold"
            title="New Referral"
          >
            +
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Ref No</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Patient</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Date</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Referred To</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Doctor</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Source</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-xs">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-xs">No referrals found</td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.name}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.patient_name || row.patient}</div>
                    <div className="text-xs text-slate-400">{row.patient}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.referral_date}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.referred_to_hospital}</div>
                    {row.referred_to_doctor && (
                      <div className="text-xs text-slate-400">{row.referred_to_doctor}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.referred_to_doctor || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.referred_from_doctype ? (
                      <>
                        <div>{row.referred_from_doctype}</div>
                        <div className="text-slate-400">{row.referred_from_docname}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[row.referral_status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {row.referral_status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CreatePatientReferralModal
          initialPatient={patient || initialPatient}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            setLocalRefresh(k => k + 1)
          }}
        />
      )}
    </div>
  )
}
