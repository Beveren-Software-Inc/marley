import { useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  MODAL_ERROR_BOX_CLASS,
} from '../ui/CreateModalChrome'
import { createQualityIndicator } from '../../services/qualityIndicators'
import { toast } from '../../hooks/useToast'

const CATEGORIES = [
  'Patient Safety',
  'Clinical Effectiveness',
  'Patient Experience',
  'Timeliness & Access',
  'Documentation & Compliance',
]

const FREQUENCIES = ['Monthly', 'Quarterly', 'Annual']

const SELECTION_CRITERIA: { key: keyof typeof defaultCriteria; label: string }[] = [
  { key: 'criteria_patient_safety_goals', label: 'Patient Safety Goals' },
  { key: 'criteria_high_cost', label: 'High Cost' },
  { key: 'criteria_high_volume', label: 'High Volume' },
  { key: 'criteria_problem_prone', label: 'Problem Prone' },
  { key: 'criteria_study_for_improvement', label: 'Selected Study for Improvement' },
  { key: 'criteria_hospital_requirement', label: 'Hospital Requirement' },
]

const defaultCriteria = {
  criteria_patient_safety_goals: false,
  criteria_high_cost: false,
  criteria_high_volume: false,
  criteria_problem_prone: false,
  criteria_study_for_improvement: false,
  criteria_hospital_requirement: false,
}

interface CreateQualityIndicatorModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export const CreateQualityIndicatorModal = ({ onClose, onSuccess }: CreateQualityIndicatorModalProps) => {
  const [form, setForm] = useState({
    area_monitored: '',
    indicator_name: '',
    indicator_code: '',
    category: 'Patient Safety',
    numerator_description: '',
    denominator_description: '',
    indicator_formula: '',
    source_of_data: '',
    responsible_person: '',
    reported_to: '',
    frequency: 'Monthly',
    is_active: true,
    ...defaultCriteria,
    target_value: '',
    target_direction: 'Higher is better',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.indicator_name.trim()) {
      setError('Indicator Name is required')
      return
    }
    if (!form.category) {
      setError('Category is required')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await createQualityIndicator({
        area_monitored: form.area_monitored.trim() || undefined,
        indicator_name: form.indicator_name.trim(),
        indicator_code: form.indicator_code.trim() || undefined,
        category: form.category,
        numerator_description: form.numerator_description.trim() || undefined,
        denominator_description: form.denominator_description.trim() || undefined,
        indicator_formula: form.indicator_formula.trim() || undefined,
        source_of_data: form.source_of_data.trim() || undefined,
        responsible_person: form.responsible_person.trim() || undefined,
        reported_to: form.reported_to.trim() || undefined,
        frequency: form.frequency,
        is_active: form.is_active,
        criteria_patient_safety_goals: form.criteria_patient_safety_goals,
        criteria_high_cost: form.criteria_high_cost,
        criteria_high_volume: form.criteria_high_volume,
        criteria_problem_prone: form.criteria_problem_prone,
        criteria_study_for_improvement: form.criteria_study_for_improvement,
        criteria_hospital_requirement: form.criteria_hospital_requirement,
        unit: 'Percentage',
        target_value: form.target_value ? Number(form.target_value) : undefined,
        target_direction: form.target_direction,
      })
      toast.success('Quality indicator created')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quality indicator')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('w-full max-w-2xl max-h-[90vh]')}>
        <CreateModalHeader title="KPI Report" subtitle="Quality Indicator" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto px-6 py-5 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={MODAL_LABEL_CLASS}>Area Monitored</label>
                <input
                  type="text"
                  value={form.area_monitored}
                  onChange={(e) => handleChange('area_monitored', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. In-Patient, Nursing"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Category <span className="text-red-500">*</span></label>
                <select
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Indicator Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.indicator_name}
                  onChange={(e) => handleChange('indicator_name', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. Percentage of Complete Nursing Assessment in In-Patient"
                />
              </div>
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Numerator</label>
                <textarea
                  rows={2}
                  value={form.numerator_description}
                  onChange={(e) => handleChange('numerator_description', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="Number of complete nursing assessments"
                />
                <p className="mt-1 text-xs text-slate-500">
                  The count that meets the standard (the top of the fraction).
                </p>
              </div>
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Denominator</label>
                <textarea
                  rows={2}
                  value={form.denominator_description}
                  onChange={(e) => handleChange('denominator_description', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="Total in-patient nursing assessments"
                />
                <p className="mt-1 text-xs text-slate-500">
                  The total eligible cases (the bottom of the fraction).
                </p>
              </div>
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Indicator</label>
                <textarea
                  rows={2}
                  value={form.indicator_formula}
                  onChange={(e) => handleChange('indicator_formula', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="(Numerator / Denominator) × 100"
                />
              </div>
            </div>

            <div className={`${MODAL_SECTION_CLASS} mt-4`}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Selection Criteria</h3>
              <div className="grid grid-cols-2 gap-2">
                {SELECTION_CRITERIA.map((c) => (
                  <label key={c.key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form[c.key]}
                      onChange={(e) => handleChange(c.key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className={MODAL_LABEL_CLASS}>Target (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.target_value}
                  onChange={(e) => handleChange('target_value', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. 95"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Target Direction</label>
                <select
                  value={form.target_direction}
                  onChange={(e) => handleChange('target_direction', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  <option value="Higher is better">Higher is better</option>
                  <option value="Lower is better">Lower is better</option>
                </select>
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => handleChange('frequency', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    className="h-4 w-4"
                  />
                  Active
                </label>
              </div>
              <div className="col-span-2">
                <label className={MODAL_LABEL_CLASS}>Source of Data</label>
                <input
                  type="text"
                  value={form.source_of_data}
                  onChange={(e) => handleChange('source_of_data', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. Nursing assessment records"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Responsible Person</label>
                <input
                  type="text"
                  value={form.responsible_person}
                  onChange={(e) => handleChange('responsible_person', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Reported To</label>
                <input
                  type="text"
                  value={form.reported_to}
                  onChange={(e) => handleChange('reported_to', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. Quality Committee"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLASS}>Indicator Code</label>
                <input
                  type="text"
                  value={form.indicator_code}
                  onChange={(e) => handleChange('indicator_code', e.target.value)}
                  className={MODAL_FIELD_CLASS}
                  placeholder="e.g. QI-01"
                />
              </div>
            </div>

            {error && (
              <div className={`${MODAL_ERROR_BOX_CLASS} mt-4`}>{error}</div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3 bg-white">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Indicator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
