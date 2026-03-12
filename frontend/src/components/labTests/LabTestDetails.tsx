import { useState, useEffect } from 'react'
import { fetchLabTest, type LabTest } from '../../services/labTests'
import { StatusPill } from '../ui/StatusPill'
import { updateLabTestStatus } from '../../services/labTests'
import { toast } from '../../hooks/useToast'

const statusColors: Record<string, string> = {
  'Approved': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Submitted': 'info',
  'Sample collection in progress': 'warning',
  'Sample collected': 'info',
  'Pending Review': 'warning',
  'Cancelled': 'default',
  'Draft': 'warning',
  'Requested': 'info',
}

interface LabTestDetailsProps {
  labTestName: string
  onUpdate?: () => void
}

const Field = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{' '}
      <span className="text-slate-600">{value}</span>
    </div>
  )
}

const SectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-slate-700 mb-2 pb-1 border-b border-slate-100">{title}</h3>
)

export const LabTestDetails = ({ labTestName, onUpdate }: LabTestDetailsProps) => {
  const [labTest, setLabTest] = useState<LabTest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [actionLoading, setActionLoading] = useState<'Approved' | 'Rejected' | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchLabTest(labTestName)
      setLabTest(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch lab test details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [labTestName])

  const handleStatusChange = async (newStatus: 'Approved' | 'Rejected') => {
    setActionLoading(newStatus)
    try {
      await updateLabTestStatus(labTestName, newStatus)
      toast.success(`Lab test ${newStatus.toLowerCase()}`)
      await load()
      onUpdate?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${newStatus.toLowerCase()} lab test`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading lab test details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Lab Test</h3>
        <p className="text-red-700 text-sm mb-3">{error.message}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!labTest) {
    return <div className="text-slate-500 text-center p-8">Lab test not found</div>
  }

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : undefined
  const formatDatetime = (d?: string) => d ? new Date(d).toLocaleString() : undefined

  return (
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Lab Test</p>
          <h2 className="text-lg font-bold text-slate-900">{labTest.name}</h2>
        </div>
        {labTest.status && (
          <StatusPill
            status={labTest.status}
            color={statusColors[labTest.status] || 'default'}
          />
        )}
      </div>

      {/* ── Grid sections ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">

        {/* Patient Information */}
        <div>
          <SectionTitle title="Patient Information" />
          <div className="space-y-1">
            <Field label="Patient" value={labTest.patient_name || labTest.patient} />
            <Field label="Patient ID" value={labTest.patient} />
            <Field label="Age" value={labTest.patient_age} />
            <Field label="Gender" value={labTest.patient_sex} />
            <Field label="Email" value={labTest.email} />
            <Field label="Mobile" value={labTest.mobile} />
            <Field label="Report Preference" value={labTest.report_preference} />
            {labTest.inpatient_record && (
              <Field label="Inpatient Admission" value={labTest.inpatient_record} />
            )}
          </div>
        </div>

        {/* Test Information */}
        <div>
          <SectionTitle title="Test Information" />
          <div className="space-y-1">
            <Field label="Test Name" value={labTest.lab_test_name} />
            <Field label="Template" value={labTest.template} />
            <Field label="Department" value={labTest.department} />
            <Field label="Service Unit" value={labTest.service_unit} />
            <Field label="Company" value={labTest.company} />
            <Field label="Is Outsourced" value={labTest.is_outsourced ? 'Yes' : undefined} />
          </div>
        </div>

        {/* Requesting Details */}
        <div>
          <SectionTitle title="Requesting Details" />
          <div className="space-y-1">
            <Field label="Practitioner" value={labTest.practitioner_name || labTest.practitioner} />
            <Field label="Requesting Department" value={labTest.requesting_department} />
            <Field label="Service Request" value={labTest.service_request} />
            <Field label="Reference" value={labTest.reference_document} />
          </div>
        </div>

        {/* Lab Technician */}
        <div>
          <SectionTitle title="Lab Technician" />
          <div className="space-y-1">
            <Field label="Name" value={labTest.employee_name || labTest.employee} />
            <Field label="Designation" value={labTest.employee_designation} />
            <Field label="Reviewed By" value={labTest.reviewed_by} />
          </div>
        </div>

        {/* Dates & Timeline */}
        <div>
          <SectionTitle title="Dates & Timeline" />
          <div className="space-y-1">
            <Field label="Test Date" value={formatDate(labTest.date)} />
            <Field label="Submitted" value={formatDatetime(labTest.submitted_date)} />
            <Field label="Result Date" value={formatDate(labTest.result_date)} />
            <Field label="Expected Result" value={formatDate(labTest.expected_result_date)} />
            <Field label="Approved Date" value={formatDatetime(labTest.approved_date)} />
            <Field label="Printed On" value={formatDatetime(labTest.printed_on)} />
          </div>
        </div>

        {/* Flags */}
        <div>
          <SectionTitle title="Flags" />
          <div className="space-y-1">
            <Field label="Invoiced" value={labTest.invoiced ? 'Yes' : 'No'} />
            <Field label="Email Sent" value={labTest.email_sent ? 'Yes' : 'No'} />
            <Field label="SMS Sent" value={labTest.sms_sent ? 'Yes' : 'No'} />
            <Field label="Printed" value={labTest.printed ? 'Yes' : 'No'} />
            {labTest.amended_from && (
              <Field label="Amended From" value={labTest.amended_from} />
            )}
            {labTest.sample && (
              <Field label="Sample ID" value={labTest.sample} />
            )}
          </div>
        </div>
      </div>

      {/* ── Sample Collection breakdown ── */}
      {labTest.sample_instances && labTest.sample_instances.length > 0 && (
        <div>
          <SectionTitle title="Sample Collection" />
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Sample</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Details</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Sample Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labTest.sample_instances.map((row, idx) => (
                  <tr key={idx} className="bg-white">
                    <td className="px-3 py-2 text-slate-800">
                      {row.sample || '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {row.sample_qty ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-pre-wrap">
                      {row.sample_details || <span className="text-slate-400 italic">No details</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {row.sample_collection ? (
                        <a
                          href={`/app/sample-collection/${encodeURIComponent(row.sample_collection)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {row.sample_collection}
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Not collected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {(labTest.descriptive_result || labTest.custom_result || labTest.lab_test_comment) && (
        <div className="space-y-3">
          {labTest.descriptive_result && (
            <div>
              <SectionTitle title="Descriptive Result" />
              <div
                className="text-sm text-slate-700 bg-slate-50 rounded-md p-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: labTest.descriptive_result }}
              />
            </div>
          )}
          {labTest.custom_result && (
            <div>
              <SectionTitle title="Custom Result" />
              <div
                className="text-sm text-slate-700 bg-slate-50 rounded-md p-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: labTest.custom_result }}
              />
            </div>
          )}
          {labTest.lab_test_comment && (
            <div>
              <SectionTitle title="Comments" />
              <p className="text-sm text-slate-700 bg-slate-50 rounded-md p-3 whitespace-pre-wrap">
                {labTest.lab_test_comment}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Doctor's Remarks (table) ── */}
      {labTest.remarks && Array.isArray(labTest.remarks) && labTest.remarks.length > 0 && labTest.remarks.some((r: { rrmark?: string }) => (r.rrmark || '').trim()) && (
        <div className="space-y-2">
          <SectionTitle title="Doctor's Remarks" />
          <div className="space-y-2">
            {labTest.remarks.map((row: { rrmark?: string }, i: number) => {
              const text = (row.rrmark || '').trim()
              if (!text) return null
              return (
                <div key={i} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{text}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Normal Test Items table ── */}
      {labTest.normal_test_items && labTest.normal_test_items.length > 0 && (
        <div>
          <SectionTitle title="Normal Test Results" />
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Test</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Result</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Unit</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Normal Range</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {labTest.normal_test_items.map((item: any, i: number) => (
                  <tr key={i} className={item.abnormal ? 'bg-red-50' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2 text-slate-800">{item.lab_test_name}</td>
                    <td className={`px-3 py-2 font-medium ${item.abnormal ? 'text-red-700' : 'text-slate-800'}`}>
                      {item.result_value}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.lab_test_uom || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{item.normal_range || '—'}</td>
                    <td className="px-3 py-2">
                      {item.abnormal
                        ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Abnormal</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Normal</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sensitivity Test Items table ── */}
      {labTest.sensitivity_test_items && labTest.sensitivity_test_items.length > 0 && (
        <div>
          <SectionTitle title="Sensitivity Test Results" />
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Antibiotic</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Sensitivity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {labTest.sensitivity_test_items.map((item: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800">{item.antibiotic}</td>
                    <td className="px-3 py-2 text-slate-600">{item.antibiotic_sensitivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Documents ── */}
      {labTest.documents && labTest.documents.length > 0 && (
        <div className="space-y-2">
          <SectionTitle title="Documents" />
          <div className="space-y-2">
            {labTest.documents.map((doc: { file_name?: string; document_type?: string; transaction_no?: string; upload_remarks?: string; document?: string }, i: number) => {
              const docUrl = doc.document
              const label = doc.file_name || doc.document_type || 'Document'
              const base = typeof window !== 'undefined' ? window.location.origin : ''
              const href = docUrl && (docUrl.startsWith('http') ? docUrl : `${base}${docUrl}`)
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{label}</div>
                    {(doc.document_type || doc.transaction_no) && (
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-0.5">
                        {doc.document_type && <span>Type: {doc.document_type}</span>}
                        {doc.transaction_no && <span>Txn: {doc.transaction_no}</span>}
                      </div>
                    )}
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/5">
                      Open
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="border-t border-slate-200 pt-4">
        <SectionTitle title="Actions" />
        <div className="flex flex-wrap gap-2">
          {labTest.status !== 'Approved' && (
            <button
              onClick={() => handleStatusChange('Approved')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'Approved' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : '✓'}
              Approve
            </button>
          )}
          {labTest.status !== 'Rejected' && (
            <button
              onClick={() => handleStatusChange('Rejected')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading === 'Rejected' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : '✗'}
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  )
}