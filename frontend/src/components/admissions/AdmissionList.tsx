import { useState } from 'react'
import { useInpatientRecords } from '../../hooks/useInpatientRecords'
import { StatusPill } from '../ui/StatusPill'
import { PackageSelectionModal } from './PackageSelectionModal'
import { AdmissionFormModal } from './AdmissionFormModal'
import { ScheduleDischargeModal } from './ScheduleDischargeModal'
import { DischargeModal } from './DischargeModal'
import type { InpatientRecord } from '../../services/inpatientRecords'

const statusColors: Record<string, string> = {
  'Admission Scheduled': 'warning',
  'Admitted': 'success',
  'Discharge Scheduled': 'info',
  'Discharged': 'default',
  'Cancelled': 'danger'
}

interface AdmissionListProps {
  onAdmissionSelect?: (admissionName: string) => void
  searchQuery?: string
  patient?: string
}

export const AdmissionList = ({ onAdmissionSelect, searchQuery: externalSearchQuery = '', patient }: AdmissionListProps = {}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [showPackages, setShowPackages] = useState(false)
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<any>(null)
  const [showScheduleDischarge, setShowScheduleDischarge] = useState(false)
  const [selectedAdmissionForDischarge, setSelectedAdmissionForDischarge] = useState<InpatientRecord | null>(null)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [selectedAdmissionForFinalDischarge, setSelectedAdmissionForFinalDischarge] = useState<InpatientRecord | null>(null)

  const { records, loading, error, refetch } = useInpatientRecords(
    selectedStatus || undefined,
    externalSearchQuery || undefined,
    patient
  )

  const handleAdmit = (recordName: string) => {
    setSelectedRecord(recordName)
    setShowPackages(true)
  }

  const handlePackageSelect = (pkg: any) => {
    setSelectedPackage(pkg)
    setShowPackages(false)
    setShowAdmissionForm(true)
  }

  const handleAdmissionComplete = () => {
    setShowAdmissionForm(false)
    setSelectedRecord(null)
    setSelectedPackage(null)
    refetch()
  }

  const handleScheduleDischarge = (record: InpatientRecord) => {
    setSelectedAdmissionForDischarge(record)
    setShowScheduleDischarge(true)
  }

  const handleDischargeScheduled = () => {
    setShowScheduleDischarge(false)
    setSelectedAdmissionForDischarge(null)
    refetch()
  }

  const handleDischarge = (record: InpatientRecord) => {
    setSelectedAdmissionForFinalDischarge(record)
    setShowDischargeModal(true)
  }

  const handleDischargeComplete = () => {
    setShowDischargeModal(false)
    setSelectedAdmissionForFinalDischarge(null)
    refetch()
  }

  const statuses = [
    'Admission Scheduled',
    'Admitted',
    'Discharge Scheduled',
    'Discharged',
    'Cancelled'
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading admissions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Admissions</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
          <p className="text-red-600 text-xs mb-4">
            This might be due to authentication issues. Please ensure you're logged in to Frappe.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedStatus('')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              selectedStatus === ''
                ? 'bg-primary text-white'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                selectedStatus === status
                  ? 'bg-primary text-white'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Records Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Admission No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Scheduled Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Status
                </th>
                {onAdmissionSelect && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={onAdmissionSelect ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    {externalSearchQuery ? 'No admissions match your search.' : 'No admissions found'}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr 
                    key={record.name} 
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => onAdmissionSelect?.(record.name)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {record.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.patient_name || record.patient}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.scheduled_date
                        ? new Date(record.scheduled_date).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={record.status}
                        color={statusColors[record.status] || 'default'}
                      />
                    </td>
                    {onAdmissionSelect && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          {record.status === 'Admission Scheduled' && (
                            <button
                              onClick={() => handleAdmit(record.name)}
                              className="px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90"
                            >
                              Admit
                            </button>
                          )}
                          {record.status === 'Admitted' && (
                            <button
                              onClick={() => handleScheduleDischarge(record)}
                              className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700"
                            >
                              Schedule Discharge
                            </button>
                          )}
                          {record.status === 'Discharge Scheduled' && (
                            <button
                              onClick={() => handleDischarge(record)}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                            >
                              Discharge
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPackages && selectedRecord && (
        <PackageSelectionModal
          admissionNo={selectedRecord}
          onSelect={handlePackageSelect}
          onClose={() => {
            setShowPackages(false)
            setSelectedRecord(null)
          }}
        />
      )}

      {showAdmissionForm && selectedRecord && selectedPackage && (
        <AdmissionFormModal
          admissionNo={selectedRecord}
          selectedPackage={selectedPackage}
          onComplete={handleAdmissionComplete}
          onClose={() => {
            setShowAdmissionForm(false)
            setSelectedRecord(null)
            setSelectedPackage(null)
          }}
        />
      )}

      {showScheduleDischarge && selectedAdmissionForDischarge && (
        <ScheduleDischargeModal
          admission={{
            name: selectedAdmissionForDischarge.name,
            patient: selectedAdmissionForDischarge.patient,
            patient_name: selectedAdmissionForDischarge.patient_name
          }}
          onClose={() => {
            setShowScheduleDischarge(false)
            setSelectedAdmissionForDischarge(null)
          }}
          onSuccess={handleDischargeScheduled}
        />
      )}

      {showDischargeModal && selectedAdmissionForFinalDischarge && (
        <DischargeModal
          admission={{
            name: selectedAdmissionForFinalDischarge.name,
            patient: selectedAdmissionForFinalDischarge.patient,
            patient_name: selectedAdmissionForFinalDischarge.patient_name
          }}
          onClose={() => {
            setShowDischargeModal(false)
            setSelectedAdmissionForFinalDischarge(null)
          }}
          onSuccess={handleDischargeComplete}
        />
      )}
    </>
  )
}

