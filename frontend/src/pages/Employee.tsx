import { useEffect, useState } from 'react'
import { NavbarActions } from '../components/layout/NavbarActions'
import { useAuth } from '../providers/AuthProvider'
import { getEmployeeDashboard, createEmployeeRequest } from '../services/employee'

interface EmployeeDashboard {
  employee?: {
    name: string
    employee_name?: string
    designation?: string
    company?: string
  } | null
  checkins: Array<{
    name: string
    time: string
    log_type?: string
    shift?: string
    device_id?: string
  }>
  room_access_logs: Array<{
    name: string
    access_time: string
    location?: string
    access_type?: string
    device_name?: string
  }>
  attendance: Array<{
    name: string
    attendance_date: string
    status: string
    shift?: string
  }>
}

export const EmployeePage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<EmployeeDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestSubject, setRequestSubject] = useState('')
  const [requestType, setRequestType] = useState('Attendance')
  const [requestDetails, setRequestDetails] = useState('')
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await getEmployeeDashboard()
        setData(res)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load employee dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header without patient search */}
      <header className="flex items-center justify-between bg-primary text-white px=4 py-3 border-b border-white/20">
        <div>
          <h1 className="text-lg font-semibold">
            Employee Portal{user?.full_name ? ` - ${user.full_name}` : ''}
          </h1>
          <p className="text-xs text-primary-100">
            View your check-ins, room access logs, and attendance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-primary text-sm font-medium hover:bg-slate-100"
            onClick={() => setShowRequestModal(true)}
          >
            <span>Submit a Request</span>
          </button>
          <NavbarActions placement="header" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-slate-600">Loading your data…</div>
          </div>
        ) : error ? (
          <div className="max-w-xl mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="font-semibold text-red-800 mb-2">Could not load data</h2>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employee Check-ins */}
            <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">My Check-ins</h2>
                <span className="text-xs text-slate-500">
                  {data?.checkins?.length ? `${data.checkins.length} records` : 'No records'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {data?.checkins?.length ? (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-slate-600">Time</th>
                        <th className="px-2 py-1 text-left text-slate-600">Type</th>
                        <th className="px-2 py-1 text-left text-slate-600">Location</th>
                        <th className="px-2 py-1 text-left text-slate-600">Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.checkins.map((row) => (
                        <tr key={row.name}>
                          <td className="px-2 py-1">
                            {row.time ? new Date(row.time).toLocaleString('en-GB') : '-'}
                          </td>
                          <td className="px-2 py-1">{row.log_type || '-'}</td>
                          <td className="px-2 py-1">{row.device_id || '-'}</td>
                          <td className="px-2 py-1">{row.shift || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-slate-500">No check-ins found.</div>
                )}
              </div>
            </section>

            {/* Room Access Logs */}
            <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Room Access Logs</h2>
                <span className="text-xs text-slate-500">
                  {data?.room_access_logs?.length
                    ? `${data.room_access_logs.length} records`
                    : 'No records'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {data?.room_access_logs?.length ? (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-slate-600">Time</th>
                        <th className="px-2 py-1 text-left text-slate-600">Location</th>
                        <th className="px-2 py-1 text-left text-slate-600">Access Type</th>
                        <th className="px-2 py-1 text-left text-slate-600">Device</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.room_access_logs.map((row) => (
                        <tr key={row.name}>
                          <td className="px-2 py-1">
                            {row.access_time ? new Date(row.access_time).toLocaleString('en-GB') : '-'}
                          </td>
                          <td className="px-2 py-1">{row.location || '-'}</td>
                          <td className="px-2 py-1">{row.access_type || '-'}</td>
                          <td className="px-2 py-1">{row.device_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-slate-500">No room access logs found.</div>
                )}
              </div>
            </section>

            {/* Attendance */}
            <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">My Attendance</h2>
                <span className="text-xs text-slate-500">
                  {data?.attendance?.length ? `${data.attendance.length} days` : 'No records'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {data?.attendance?.length ? (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-slate-600">Date</th>
                        <th className="px-2 py-1 text-left text-slate-600">Status</th>
                        <th className="px-2 py-1 text-left text-slate-600">Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.attendance.map((row) => (
                        <tr key={row.name}>
                          <td className="px-2 py-1">
                            {row.attendance_date
                              ? new Date(row.attendance_date).toLocaleDateString('en-GB')
                              : '-'}
                          </td>
                          <td className="px-2 py-1">{row.status}</td>
                          <td className="px-2 py-1">{row.shift || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-slate-500">No attendance records found.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
      {showRequestModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Submit a Request</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setShowRequestModal(false)}
              >
                ✕
              </button>
            </div>
            <form
              className="p-4 text-sm text-slate-700 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault()
                setRequestError(null)

                if (!requestSubject.trim()) {
                  setRequestError('Subject is required')
                  return
                }
                if (!requestDetails.trim()) {
                  setRequestError('Details are required')
                  return
                }

                try {
                  setRequestSubmitting(true)
                  await createEmployeeRequest({
                    subject: requestSubject.trim(),
                    details: requestDetails.trim(),
                    type: requestType,
                  })
                  setShowRequestModal(false)
                  setRequestSubject('')
                  setRequestDetails('')
                  setRequestType('Attendance')
                } catch (err) {
                  setRequestError(err instanceof Error ? err.message : 'Failed to submit request')
                } finally {
                  setRequestSubmitting(false)
                }
              }}
            >
              {requestError && (
                <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                  {requestError}
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Subject</label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={requestSubject}
                  onChange={(e) => setRequestSubject(e.target.value)}
                  placeholder="Short summary (e.g. Wrong checkin time)"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Type</label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                >
                  <option value="Attendance">Attendance</option>
                  <option value="Access / Room Entry">Access / Room Entry</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Details</label>
                <textarea
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]"
                  value={requestDetails}
                  onChange={(e) => setRequestDetails(e.target.value)}
                  placeholder="Explain the issue or request..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowRequestModal(false)}
                  disabled={requestSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md text-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                  disabled={requestSubmitting}
                >
                  {requestSubmitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

