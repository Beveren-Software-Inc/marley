import { useState } from 'react'
import { useLabTests } from '../../hooks/useLabTests'
import { StatusPill } from '../ui/StatusPill'
import {
  getLabTestConsumables,
  requestLabConsumables,
  fetchLabTest,
  saveAndSubmitLabTest,
  type LabConsumableRow,
  type LabTest,
} from '../../services/labTests'
import { fetchItems, fetchWarehouses, type LinkFieldOption } from '../../services/common'

const statusColors: Record<string, string> = {
  'Approved': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Pending Review': 'warning',
  'Submitted': 'info',
  'Cancelled': 'default',
  'Draft': 'warning',
  'Pending': 'warning'
}

export const LabTestList = ({
  patient,
  isOutsourced
}: {
  patient?: string
  isOutsourced?: boolean
}) => {
  // Fetch all lab tests (no status filter, no pending review filter)
  // If isOutsourced is true, only fetch outsourced tests
  const { labTests, loading, error, refetch } = useLabTests(
    patient,
    undefined,
    false,
    isOutsourced
  )

  const [requestingFor, setRequestingFor] = useState<string | null>(null)
  const [dialogItems, setDialogItems] = useState<LabConsumableRow[]>([])
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const [itemOptions, setItemOptions] = useState<LinkFieldOption[]>([])
  const [warehouseOptions, setWarehouseOptions] = useState<LinkFieldOption[]>([])
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null)
  const [openWarehouseIndex, setOpenWarehouseIndex] = useState<number | null>(null)

  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [resultDialogLoading, setResultDialogLoading] = useState(false)
  const [resultDialogError, setResultDialogError] = useState<string | null>(null)
  const [activeLabTest, setActiveLabTest] = useState<LabTest | null>(null)
  const [customResult, setCustomResult] = useState('')
  const [labComment, setLabComment] = useState('')
  const [worksheetText, setWorksheetText] = useState('')

  const openRequestDialog = async (labTestName: string) => {
    try {
      setDialogError(null)
      setDialogLoading(true)
      setRequestingFor(labTestName)

      // Preload items and warehouses once
      if (!itemOptions.length) {
        fetchItems().then(setItemOptions).catch(() => setItemOptions([]))
      }
      if (!warehouseOptions.length) {
        fetchWarehouses().then(setWarehouseOptions).catch(() => setWarehouseOptions([]))
      }

      const items = await getLabTestConsumables(labTestName)
      setDialogItems(
        items.length
          ? items
          : [
              {
                item_code: '',
                item_name: '',
                qty: 1,
              },
            ]
      )
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed to load consumables')
    } finally {
      setDialogLoading(false)
    }
  }

  const closeRequestDialog = () => {
    setRequestingFor(null)
    setDialogItems([])
    setDialogError(null)
    setDialogLoading(false)
  }

  const updateItem = (index: number, field: keyof LabConsumableRow, value: string) => {
    setDialogItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: field === 'qty' ? Number(value) || 0 : value,
            }
          : row
      )
    )
  }

  const addRow = () => {
    setDialogItems((prev) => [
      ...prev,
      {
        item_code: '',
        item_name: '',
        qty: 1,
      },
    ])
  }

  const removeRow = (index: number) => {
    setDialogItems((prev) => prev.filter((_, i) => i !== index))
  }

  const submitRequest = async () => {
    if (!requestingFor) return

    const validItems = dialogItems.filter((row) => row.item_code && row.qty > 0)
    if (!validItems.length) {
      setDialogError('Please add at least one item with quantity.')
      return
    }

    try {
      setDialogLoading(true)
      setDialogError(null)

      const mrName = await requestLabConsumables(requestingFor, validItems)
      await refetch()
      closeRequestDialog()
      // eslint-disable-next-line no-alert
      alert(`Material Request ${mrName} created`)
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed to create Material Request')
    } finally {
      setDialogLoading(false)
    }
  }

  const openResultDialog = async (labTestName: string) => {
    try {
      setResultDialogError(null)
      setResultDialogLoading(true)
      setResultDialogOpen(true)
      setActiveLabTest({ name: labTestName, patient: '' })
      const doc = await fetchLabTest(labTestName)
      setActiveLabTest(doc)
      setCustomResult(doc.custom_result || '')
      setLabComment(doc.lab_test_comment || '')
      setWorksheetText(doc.worksheet_instructions || '')
    } catch (e) {
      setResultDialogError(e instanceof Error ? e.message : 'Failed to load lab test')
    } finally {
      setResultDialogLoading(false)
    }
  }

  const closeResultDialog = () => {
    setResultDialogOpen(false)
    setActiveLabTest(null)
    setCustomResult('')
    setLabComment('')
    setWorksheetText('')
    setResultDialogError(null)
    setResultDialogLoading(false)
  }

  const handleSubmitLabTestWithResults = async () => {
    if (!activeLabTest) return

    try {
      setResultDialogLoading(true)
      setResultDialogError(null)

      await saveAndSubmitLabTest(activeLabTest.name, {
        custom_result: customResult,
        lab_test_comment: labComment,
        worksheet_instructions: worksheetText,
        submit: true
      })

      await refetch()
      closeResultDialog()
    } catch (e) {
      setResultDialogError(
        e instanceof Error ? e.message : 'Failed to submit lab test with results'
      )
    } finally {
      setResultDialogLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-600">Loading lab tests...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Lab Tests</h3>
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

  if (labTests.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-500">No lab tests found</div>
      </div>
    )
  }

  return (
    <div className="min-w-full">
      <table className="w-full min-w-[900px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Lab Test ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Patient
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Test Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Practitioner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Actions
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
              Inventory
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {labTests.map((labTest) => (
            <tr key={labTest.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {labTest.name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {labTest.patient_name || labTest.patient}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {labTest.lab_test_name || labTest.template || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {labTest.practitioner_name || labTest.practitioner || '-'}
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  status={labTest.status || 'Draft'}
                  color={statusColors[labTest.status || 'Draft'] || 'default'}
                />
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {labTest.result_date
                  ? new Date(labTest.result_date).toLocaleDateString()
                  : labTest.submitted_date
                  ? new Date(labTest.submitted_date).toLocaleDateString()
                  : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700 space-x-2">
                {labTest.docstatus === 0 && (
                  <button
                    type="button"
                    onClick={() => openResultDialog(labTest.name)}
                    className="px-2 py-1 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Enter Results &amp; Submit
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {labTest.docstatus === 0 && !labTest.material_request ? (
                  <button
                    type="button"
                    onClick={() => openRequestDialog(labTest.name)}
                    className="px-2 py-1 text-xs rounded-md border border-primary text-primary hover:bg-primary/5"
                  >
                    Request Consumables
                  </button>
                ) : labTest.material_request ? (
                  <span className="text-xs text-slate-500">
                    MR: {labTest.material_request}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {requestingFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Request Consumables for {requestingFor}
              </h2>
              <button
                type="button"
                onClick={closeRequestDialog}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              {dialogError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
                  {dialogError}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-slate-200 rounded-md">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Item Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Item Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Warehouse</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {dialogItems.map((row, index) => (
                      <tr key={index} className="border-t border-slate-200">
                        <td className="px-3 py-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.item_code}
                              onChange={(e) => {
                                updateItem(index, 'item_code', e.target.value)
                                setOpenItemIndex(index)
                              }}
                              onFocus={() => setOpenItemIndex(index)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                              placeholder="Select item..."
                            />
                            {openItemIndex === index && itemOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {itemOptions
                                  .filter((opt) =>
                                    (opt.label || opt.name)
                                      .toLowerCase()
                                      .includes((row.item_code || '').toLowerCase())
                                  )
                                  .slice(0, 20)
                                  .map((opt) => (
                                    <button
                                      key={opt.name}
                                      type="button"
                                      className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100"
                                      onClick={() => {
                                        updateItem(index, 'item_code', opt.name)
                                        updateItem(index, 'item_name', opt.label || opt.name)
                                        setOpenItemIndex(null)
                                      }}
                                    >
                                      {opt.label || opt.name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.item_name || ''}
                            onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                            placeholder="Item name"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.qty}
                            onChange={(e) => updateItem(index, 'qty', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.warehouse || ''}
                              onChange={(e) => {
                                updateItem(index, 'warehouse', e.target.value)
                                setOpenWarehouseIndex(index)
                              }}
                              onFocus={() => setOpenWarehouseIndex(index)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                              placeholder="Select warehouse..."
                            />
                            {openWarehouseIndex === index && warehouseOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {warehouseOptions
                                  .filter((opt) =>
                                    (opt.label || opt.name)
                                      .toLowerCase()
                                      .includes((row.warehouse || '').toLowerCase())
                                  )
                                  .slice(0, 20)
                                  .map((opt) => (
                                    <button
                                      key={opt.name}
                                      type="button"
                                      className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100"
                                      onClick={() => {
                                        updateItem(index, 'warehouse', opt.name)
                                        setOpenWarehouseIndex(null)
                                      }}
                                    >
                                      {opt.label || opt.name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={addRow}
                  className="px-3 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  + Add Row
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeRequestDialog}
                    className="px-3 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                    disabled={dialogLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitRequest}
                    disabled={dialogLoading}
                    className="px-3 py-1 text-xs bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    {dialogLoading ? 'Submitting...' : 'Create Material Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {resultDialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Enter Results {activeLabTest?.name ? `for ${activeLabTest.name}` : ''}
              </h2>
              <button
                type="button"
                onClick={closeResultDialog}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {resultDialogError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
                  {resultDialogError}
                </div>
              )}

              {resultDialogLoading ? (
                <div className="text-sm text-slate-600">Loading...</div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Custom Result
                    </label>
                    <textarea
                      className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={customResult}
                      onChange={(e) => setCustomResult(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Comments
                    </label>
                    <textarea
                      className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={labComment}
                      onChange={(e) => setLabComment(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Worksheet Instructions
                    </label>
                    <textarea
                      className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={worksheetText}
                      onChange={(e) => setWorksheetText(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeResultDialog}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
                  disabled={resultDialogLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitLabTestWithResults}
                  className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
                  disabled={resultDialogLoading}
                >
                  Save &amp; Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


