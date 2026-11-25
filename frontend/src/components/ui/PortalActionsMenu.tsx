import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const PORTAL_ACTIONS_MENU_ATTR = 'data-portal-actions-menu'

/** Gap (px) between the trigger and the menu. */
const TRIGGER_GAP = 4
/** Minimum distance (px) the menu keeps from the viewport edges. */
const VIEWPORT_MARGIN = 8
/**
 * Floor used for flip decisions so a not-yet-measured (or very short) menu still
 * opens upward on bottom rows instead of spilling off-screen.
 */
const FLIP_HEIGHT_FLOOR = 220

export type PortalActionsMenuPlacement = 'auto' | 'below-right' | 'above-right'

export interface PortalActionsMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  children: ReactNode
  /**
   * Preferred side of the trigger. `auto` (default) opens on whichever side has
   * room; explicit values are only a preference — the menu still flips when the
   * requested side has no room, so no action is ever pushed off-screen.
   */
  placement?: PortalActionsMenuPlacement
  /** Optional min-width for the menu (default 160) */
  minWidth?: number
  /** Optional max-width so the menu does not span the whole page */
  maxWidth?: number
  /**
   * Optional max-height for the menu (with overflow scroll). It is always capped
   * to the space left between the trigger and the viewport edge.
   */
  maxHeight?: number
}

interface PositionConstraints {
  placement: PortalActionsMenuPlacement
  minWidth: number
  maxWidth?: number
  maxHeight?: number
}

interface MenuPosition {
  top?: number
  bottom?: number
  right: number
  maxWidth: number
  maxHeight: number
  /** false while the menu is mounted only to be measured (rendered invisible). */
  ready: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Work out where the menu has to sit so that the whole menu stays inside the
 * viewport: flip above the trigger when there is more room up there, and clamp
 * width/height to what is actually available.
 */
function resolvePosition(
  trigger: HTMLElement,
  menu: HTMLElement | null,
  { placement, minWidth, maxWidth, maxHeight }: PositionConstraints,
  ready = true
): MenuPosition {
  const rect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Natural size (scrollHeight is not shrunk by the max-height we apply), so the
  // flip decision stays stable after the menu gets clamped. Use a floor so the
  // first paint (height still 0) still flips up for bottom-of-list triggers.
  const measuredHeight = menu ? Math.max(menu.offsetHeight, menu.scrollHeight) : 0
  const menuHeight = Math.max(measuredHeight, FLIP_HEIGHT_FLOOR)
  const resolvedMaxWidth = Math.max(
    Math.min(maxWidth ?? viewportWidth - VIEWPORT_MARGIN * 2, viewportWidth - VIEWPORT_MARGIN * 2),
    0
  )
  const menuWidth = menu?.offsetWidth ?? Math.min(minWidth, resolvedMaxWidth)

  const spaceBelow = viewportHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN
  const fitsBelow = menuHeight <= spaceBelow
  const fitsAbove = menuHeight <= spaceAbove

  let openAbove: boolean
  if (placement === 'above-right') {
    openAbove = fitsAbove || !fitsBelow || spaceAbove >= spaceBelow
  } else if (placement === 'below-right') {
    // Explicit below is still only a preference — never clip off the bottom.
    openAbove = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow)
  } else if (fitsBelow && fitsAbove) {
    // Both sides fit: prefer below, but flip up when the trigger is in the lower
    // part of the viewport (typical last rows in appointment/action lists).
    openAbove = spaceBelow < FLIP_HEIGHT_FLOOR && spaceAbove > spaceBelow
  } else if (fitsAbove) {
    openAbove = true
  } else if (fitsBelow) {
    openAbove = false
  } else {
    // Taller than either side: use the roomier side and scroll inside the menu.
    openAbove = spaceAbove > spaceBelow
  }

  const availableHeight = Math.max(openAbove ? spaceAbove : spaceBelow, 0)
  const resolvedMaxHeight = Math.max(
    maxHeight != null ? Math.min(maxHeight, availableHeight) : availableHeight,
    0
  )

  // Right-align to the trigger, but pull the menu back inside the viewport when
  // the trigger sits too close to the left edge for the menu width.
  const right = clamp(
    viewportWidth - rect.right,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN)
  )

  if (openAbove) {
    return {
      bottom: viewportHeight - rect.top + TRIGGER_GAP,
      right,
      maxWidth: resolvedMaxWidth,
      maxHeight: resolvedMaxHeight,
      ready,
    }
  }

  return {
    top: rect.bottom + TRIGGER_GAP,
    right,
    maxWidth: resolvedMaxWidth,
    maxHeight: resolvedMaxHeight,
    ready,
  }
}

/** How long the menu may stay hidden while waiting for the trigger ref. */
const REVEAL_FALLBACK_MS = 150
/** Frames to wait for the trigger ref before falling back to a fixed spot. */
const MAX_TRIGGER_WAIT_FRAMES = 3

