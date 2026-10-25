import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'

type PriceReportData = {
    lab_tests?: Array<{
        name: string
        lab_test_name?: string
        lab_test_rate?: number
        op_rate?: number
        price?: number
        item?: string
    }>
    services?: Array<{
        name: string
        service_name?: string
        rate?: number
        op_rate?: number
        item_code?: string
    }>
    packages?: Array<{
        name: string
        package_name?: string
        package_category?: string
        no_of_days?: number
        package_rate?: number
        base_total?: number
        active?: number
        cost_center?: string
        duration_pricing?: Array<{
            name?: string
            duration_class?: string
            from_day?: number
            to_day?: number
            amount?: number
        }>
    }>
}

type ReportTab = 'lab' | 'services' | 'packages'

type EditableRate = {
    doctype: string
    name: string
    fieldname: string
}

const tabs: { id: ReportTab; label: string }[] = [
    { id: 'lab', label: 'Lab Test Prices' },
    { id: 'services', label: 'Healthcare Service Prices' },
    { id: 'packages', label: 'Inpatient Package Prices' },
]

const amount = (value?: number | null) =>
    Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    })

function PriceTable({
    headers,
    rows,
    editableRates = [],
    onSaveRate,
}: {
    headers: string[]
    rows: Array<Array<string | number>>
    editableRates?: Array<Array<EditableRate | null>>
    onSaveRate?: (rate: EditableRate, value: string) => Promise<void>
}) {
    const [editingCell, setEditingCell] = useState<{
        rowIndex: number
        cellIndex: number
    } | null>(null)
    const [editValue, setEditValue] = useState('')

    return (
        <div className="overflow-x-auto border border-[#cbd5e1]">
            <table className="w-full border-collapse text-sm">
                <thead className="bg-[#f1f5f9] text-left text-[#172033]">
                    <tr>
                        {headers.map((header) => (
                            <th
                                key={header}
                                className="whitespace-nowrap border border-[#cbd5e1] px-2 py-3 font-semibold"
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length > 0 ? (
                        rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-slate-50">
                                {row.map((value, cellIndex) => {
                                    const rate = editableRates[rowIndex]?.[cellIndex]
                                    const isEditing =
                                        editingCell?.rowIndex === rowIndex &&
                                        editingCell?.cellIndex === cellIndex

                                    return (
                                        <td
                                            key={cellIndex}
                                            className="border border-[#cbd5e1] px-2 py-3 text-[#172033]"
                                        >
                                            {rate != null && onSaveRate && isEditing ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.001"
                                                    value={editValue}
                                                    onChange={(event) =>
                                                        setEditValue(event.target.value)
                                                    }
                                                    onBlur={() => setEditingCell(null)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault()
                                                            void onSaveRate(rate, editValue)
                                                            setEditingCell(null)
                                                        }
                                                        if (event.key === 'Escape') {
                                                            setEditingCell(null)
                                                        }
                                                    }}
                                                    className="w-28 rounded border border-slate-300 px-2 py-1"
                                                    autoFocus
                                                />
                                            ) : rate != null && onSaveRate ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingCell({ rowIndex, cellIndex })
                                                        setEditValue(String(value).replace(/,/g, ''))
                                                    }}
                                                    className="cursor-pointer rounded px-1 py-0.5 text-left hover:bg-blue-50"
                                                    title="Click to edit rate"
                                                >
                                                    {value}
                                                </button>
                                            ) : (
                                                value
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td
                                colSpan={headers.length}
                                className="border border-[#cbd5e1] px-3 py-8 text-center text-slate-500"
                            >
                                No records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

function exportPriceReport(
    headers: string[],
    rows: Array<Array<string | number>>,
    mode: 'pdf' | 'excel',
    filename: string,
) {
    const tableRows = rows
        .map(
            (row) =>
                `<tr>${row
                    .map((value) => `<td>${String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`)
                    .join('')}</tr>`,
        )
        .join('')

    const html = `
    <h2>${filename}</h2>
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `

    const doc = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 16px; }
          h2 { font-size: 16px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #333; padding: 5px; text-align: left; }
          th { background: #f1f5f9; }
          @page { size: A4 landscape; margin: 10mm; }
        </style>
      </head>
      <body>${html}</body>
    </html>`

    if (mode === 'pdf') {
        const win = window.open('', '_blank')
        if (!win) {
            toast.error('Allow pop-ups to export PDF.')
            return
        }

        win.document.write(
            doc + '<script>window.onload = () => window.print()</scr' + 'ipt>',
        )
        win.document.close()
        return
    }

    const blob = new Blob([doc], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename.replace(/[^a-z0-9-_]/gi, '_')}.xls`
    link.click()
    URL.revokeObjectURL(url)
}

export function PriceReport() {
    const [activeTab, setActiveTab] = useState<ReportTab>('lab')
    const [data, setData] = useState<PriceReportData | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let cancelled = false

        const loadReport = async () => {
            setLoading(true)
            setData(null)

            try {
                const result = await apiRequest<PriceReportData>(
                    `/api/method/healthcare.api.reception_reports.get_price_report?report_type=${activeTab}`,
                )

                if (!cancelled) {
                    setData(result)
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load price report',
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void loadReport()

        return () => {
            cancelled = true
        }
    }, [activeTab])

    const saveRate = async (
        rate: EditableRate,
        value: string,
    ): Promise<void> => {
        const parsedValue = Number(value)

        if (
            value.trim() === '' ||
            !Number.isFinite(parsedValue) ||
            parsedValue < 0
        ) {
            toast.error('Enter a valid non-negative price.')
            return
        }

        try {
            await apiRequest(
                '/api/method/healthcare.api.reception_reports.update_price_report_rate',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        doctype: rate.doctype,
                        name: rate.name,
                        fieldname: rate.fieldname,
                        value: parsedValue,
                    }),
                },
            )

            toast.success('Price updated successfully.')

            const result = await apiRequest<PriceReportData>(
                `/api/method/healthcare.api.reception_reports.get_price_report?report_type=${activeTab}`,
            )
            setData(result)
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Failed to update price.',
            )
        }
    }

    const labTests = data?.lab_tests || []
    const services = data?.services || []
    const packages = data?.packages || []

    const labRows = labTests.map((row) => [
        row.lab_test_name || row.name,
        row.item || '—',
        amount(row.lab_test_rate),
        amount(row.op_rate),
        amount(row.price),
    ])

    const labEditableRates = labTests.map((row) => [
        null,
        null,
        {
            doctype: 'Lab Test Template',
            name: row.name,
            fieldname: 'lab_test_rate',
        },
        {
            doctype: 'Lab Test Template',
            name: row.name,
            fieldname: 'op_rate',
        },
        {
            doctype: 'Lab Test Template',
            name: row.name,
            fieldname: 'price',
        },
    ])

    const serviceRows = services.map((row) => [
        row.service_name || row.name,
        row.item_code || '—',
        amount(row.rate),
        amount(row.op_rate),
    ])

    const serviceEditableRates = services.map((row) => [
        null,
        null,
        {
            doctype: 'Healthcare Service Template',
            name: row.name,
            fieldname: 'rate',
        },
        {
            doctype: 'Healthcare Service Template',
            name: row.name,
            fieldname: 'op_rate',
        },
    ])

    const packageRows = packages.map((row) => [
        row.package_name || row.name,
        row.package_category || '—',
        row.no_of_days ?? '—',
        amount(row.package_rate),
        amount(row.base_total),
        row.active ? 'Active' : 'Inactive',
    ])

    const packageEditableRates = packages.map((row) => [
        null,
        null,
        null,
        {
            doctype: 'Inpatient Package',
            name: row.name,
            fieldname: 'package_rate',
        },
        {
            doctype: 'Inpatient Package',
            name: row.name,
            fieldname: 'base_total',
        },
        null,
    ])

    const durationRows = packages.flatMap((pkg) =>
        (pkg.duration_pricing || []).map((duration) => [
            pkg.package_name || pkg.name,
            duration.duration_class || '—',
            duration.from_day ?? '—',
            duration.to_day ?? 'Open-ended',
            amount(duration.amount),
        ]),
    )

    const durationEditableRates = packages.flatMap((pkg) =>
        (pkg.duration_pricing || []).map((duration) => [
            null,
            null,
            null,
            null,
            duration.name
                ? {
                    doctype: 'Inpatient Package Duration',
                    name: duration.name,
                    fieldname: 'amount',
                }
                : null,
        ]),
    )


    const exportMessage = (mode: 'pdf' | 'excel') => {
        if (activeTab === 'lab') {
            exportPriceReport(
                ['Test Name', 'Item Code', 'IP Rate', 'OP Rate', 'General Price'],
                labRows,
                mode,
                'Lab Test Prices',
            )
        } else if (activeTab === 'services') {
            exportPriceReport(
                ['Service Name', 'Item Code', 'IP Rate', 'OP Rate'],
                serviceRows,
                mode,
                'Healthcare Service Prices',
            )
        } else {
            const packageHeaders = [
                'Package Name',
                'Room Category',
                'Days',
                'Base Rate',
                'Base Total',
                'Status',
            ]

            const durationHeaders = [
                'Package Name',
                'Duration',
                'From Day',
                'To Day',
                'Amount',
            ]

            const escapeHtml = (value: string | number) =>
                String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')

            const tableHtml = (
                headers: string[],
                rows: Array<Array<string | number>>,
            ) => `
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    `

            const html = `
      <h2>Inpatient Packages</h2>
      ${tableHtml(packageHeaders, packageRows)}
      <h2>Package Duration Pricing</h2>
      ${tableHtml(durationHeaders, durationRows)}
    `

            const doc = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 16px; }
            h2 { font-size: 16px; margin: 20px 0 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #333; padding: 5px; text-align: left; }
            th { background: #f1f5f9; }
            @page { size: A4 landscape; margin: 10mm; }
          </style>
        </head>
        <body>${html}</body>
      </html>`

            if (mode === 'pdf') {
                const win = window.open('', '_blank')
                if (!win) {
                    toast.error('Allow pop-ups to export PDF.')
                    return
                }

                win.document.write(
                    doc + '<script>window.onload = () => window.print()</scr' + 'ipt>',
                )
                win.document.close()
                return
            }

            const blob = new Blob([doc], {
                type: 'application/vnd.ms-excel',
            })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'Inpatient_Package_Prices.xls'
            link.click()
            URL.revokeObjectURL(url)
        }
    }


    return (
        <div className="p-4">
            <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id
                                ? 'border-primary bg-primary text-white'
                                : 'border-[#cbd5e1] bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => exportMessage('pdf')}
                    disabled={loading || !data}
                    className="rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    Export PDF
                </button>

                <button
                    type="button"
                    onClick={() => exportMessage('excel')}
                    disabled={loading || !data}
                    className="rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    Export Excel
                </button>
            </div>

            {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">
                    Loading prices…
                </div>
            ) : (
                <>
                    {activeTab === 'lab' && (
                        <PriceTable
                            headers={[
                                'Test Name',
                                'Item Code',
                                'IP Rate',
                                'OP Rate',
                                'General Price',
                            ]}
                            rows={labRows}
                            editableRates={labEditableRates}
                            onSaveRate={saveRate}
                        />
                    )}

                    {activeTab === 'services' && (
                        <PriceTable
                            headers={[
                                'Service Name',
                                'Item Code',
                                'IP Rate',
                                'OP Rate',
                            ]}
                            rows={serviceRows}
                            editableRates={serviceEditableRates}
                            onSaveRate={saveRate}
                        />
                    )}

                    {activeTab === 'packages' && (
                        <>
                            <h4 className="mb-3 font-semibold text-slate-800">
                                Inpatient Packages
                            </h4>

                            <PriceTable
                                headers={[
                                    'Package Name',
                                    'Room Category',
                                    'Days',
                                    'Base Rate',
                                    'Base Total',
                                    'Status',
                                ]}
                                rows={packageRows}
                                editableRates={packageEditableRates}
                                onSaveRate={saveRate}
                            />

                            <h4 className="mb-3 mt-5 font-semibold text-slate-800">
                                Package Duration Pricing
                            </h4>

                            <PriceTable
                                headers={[
                                    'Package Name',
                                    'Duration',
                                    'From Day',
                                    'To Day',
                                    'Amount',
                                ]}
                                rows={durationRows}
                                editableRates={durationEditableRates}
                                onSaveRate={saveRate}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    )
}