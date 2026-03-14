import { useState, useLayoutEffect, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const PORTAL_ACTIONS_MENU_ATTR = 'data-portal-actions-menu'

export interface PortalActionsMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  children: ReactNode
  /** 'below-right' = menu below trigger, right-aligned. 'above-right' = menu above trigger, right-aligned. */
  placement?: 'below-right' | 'above-right'
  /** Optional min-width for the menu (default 160) */
  minWidth?: number
  /** Optional max-width so the menu does not span the whole page */
  maxWidth?: number
  /** Optional max-height for the menu (with overflow scroll). If not set, no max height. */
  maxHeight?: number
}

export function PortalActionsMenu({
  open,
  onClose,
  triggerRef,
  children,
  placement = 'below-right',
  minWidth = 160,
  maxWidth,
  maxHeight,
}: PortalActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    if (placement === 'above-right') {
      setPosition({
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      })
    } else {
      setPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    // Defer position read so trigger ref is set after React commits (ref is conditional on open)
    const id = requestAnimationFrame(() => {
      updatePosition()
    })
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inMenu = menuRef.current?.contains(target)
      if (!inTrigger && !inMenu) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open || !position || typeof document === 'undefined') return null

  const menuEl = (
    <div
      ref={menuRef}
      {...{ [PORTAL_ACTIONS_MENU_ATTR]: true }}
      className="fixed z-[9999] rounded-md border border-slate-200 bg-white py-1 shadow-lg overflow-y-auto"
      style={{
        top: position.top,
        bottom: position.bottom,
        right: position.right,
        left: 'auto',
        minWidth,
        ...(maxWidth != null && { maxWidth }),
        ...(maxHeight != null && { maxHeight }),
      }}
    >
      {children}
    </div>
  )

  return createPortal(menuEl, document.body)
}
