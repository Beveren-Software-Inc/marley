import { useEffect, useState } from 'react'

type UserRole = 'doctor' | 'nurse' | 'patient' | 'lab' | 'pharmacist' | 'admin'
type User = { role: UserRole; name: string; token: string }

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    // TODO: hydrate from storage
  }, [])

  const login = async (username: string, password: string, role: UserRole) => {
    // TODO: call Frappe auth
    const mock: User = { role, name: username, token: 'mock-token' }
    setUser(mock)
  }

  const logout = () => setUser(null)

  return { user, login, logout }
}


