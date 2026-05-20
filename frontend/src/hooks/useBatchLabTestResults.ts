import { useCallback, useEffect, useMemo, useState } from 'react'
import { saveAndSubmitLabTest, type LabTest } from '../services/labTests'
import { showLabTestRuleFeedback } from '../utils/labTestRuleFeedback'
import { toast } from './useToast'

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim()
}

export function useBatchLabTestResults(
  labTests: LabTest[],
  canEditRow: (labTest: LabTest) => boolean,
  batchLabTechnician: string,
  onPendingCountChange?: (count: number) => void,
  onBatchSavingChange?: (saving: boolean) => void,
  onAfterSave?: () => void | Promise<void>
) {
  const [pendingResults, setPendingResults] = useState<Record<string, string>>({})
  const [pendingLabTech, setPendingLabTech] = useState<Record<string, string>>({})
  const [pendingLabTechLabels, setPendingLabTechLabels] = useState<Record<string, string>>({})
  const [batchSaving, setBatchSaving] = useState(false)

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

  const commitEditToPending = useCallback((labTest: LabTest, value: string) => {
    const trimmed = value.trim()
    const original = (labTest.custom_result ?? '').trim()
    setPendingResults((prev) => {
      const next = { ...prev }
      if (trimmed === original) delete next[labTest.name]
      else next[labTest.name] = value
      return next
    })
  }, [])

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
      return (labTest.lab_technician_name || '').trim() || labTest.lab_technician || ''
    },
    [pendingLabTech, pendingLabTechLabels]
  )

  const resolveLabTechnicianId = useCallback(
    (labTest: LabTest) =>
      pendingLabTech[labTest.name]?.trim() ||
      batchLabTechnician.trim() ||
      (labTest.lab_technician || '').trim(),
    [pendingLabTech, batchLabTechnician]
  )

  const savePendingChanges = useCallback(async () => {
    const dirtyTests = labTests.filter((lt) => isDirty(lt))
    if (!dirtyTests.length) {
      toast.info('No result changes to save.')
      return
    }

    const missingTech = dirtyTests.filter((lt) => !resolveLabTechnicianId(lt))
    if (missingTech.length) {
      toast.error(
        missingTech.length === 1
          ? 'This test has no lab technician. Pick one in the row or in the header, then Save.'
          : `${missingTech.length} tests have no lab technician. Pick one in the header or on each row, then Save.`
      )
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

    for (const lt of dirtyTests) {
      try {
        const headerOrPending =
          pendingLabTech[lt.name]?.trim() || batchLabTechnician.trim()
        const payload: { custom_result: string; lab_technician?: string } = {
          custom_result: pendingResults[lt.name] ?? '',
        }
        if (headerOrPending) {
          payload.lab_technician = headerOrPending
        }
        const res = await saveAndSubmitLabTest(lt.name, payload)
        mergedRuleFeedback.rule_warnings?.push(...(res.rule_warnings || []))
        mergedRuleFeedback.rule_errors?.push(...(res.rule_errors || []))
        mergedRuleFeedback.calculated_updates?.push(...(res.calculated_updates || []))
        savedNames.push(lt.name)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save result'
        errors.push(`${lt.lab_test_name || lt.name}: ${msg}`)
      }
    }

    if (savedNames.length) {
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
  }, [labTests, isDirty, pendingResults, pendingLabTech, batchLabTechnician, onAfterSave, resolveLabTechnicianId])

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
