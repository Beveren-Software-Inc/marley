import { useState, useEffect, useRef, type ChangeEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../providers/AuthProvider"
import { useTheme } from "../hooks/useTheme"
import { toast } from "../hooks/useToast"
import { getUserCostCenterPermission } from "../services/costCenterPermission"
import { fetchBranchOptions } from "../services/common"
import { fetchPortalCompany, updateDisplayName, uploadProfilePhoto } from "../services/profile"
import {
  ArrowLeft,
  User,
  Palette,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Building2,
  ShieldCheck,
  Info,
  Camera,
} from "lucide-react"

// ─── Preferences section ─────────────────────────────────────────────────────

const PreferencesSection = () => {
  const [costCenter, setCostCenter] = useState("")
  const [isExempt, setIsExempt] = useState(false)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [perm, options] = await Promise.all([
          getUserCostCenterPermission(),
          fetchBranchOptions(),
        ])
        setCostCenter(perm.cost_center)
        setIsExempt(perm.is_exempt)
        const map: Record<string, string> = {}
        options.forEach((o) => {
          map[o.name] = o.label
        })
        setLabels(map)
      } catch {
        toast.error("Failed to load branch preference.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const currentLabel = costCenter ? labels[costCenter] || costCenter : ""

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
          Your active branch filter. Set or change it from the branch selector in the top navbar —
          your choice appears here automatically.
        </p>

        {isExempt && (
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-5">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Elevated privileges</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Your account has <strong>Administrator</strong>, <strong>System Manager</strong>, or <strong>Healthcare Administrator</strong> role.
                With no branch selected you see all data. Choose a branch from the top navbar to filter your view.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-md">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Building2 className="w-4 h-4 text-gray-400" />
            Current Branch
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed">
            <Building2 className="w-4 h-4 shrink-0 text-gray-400" />
            <span>{currentLabel || "All branches (no filter)"}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Branch is set from the top navbar and can’t be changed here.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export const SettingsPage = () => {
  const navigate = useNavigate()
  const { user, logout, updateUser } = useAuth()
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

  const fullName = user?.full_name || user?.name || "Guest User"
  const userId = user?.name || user?.email || ""
  const rolesText = (
    user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : []
  ).join(" | ")
  const initials = fullName
    .split(" ")
    .map(w => w.charAt(0).toUpperCase())
    .join("")
    .substring(0, 2)

  const [company, setCompany] = useState("")
  const [displayName, setDisplayName] = useState(fullName)
  const [photoUrl, setPhotoUrl] = useState(user?.user_image || "")
  const [savingName, setSavingName] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPortalCompany().then(setCompany).catch(() => {})
  }, [])

  useEffect(() => {
    setDisplayName(user?.full_name || user?.name || "")
    setPhotoUrl(user?.user_image || "")
  }, [user])

  const handlePhotoPick = () => fileInputRef.current?.click()

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.")
      return
    }
    setUploadingPhoto(true)
    try {
      const url = await uploadProfilePhoto(file)
      setPhotoUrl(url)
      updateUser({ user_image: url })
      toast.success("Photo updated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.")
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSaveDisplayName = async () => {
    const name = displayName.trim()
    if (!name) {
      toast.error("Display name cannot be empty.")
      return
    }
    setSavingName(true)
    try {
      const saved = await updateDisplayName(name)
      updateUser({ full_name: saved })
      toast.success("Display name updated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save display name.")
    } finally {
      setSavingName(false)
    }
  }

  const renderProfileSettings = () => (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={handlePhotoPick}
          disabled={uploadingPhoto}
          title="Edit photo"
          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-primary ring-2 ring-primary/20 focus:outline-none focus:ring-4 focus:ring-primary/30"
        >
          {photoUrl ? (
            <img src={photoUrl} alt={fullName} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
              {initials}
            </span>
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploadingPhoto ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <>
                <Camera className="h-5 w-5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Edit photo</span>
              </>
            )}
          </span>
        </button>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white break-words">{fullName}</h3>
          {userId && (
            <p className="text-gray-600 dark:text-gray-400 [overflow-wrap:anywhere]">{userId}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Roles</label>
          <div className="min-h-[2.625rem] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400 [overflow-wrap:anywhere]">
            {rolesText || "User"}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSaveDisplayName}
          disabled={savingName || displayName.trim() === "" || displayName.trim() === fullName}
          className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingName ? "Saving…" : "Save"}
        </button>
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

  const showSaveBar = activeSection === "display"

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
              {activeSection === "profile" ? (
                <h2 className="mb-6 bg-gradient-to-r from-primary via-sky-500 to-indigo-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
                  {company || "Profile"}
                </h2>
              ) : (
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {settingsSections.find(s => s.id === activeSection)?.name}
                </h2>
              )}

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
