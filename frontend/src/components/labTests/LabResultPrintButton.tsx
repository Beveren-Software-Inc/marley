import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Printer } from 'lucide-react'
import {
  LAB_TEST_EXTERNAL_PRINT_FORMAT,
  LAB_TEST_PRINT_FORMAT,
  openLabTestResultReportPrint,
} from '../../utils/printLabTestResultReport'

type Props = {
  labTestName: string
  /** When true, show Laboratory Report + External Lab Report dropdown. */
  showExternalOption?: boolean
  title?: string
  className?: string
}

/**
 * Print control for lab results.
 * - Default: single button → Laboratory Report (Lab Test Print)
 * - When ``showExternalOption``: dropdown with both formats
 */
export function LabResultPrintButton({
  labTestName,
  showExternalOption = false,
  title = 'Print',
  className = 'inline-flex h-7 items-center justify-center gap-0.5 rounded-md border border-teal-300 bg-white px-1.5 text-teal-700 hover:bg-teal-50',
}: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const print = (format: string) => {
    openLabTestResultReportPrint(labTestName, format)
    setOpen(false)
  }

  const updatePosition = () => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 4,
      right: typeof window !== 'undefined' ? window.innerWidth - rect.right : 0,
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const inButton = containerRef.current?.contains(target)
      const inMenu = target.closest('[data-lab-result-print-menu]')
      if (!inButton && !inMenu) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!showExternalOption) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => print(LAB_TEST_PRINT_FORMAT)}
        className={className}
      >
        <Printer className="h-3.5 w-3.5" />
      </button>
    )
  }

  const menuEl =
    open && position && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-lab-result-print-menu
            className="fixed z-[9999] min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            style={{ top: position.top, right: position.right, left: 'auto' }}
          >
            <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
              Print format
            </div>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => print(LAB_TEST_PRINT_FORMAT)}
            >
              Laboratory Report
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => print(LAB_TEST_EXTERNAL_PRINT_FORMAT)}
            >
              External Lab Report
            </button>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={className}
      >
        <Printer className="h-3.5 w-3.5" />
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {menuEl}
    </div>
  )
}
