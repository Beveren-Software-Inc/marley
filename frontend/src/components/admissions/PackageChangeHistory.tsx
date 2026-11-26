import type { AdmissionPackageChange } from '../../services/inpatientRecords'

export function PackageChangeHistory({ changes, currency = 'BHD' }: { changes: AdmissionPackageChange[]; currency?: string }) {
  const selection = (name: string | null | undefined, mode: string | null | undefined, price: number | null | undefined) =>
    `${name === '__custom__' ? 'Custom Package' : name || 'No package'} ${mode || 'Legacy'} / ${price == null ? 'Price unavailable' : `${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`}`
  const priceNote = 'Current configured price; the historical selection price was not recorded.'
  if (!changes.length) return null
  return <section className="mt-5" aria-label="Package change history">
    <h3 className="text-sm font-semibold text-slate-900">Package change history</h3>
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>
          <th className="px-3 py-2">Changed on / by</th><th className="px-3 py-2">Previous package</th><th className="px-3 py-2">New package</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{changes.map((change) => <tr key={change.name}>
          <td className="px-3 py-2"><p>{change.changed_on}</p><p className="text-slate-500">{change.changed_by}</p></td>
          <td className="px-3 py-2" title={change.previous_price_from_current_config ? priceNote : undefined}>
            {selection(change.previous_package, change.previous_mode, change.previous_package_price)}
          </td>
          <td className="px-3 py-2" title={change.new_price_from_current_config ? priceNote : undefined}>
            {selection(change.new_package, change.new_mode, change.new_package_price)}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}
