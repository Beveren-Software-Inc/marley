import { useState, useEffect, useRef, useCallback } from 'react'
import { PenLine, Trash2, Check, Upload } from 'lucide-react'
import { useAuth } from '../../providers/AuthProvider'
import { isNurseRole, isDoctorRole, isAdmin } from '../../config/permissions'

export function attachFileDisplayUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

const SIGNATURE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

export interface SignaturePadProps {
  onSave: (file: File) => void
  onClear?: () => void
  existingUrl?: string
  uploading?: boolean
}

/** Canvas signature capture with optional image upload (phone photo / scanned sign).
 *
 * Nurses cannot create signatures — only doctors sign (nurse-department rule).
 * Existing signatures still display read-only for nurses.
 */
export function SignaturePad({ onSave, onClear, existingUrl, uploading }: SignaturePadProps) {
  const { user } = useAuth()
  const authRoles = user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : []
  const nurseCannotSign = isNurseRole(authRoles) && !isDoctorRole(authRoles) && !isAdmin(authRoles)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isDrawing = useRef(false)
  const dprRef = useRef(1)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [mode, setMode] = useState<'idle' | 'drawing' | 'done'>(existingUrl ? 'done' : 'idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (existingUrl) setMode('done')
  }, [existingUrl])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  /** CSS-pixel coords — context transform already accounts for devicePixelRatio. */
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    isDrawing.current = true
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasStrokes(true)
  }

  const endDraw = () => {
    isDrawing.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setupCanvas()
    setHasStrokes(false)
    onClear?.()
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
      onSave(file)
      setMode('done')
    }, 'image/png')
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setUploadError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (PNG, JPG, …)')
      return
    }
    onSave(file)
    setMode('done')
  }

  useEffect(() => {
    if (mode !== 'drawing') return
    const canvas = canvasRef.current
    if (!canvas) return

    const runSetup = () => {
      setupCanvas()
      setHasStrokes(false)
    }

    const raf = requestAnimationFrame(runSetup)
    const ro = new ResizeObserver(() => {
      if (isDrawing.current) return
      setupCanvas()
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mode, setupCanvas])

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={SIGNATURE_ACCEPT}
      className="hidden"
      onChange={handleFileSelected}
    />
  )

  if (nurseCannotSign && mode !== 'done') {
    return (
      <div className="w-full h-full min-h-[120px] flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
        <PenLine className="w-5 h-5 opacity-50" />
        <span className="text-xs font-medium">Only a doctor can sign</span>
      </div>
    )
  }

  if (mode === 'idle') {
    return (
      <div className="w-full min-h-[120px] flex flex-col gap-2">
        {fileInput}
        <div className="grid grid-cols-2 gap-2 flex-1 min-h-[120px]">
          <button
            type="button"
            onClick={() => {
              setUploadError(null)
              setMode('drawing')
            }}
            disabled={uploading}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary hover:text-primary hover:bg-blue-50/50 transition-all group disabled:opacity-50"
          >
            <PenLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">Draw</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadError(null)
              fileInputRef.current?.click()
            }}
            disabled={uploading}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary hover:text-primary hover:bg-blue-50/50 transition-all group disabled:opacity-50"
          >
            {uploading ? (
              <span className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
            ) : (
              <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Upload'}</span>
          </button>
        </div>
        {uploadError && <p className="text-xs text-red-600 text-center">{uploadError}</p>}
        <p className="text-[11px] text-slate-400 text-center leading-snug">
          Draw on screen, or upload a signature image from phone / files
        </p>
      </div>
    )
  }

  if (mode === 'done' && existingUrl) {
    return (
      <div className="w-full min-h-[120px] flex flex-col items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
        {fileInput}
        <img src={existingUrl} alt="Signature" className="max-h-20 object-contain" />
        {!nurseCannotSign && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('drawing')
                setHasStrokes(false)
              }}
              className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Re-draw
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-slate-500 hover:text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Upload className="w-3 h-3" /> Re-upload
            </button>
          </div>
        )}
      </div>
    )
  }

  // Drawing mode (or done without URL yet while upload in flight)
  if (mode === 'done' && !existingUrl) {
    return (
      <div className="w-full min-h-[120px] flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-500">
        {fileInput}
        <span className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
        <span className="text-xs">{uploading ? 'Uploading signature…' : 'Saving…'}</span>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col">
      {fileInput}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Draw signature
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-slate-400 hover:text-primary disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50"
          >
            <Upload className="w-3 h-3" /> Upload
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasStrokes}
            className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle')
              clearCanvas()
            }}
            className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <div className="relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '120px', display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
            Sign here
          </span>
        )}
      </div>
      <div className="px-2.5 py-2 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={saveSignature}
          disabled={!hasStrokes || uploading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            <>
              <Check className="w-3 h-3" /> Save signature
            </>
          )}
        </button>
      </div>
    </div>
  )
}
