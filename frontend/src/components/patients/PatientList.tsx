import { useState } from 'react'
import { usePatients } from '../../hooks/usePatients'

export const PatientList = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const { patients, loading, error, refetch } = usePatients(searchQuery || undefined)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading patients...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Patients</h3>
          <p className="text-red-700 text-sm mb-2">{error.message}</p>
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
    <div className="space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search patients by name, file number, or ID..."
          className="w-full max-w-md rounded-md border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Patients Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                File Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Patient Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Gender
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Mobile
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                ID Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {patients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {searchQuery ? 'No patients match your search.' : 'No patients found.'}
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr key={patient.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {patient.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {patient.patient_name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {patient.sex || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {patient.mobile || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {patient.id_number || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {patient.category || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}






