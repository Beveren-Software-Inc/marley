import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../providers/AuthProvider"
import { useTheme } from "../hooks/useTheme"
import {
  ArrowLeft,
  User,
  Palette,
  Moon,
  Sun,
  Monitor,
  LogOut,
} from "lucide-react"

export const SettingsPage = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [activeSection, setActiveSection] = useState("profile")

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      navigate("/login", { replace: true })
    }
  }

  const settingsSections = [
    { id: "profile", name: "Profile", icon: User },
    { id: "display", name: "Display", icon: Palette },
  ]

  const renderProfileSettings = () => {
    const { user } = useAuth()
    const displayName = user?.name || "Guest User"
    const initials = displayName
      .split(" ")
      .map(word => word.charAt(0).toUpperCase())
      .join("")
      .substring(0, 2)

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-2xl">{initials}</span>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{displayName}</h3>
            <p className="text-gray-600 dark:text-gray-400">{user?.role || 'User'}</p>
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
              defaultValue={user?.role || 'User'}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
            />
          </div>
        </div>
      </div>
    )
  }

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
          <button className="p-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 transition-colors">
            <Monitor className="w-6 h-6 mx-auto mb-2 text-gray-700 dark:text-gray-300" />
            <div className="text-sm font-medium text-gray-900 dark:text-white">System</div>
          </button>
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return renderProfileSettings()
      case "display":
        return renderDisplaySettings()
      default:
        return renderProfileSettings()
    }
  }

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
                {settingsSections.find((s) => s.id === activeSection)?.name}
              </h2>
              {renderContent()}

              {/* Save Button */}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

