interface DoctorServiceDetailsTableProps {
  patient?: string
  onAddService?: () => void
}

// Placeholder component for doctor service details / invoicing data.
// We will wire this to billing data (e.g. healthcare services / invoice items) later.
export const DoctorServiceDetailsTable = ({ patient, onAddService }: DoctorServiceDetailsTableProps) => {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="font-semibold mb-3 flex items-center justify-between">
        <span>Doctor Service Details</span>
        {patient && onAddService && (
          <button
            onClick={onAddService}
            className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold"
            title="Add Service"
          >
            +
          </button>
        )}
      </div>
      {!patient && (
        <div className="text-sm text-slate-500">
          Select a patient to view doctor service details.
        </div>
      )}
      {patient && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Code
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                  Service Name
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                  Amount
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                  Additional Amount
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                  Discount
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 uppercase">
                  Net Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No doctor service details available yet. This table will be wired to invoicing data.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}


