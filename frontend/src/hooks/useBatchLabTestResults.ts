import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  recalculatePanelForServiceRequest,
  saveAndSubmitLabTest,
  type LabTest,
} from '../services/labTests'
import { showLabTestRuleFeedback, formatLabResultSaveError, isPanelLevelRuleMessage } from '../utils/labTestRuleFeedback'
import { toast } from './useToast'

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim()
}

export function useBatchLabTestResults(
  labTests: LabTest[],
  canEditRow: (labTest: LabTest) => boolean,
  onPendingCountChange?: (count: number) => void,
  onBatchSavingChange?: (saving: boolean) => void,
  onAfterSave?: () => void | Promise<void>,
  /** Auto-fill Lab technician when entering results (current user is Lab Technician). */
  defaultLabTechnician?: { name: string; label?: string } | null
) {
  const [pendingResults, setPendingResults] = useState<Record<string, string>>({})
  const [pendingLabTech, setPendingLabTech] = useState<Record<string, string>>({})
  const [pendingLabTechLabels, setPendingLabTechLabels] = useState<Record<string, string>>({})
  const [batchSaving, setBatchSaving] = useState(false)

  const defaultLabTechId = (defaultLabTechnician?.name || '').trim()
  const defaultLabTechLabel = (defaultLabTechnician?.label || defaultLabTechnician?.name || '').trim()

  const isDirty = useCallback(
    (labTest: LabTest) => {
      if (!canEditRow(labTest)) return false
      if (!(labTest.name in pendingResults)) return false
      return pendingResults[labTest.name] !== (labTest.custom_result ?? '')
    },
    [canEditRow, pendingResults]
  )

  const pendingCount = useMemo(
    () => labTests.filter((lt) => isDirty(lt)).length,
    [labTests, isDirty]
  )

  useEffect(() => {
    onPendingCountChange?.(pendingCount)
  }, [pendingCount, onPendingCountChange])

  useEffect(() => {
    onBatchSavingChange?.(batchSaving)
  }, [batchSaving, onBatchSavingChange])

  const getDisplayResult = useCallback(
    (labTest: LabTest) => {
      const raw =
        labTest.name in pendingResults ? pendingResults[labTest.name] : (labTest.custom_result ?? '')
      return stripHtml(String(raw))
    },
    [pendingResults]
  )

  const commitEditToPending = useCallback(
    (labTest: LabTest, value: string) => {
      const trimmed = value.trim()
      const original = (labTest.custom_result ?? '').trim()
      setPendingResults((prev) => {
        const next = { ...prev }
        if (trimmed === original) delete next[labTest.name]
        else next[labTest.name] = value
        return next
      })
      // When entering a result, auto-pick the signed-in Lab Technician if none is set yet.
      if (trimmed !== original && defaultLabTechId) {
        const existing = (labTest.lab_technician || '').trim()
        setPendingLabTech((prev) => {
          if (existing || prev[labTest.name]) return prev
          return { ...prev, [labTest.name]: defaultLabTechId }
        })
        setPendingLabTechLabels((prev) => {
          if (existing || prev[labTest.name]) return prev
          return { ...prev, [labTest.name]: defaultLabTechLabel || defaultLabTechId }
        })
      }
    },
    [defaultLabTechId, defaultLabTechLabel]
  )

  const cancelPendingFor = useCallback((labTestName: string) => {
    setPendingResults((prev) => {
      const next = { ...prev }
      delete next[labTestName]
      return next
    })
  }, [])

  const setPendingLabTechnician = useCallback(
    (labTestName: string, practitionerId: string, label?: string) => {
      setPendingLabTech((prev) => ({ ...prev, [labTestName]: practitionerId }))
      if (label) {
        setPendingLabTechLabels((prev) => ({ ...prev, [labTestName]: label }))
      }
    },
    []
  )

  const getDisplayLabTechName = useCallback(
    (labTest: LabTest) => {
      if (pendingLabTech[labTest.name]) {
        return pendingLabTechLabels[labTest.name] || pendingLabTech[labTest.name]
      }
      const existing = (labTest.lab_technician_name || '').trim() || labTest.lab_technician || ''
      if (existing) return existing
      // Show default only while this row has a pending result edit.
      if (labTest.name in pendingResults && defaultLabTechLabel) return defaultLabTechLabel
      return ''
    },
    [pendingLabTech, pendingLabTechLabels, pendingResults, defaultLabTechLabel]
  )

  const resolveLabTechnicianId = useCallback(
    (labTest: LabTest) =>
      pendingLabTech[labTest.name]?.trim() ||
      (labTest.lab_technician || '').trim() ||
      (labTest.name in pendingResults ? defaultLabTechId : '') ||
      '',
    [pendingLabTech, pendingResults, defaultLabTechId]
  )

  const savePendingChanges = useCallback(async () => {
    const dirtyTests = labTests.filter((lt) => isDirty(lt))
    if (!dirtyTests.length) {
      toast.info('No result changes to save.')
      return
    }

    setBatchSaving(true)
    const savedNames: string[] = []
    const errors: string[] = []
    const mergedRuleFeedback: Pick<
      LabTest,
      'rule_warnings' | 'rule_errors' | 'calculated_updates'
    > = {
      rule_warnings: [],
      rule_errors: [],
      calculated_updates: [],
    }

    const panelServiceRequests = new Set<string>()

    for (const lt of dirtyTests) {
      try {
        const rowLabTech = resolveLabTechnicianId(lt)
        const payload: { custom_result: string; lab_technician?: string } = {
          custom_result: pendingResults[lt.name] ?? '',
        }
        if (rowLabTech) {
          payload.lab_technician = rowLabTech
        }
        const res = await saveAndSubmitLabTest(lt.name, payload)
        if (lt.service_request) {
          panelServiceRequests.add(lt.service_request)
        }
        mergedRuleFeedback.rule_warnings?.push(...(res.rule_warnings || []))
        mergedRuleFeedback.rule_errors?.push(...(res.rule_errors || []))
        mergedRuleFeedback.calculated_updates?.push(...(res.calculated_updates || []))
        savedNames.push(lt.name)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save result'
        errors.push(formatLabResultSaveError(lt, msg))
        if (isPanelLevelRuleMessage(msg)) {
          mergedRuleFeedback.rule_errors?.push({
            type: 'sum_validation',
            short_message: msg,
            message: msg,
          })
        }
      }
    }

    // Re-run panel formulas once after the full batch so calculated fields use every saved input.
    for (const serviceRequest of panelServiceRequests) {
      try {
        const panelRecalc = await recalculatePanelForServiceRequest(serviceRequest)
        mergedRuleFeedback.rule_warnings?.push(...(panelRecalc.rule_warnings || []))
        mergedRuleFeedback.rule_errors?.push(...(panelRecalc.rule_errors || []))
        mergedRuleFeedback.calculated_updates?.push(...(panelRecalc.calculated_updates || []))
      } catch {
        /* best-effort; per-save recalc above already persisted formulas */
      }
    }

    const hasRuleFeedback =
      Boolean(mergedRuleFeedback.rule_warnings?.length) ||
      Boolean(mergedRuleFeedback.rule_errors?.length) ||
      Boolean(mergedRuleFeedback.calculated_updates?.length)

    if (savedNames.length || hasRuleFeedback) {
      showLabTestRuleFeedback(mergedRuleFeedback as LabTest)
    }

    if (savedNames.length) {
      setPendingResults((prev) => {
        const next = { ...prev }
        for (const n of savedNames) delete next[n]
        return next
      })
      setPendingLabTech((prev) => {
        const next = { ...prev }
        for (const n of savedNames) delete next[n]
        return next
      })
      setPendingLabTechLabels((prev) => {
        const next = { ...prev }
        for (const n of savedNames) delete next[n]
        return next
      })
      await onAfterSave?.()
      toast.success(savedNames.length === 1 ? '1 result saved' : `${savedNames.length} results saved`)
    }
    if (errors.length) {
      toast.error(errors[0].split('\n\n')[0] || errors[0])
    }
    setBatchSaving(false)
    return { savedCount: savedNames.length, errors }
  }, [labTests, isDirty, pendingResults, pendingLabTech, onAfterSave, resolveLabTechnicianId])

  return {
    batchSaving,
    pendingLabTech,
    isDirty,
    pendingCount,
    getDisplayResult,
    commitEditToPending,
    cancelPendingFor,
    setPendingLabTechnician,
    getDisplayLabTechName,
    savePendingChanges,
  }
}
