import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const roles = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'patient', label: 'Patient' },
  { value: 'lab', label: 'Lab User' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'admin', label: 'Admin / Overall' }
] as const

export const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<(typeof roles)[number]['value']>('doctor')
  const navigate = useNavigate()
  const { login } = useAuth()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // dummy login
    void login(username || 'demo', password || 'demo', role)
    navigate(`/${role}`)
  }

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto', padding: '2rem', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Healthcare Login</h2>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
          />
        </label>
        <label>
          <span>Login as</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', background: '#0A6CC2', color: '#fff', border: 'none', borderRadius: 4 }}>
          Login
        </button>
      </form>
    </div>
  )
}


