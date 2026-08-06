import { useEffect, useState } from 'react'
import { fetchSleepingPattern, type SleepingPatternDoc } from '../../services/sleepingPattern'

interface SleepingPatternDetailProps {
  name: string
}

export const SleepingPatternDetail = ({ name }: SleepingPatternDetailProps) => {
  const [doc, setDoc] = useState<SleepingPatternDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchSleepingPattern(name)
        setDoc(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [name])

  if (loading) return <div className="text-sm text-slate-600">Loading...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!doc) return null

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    try {
      const d = new Date(value)
      if (isNaN(d.getTime())) return value
      return d.toLocaleString()
    } catch {
      return value
    }
  }

  const toHours = (value: number | string | null | undefined) => {
    if (typeof value === 'number') return value
    if (value == null || value === '') return 0
    const n = parseFloat(String(value))
    return Number.isFinite(n) ? n : 0
  }

  const totalHours =
    toHours(doc.morning_total) + toHours(doc.evening_total) + toHours(doc.night_total)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-slate-500">Date</div>
            <div className="text-slate-900">
              {doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Branch</div>
            <div className="text-slate-900">{doc.branch || '-'}</div>
          </div>
          <div>
            <div className="text-slate-500">Total Hours</div>
            <div className="text-slate-900">
              {totalHours ? totalHours.toFixed(2) : '-'}
            </div>
          </div>
          <div>
            <div className="text-slate-500">User</div>
            <div className="text-slate-900">{doc.user || '-'}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Morning</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-500">From</div>
            <div className="text-slate-900">{formatDateTime(doc.morning_from)}</div>
          </div>
          <div>
            <div className="text-slate-500">To</div>
            <div className="text-slate-900">{formatDateTime(doc.morning_to)}</div>
          </div>
          <div>
            <div className="text-slate-500">Total</div>
            <div className="text-slate-900">{doc.morning_total || '-'}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Evening</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-500">From</div>
            <div className="text-slate-900">{formatDateTime(doc.evening_from)}</div>
          </div>
          <div>
            <div className="text-slate-500">To</div>
            <div className="text-slate-900">{formatDateTime(doc.evening_to)}</div>
          </div>
          <div>
            <div className="text-slate-500">Total</div>
            <div className="text-slate-900">{doc.evening_total || '-'}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Night</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-500">From</div>
            <div className="text-slate-900">{formatDateTime(doc.night_from)}</div>
          </div>
          <div>
            <div className="text-slate-500">To</div>
            <div className="text-slate-900">{formatDateTime(doc.night_to)}</div>
          </div>
          <div>
            <div className="text-slate-500">Total</div>
            <div className="text-slate-900">{doc.night_total || '-'}</div>
          </div>
        </div>
      </div>

      {doc.sleep_comment ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Comment</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-800 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            {doc.sleep_comment}
          </p>
        </div>
      ) : null}
    </div>
  )
}