/** Safe spot used when the trigger cannot be measured: never leaves actions hidden. */
function defaultPosition(): MenuPosition {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  return {
    top: VIEWPORT_MARGIN,
    right: VIEWPORT_MARGIN,
    maxWidth: Math.max(viewportWidth - VIEWPORT_MARGIN * 2, 0),
    maxHeight: Math.max(viewportHeight - VIEWPORT_MARGIN * 2, 0),
    ready: true,
  }
}

function positionsMatch(a: MenuPosition | null, b: MenuPosition | null): boolean {
  if (!a || !b) return a === b
  const near = (x?: number, y?: number) => Math.abs((x ?? 0) - (y ?? 0)) < 0.5
  return (
    a.ready === b.ready &&
    near(a.top, b.top) &&
    near(a.bottom, b.bottom) &&
    near(a.right, b.right) &&
    near(a.maxWidth, b.maxWidth) &&
    near(a.maxHeight, b.maxHeight)
  )
}

export function PortalActionsMenu({
  open,
  onClose,
  triggerRef,
  children,
  placement = 'auto',
  minWidth = 160,
  maxWidth,
  maxHeight,
}: PortalActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const retryFrameRef = useRef<number | null>(null)
  const revealTimeoutRef = useRef<number | null>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  /** Set the position, skipping no-op updates so ResizeObserver cannot loop. */
  const applyPosition = useCallback(
    (resolve: (prev: MenuPosition | null) => MenuPosition | null) => {
      setPosition((prev) => {
        const next = resolve(prev)
        return positionsMatch(prev, next) ? prev : next
      })
    },
    []
  )

  const measure = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return
    applyPosition(() => resolvePosition(trigger, menuRef.current, { placement, minWidth, maxWidth, maxHeight }))
  }, [applyPosition, triggerRef, placement, minWidth, maxWidth, maxHeight])

  const cancelPending = useCallback(() => {
    if (retryFrameRef.current != null) {
      cancelAnimationFrame(retryFrameRef.current)
      retryFrameRef.current = null
    }
    if (revealTimeoutRef.current != null) {
      window.clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
  }, [])

  useEffect(() => cancelPending, [cancelPending])

  /**
   * Measure as soon as the portalled menu is committed. The ref callback runs in
   * the commit phase, so the flip/clamp is applied before the browser paints and
   * the menu never shows up half off-screen.
   */
  const attachMenu = useCallback(
    (node: HTMLDivElement | null) => {
      cancelPending()
      menuRef.current = node
      if (!node) {
        applyPosition(() => null)
        return
      }

      /** Returns true once the position is settled (or the node went stale). */
      const settle = (): boolean => {
        if (menuRef.current !== node) return true
        if (triggerRef.current) {
          measure()
          return true
        }
        return false
      }

      if (settle()) return

      // Callers usually attach the trigger ref only while the menu is open, and
      // this portal ref is committed before that ref, so wait a few frames.
      let frames = 0
      const attempt = () => {
        retryFrameRef.current = null
        if (settle()) return
        frames += 1
        if (frames < MAX_TRIGGER_WAIT_FRAMES) {
          retryFrameRef.current = requestAnimationFrame(attempt)
          return
        }
        // Never keep the actions hidden: show them at a safe spot instead.
        applyPosition((prev) => prev ?? defaultPosition())
      }
      retryFrameRef.current = requestAnimationFrame(attempt)

      revealTimeoutRef.current = window.setTimeout(() => {
        revealTimeoutRef.current = null
        if (!settle()) applyPosition((prev) => prev ?? defaultPosition())
      }, REVEAL_FALLBACK_MS)
    },
    [applyPosition, cancelPending, measure, triggerRef]
  )

  // Re-measure after mount/paint as a safety net for late layout work.
  useEffect(() => {
    if (!open) return
    measure()
  }, [open, measure])

  // Content can grow after the first paint (async labels, icons, fonts).
  useEffect(() => {
    if (!open) return
    const node = menuRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(node)
    return () => observer.disconnect()
  }, [open, measure])

  // Keep the menu anchored to its trigger (and flipped correctly) while scrolling.
  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => measure()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, measure])

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
  }, [open, onClose, triggerRef])

  if (!open || typeof document === 'undefined') return null

  // Hidden only for the very first paint; the ref callback (or the fallback
  // timer) replaces it with the measured position in the same commit.
  const placementStyle: MenuPosition = position ?? { ...defaultPosition(), ready: false }

  const menuEl = (
    <div
      ref={attachMenu}
      {...{ [PORTAL_ACTIONS_MENU_ATTR]: true }}
      className="fixed z-[9999] rounded-md border border-slate-200 bg-white py-1 shadow-lg overflow-y-auto overflow-x-hidden"
      style={{
        top: placementStyle.top,
        bottom: placementStyle.bottom,
        right: placementStyle.right,
        left: 'auto',
        minWidth,
        maxWidth: placementStyle.maxWidth,
        maxHeight: placementStyle.maxHeight,
        visibility: placementStyle.ready ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  )

  return createPortal(menuEl, document.body)
}

