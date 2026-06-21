import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../providers/AuthProvider"
import { useTheme } from "../hooks/useTheme"
import { toast } from "../hooks/useToast"
import {
  ArrowLeft,
  User,
  Palette,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Building2,
  ChevronDown,
  X,
  ShieldCheck,
  Info,
} from "lucide-react"

// ─── Cost-centre combobox ────────────────────────────────────────────────────

interface CostCenterOption { name: string; label: string }

async function fetchCostCenters(search: string): Promise<CostCenterOption[]> {
  try {
    const params = new URLSearchParams({
      doctype: "Cost Center",
      txt: search || "",
      page_length: "20",
      fields: JSON.stringify(["name"]),
    })
    const res = await fetch(`/api/method/frappe.client.get_list?${params}`)
    const data = await res.json()
    const list = Array.isArray(data?.message) ? data.message : []
    return list.map((r: any) => ({ name: r.name, label: r.name }))
  } catch { return [] }
}

interface CostCenterComboboxProps {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

const CostCenterCombobox = ({ value, onChange, disabled }: CostCenterComboboxProps) => {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<CostCenterOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try { setOptions(await fetchCostCenters(query)) }
      catch { setOptions([]) }
      finally { setLoading(false) }
    }, query.trim() === "" ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const handleSelect = (opt: CostCenterOption) => {
    setQuery(opt.label)
    onChange(opt.name)
    setOpen(false)
  }

  const handleClear = () => {
    setQuery("")
    onChange("")
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true) }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder="Search branches…"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 pr-16 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        />
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
          {query && !disabled && (
            <button type="button" onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {loading
            ? <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0
            ? <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                {loading ? "Searching…" : "No branches found"}
              </div>
            : options.map(opt => (
              <button key={opt.name} type="button"
                onClick={() => handleSelect(opt)}
                className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-primary/5 dark:hover:bg-primary/10">
                {opt.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Preferences section ─────────────────────────────────────────────────────

async function apiGetCostCenterPerm(): Promise<{ cost_center: string; is_exempt: boolean }> {
  const res = await fetch(
    "/api/method/healthcare.api.common.get_user_cost_center_permission",
    { headers: { "X-Frappe-CSRF-Token": (window as any).csrf_token || "" } }
  )
  const data = await res.json()
  if (data?.message) return data.message
  throw new Error("Failed to load branch permission")
}

async function apiSetCostCenterPerm(cost_center: string): Promise<{ status: string; cost_center: string; message?: string }> {
  const csrf = (window as any).csrf_token || ""
  const body = new URLSearchParams()
  body.set("cost_center", cost_center)
  const res = await fetch(
    "/api/method/healthcare.api.common.set_cost_center_permission",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Frappe-CSRF-Token": csrf,
      },
      body: body.toString(),
    }
  )
  const data = await res.json()
  if (data?.message) return data.message
  const exc = data?._server_messages || data?.exc
  throw new Error(exc ? JSON.parse(JSON.parse(exc)?.[0])?.message ?? "Error" : "Failed to save")
}

const PreferencesSection = () => {
  const [costCenter, setCostCenter] = useState("")
  const [savedCostCenter, setSavedCostCenter] = useState("")
  const [isExempt, setIsExempt] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await apiGetCostCenterPerm()
        setCostCenter(result.cost_center)
        setSavedCostCenter(result.cost_center)
        setIsExempt(result.is_exempt)
      } catch {
        toast.error("Failed to load branch preference.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await apiSetCostCenterPerm(costCenter)
      if (result.status === "skipped") {
        toast.success("You have elevated privileges — no restriction applied.")
      } else if (result.status === "cleared") {
        toast.success("Branch restriction removed. You can now see all data.")
        setSavedCostCenter("")
      } else {
        toast.success(`Branch set to "${result.cost_center}". Data will be filtered accordingly.`)
        setSavedCostCenter(result.cost_center)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  const isDirty = costCenter !== savedCostCenter

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6">
        <span className="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Branch Filter</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Restrict your view to a specific branch. When set, only records belonging to that branch will be visible to you.
          Leave blank to see all data.
        </p>

        {isExempt && (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-5">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Elevated privileges detected</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Your account has <strong>Administrator</strong>, <strong>System Manager</strong>, or <strong>Healthcare Administrator</strong> role.
                Branch permissions do not apply to your account and will not be created.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-gray-400" />
              Branch
            </label>
            <CostCenterCombobox
              value={costCenter}
              onChange={setCostCenter}
              disabled={isExempt}
            />
            {!isExempt && (
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Clear the field and save to remove the restriction.
              </p>
            )}
          </div>

          {savedCostCenter && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Active Restriction</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
                <Building2 className="w-4 h-4 shrink-0" />
                {savedCostCenter}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {isDirty
            ? <span className="text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
            : savedCostCenter
              ? <span>Active restriction: <strong>{savedCostCenter}</strong></span>
              : "No restriction active — you see all branches."}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty || isExempt}
          className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save Preference"}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export const SettingsPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState("profile")

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch {
      navigate("/login", { replace: true })
    }
  }

  const settingsSections = [
    { id: "profile",      name: "Profile",      icon: User },
    { id: "display",      name: "Display",       icon: Palette },
    { id: "preferences",  name: "Preferences",   icon: Building2 },
  ]

  const displayName = user?.name || "Guest User"
  const initials = displayName
    .split(" ")
    .map(w => w.charAt(0).toUpperCase())
    .join("")
    .substring(0, 2)

  const renderProfileSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-2xl">{initials}</span>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{displayName}</h3>
          <p className="text-gray-600 dark:text-gray-400">{user?.role || "User"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
          <input
            type="text"
            defaultValue={displayName}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
          <input
            type="text"
            defaultValue={user?.role || "User"}
            disabled
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  )

  const renderDisplaySettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Theme Settings</h3>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setTheme("light")}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === "light"
                ? "border-primary bg-primary/10"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
            }`}
          >
            <Sun className="w-6 h-6 mx-auto mb-2 text-gray-700 dark:text-gray-300" />
            <div className="text-sm font-medium text-gray-900 dark:text-white">Light</div>
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === "dark"
                ? "border-primary bg-primary/10"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
            }`}
          >
            <Moon className="w-6 h-6 mx-auto mb-2 text-gray-700 dark:text-gray-300" />
            <div className="text-sm font-medium text-gray-900 dark:text-white">Dark</div>
          </button>
          <button
            onClick={() => setTheme("system" as any)}
            className={`p-4 rounded-lg border-2 transition-colors ${
              theme === ("system" as any)
                ? "border-primary bg-primary/10"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
            }`}
          >
            <Monitor className="w-6 h-6 mx-auto mb-2 text-gray-700 dark:text-gray-300" />
            <div className="text-sm font-medium text-gray-900 dark:text-white">System</div>
          </button>
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case "profile":      return renderProfileSettings()
      case "display":      return renderDisplaySettings()
      case "preferences":  return <PreferencesSection />
      default:             return renderProfileSettings()
    }
  }

  const showSaveBar = activeSection === "profile" || activeSection === "display"

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <nav className="space-y-2">
                {settingsSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeSection === section.id
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <section.icon className="w-5 h-5" />
                    <span className="font-medium">{section.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                {settingsSections.find(s => s.id === activeSection)?.name}
              </h2>

              {renderContent()}

              {/* Generic Save bar — hidden for Preferences (it has its own) */}
              {showSaveBar && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-end space-x-3">
                    <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      Cancel
                    </button>
                    <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
