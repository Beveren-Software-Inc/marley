import { createRoot } from 'react-dom/client'
import ToastComponent, { type Toast, type ToastType } from '../components/ui/Toast'

let toastContainer: HTMLDivElement | null = null
let toastRoot: ReturnType<typeof createRoot> | null = null
let globalToastState: Toast[] = []

/** Keep the stack short so rapid saves (e.g. lab results) do not cover the form. */
const MAX_VISIBLE_TOASTS = 3

const getToastContainer = () => {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    // Newest toast is first in state → sits at the top of the stack.
    toastContainer.className =
      'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm'
    document.body.appendChild(toastContainer)
    toastRoot = createRoot(toastContainer)
  }
  return toastRoot!
}

const renderToasts = () => {
  const root = getToastContainer()
  root.render(
    <div className="flex flex-col gap-2">
      {globalToastState.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onClose={(id) => {
            globalToastState = globalToastState.filter((t) => t.id !== id)
            renderToasts()
          }}
        />
      ))}
    </div>
  )
}

const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
  const id = `toast-${Date.now()}-${Math.random()}`
  // Newest on top: prepend, then drop oldest from the bottom of the stack.
  globalToastState = [{ id, message, type, duration }, ...globalToastState].slice(
    0,
    MAX_VISIBLE_TOASTS
  )
  renderToasts()
}

export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
}
