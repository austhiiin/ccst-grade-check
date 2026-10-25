import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(`Sign-in failed: ${error.message}`)
        return
      }
      navigate('/admin', { replace: true }) // ProtectedRoute checks the admins table
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not reach Supabase: ${err.message}`
          : 'Could not reach Supabase. Check your connection and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const field =
    'mt-1 w-full rounded-md border border-[#B8C1D0] bg-white px-3 py-2 outline-none focus-visible:border-[#0E6B63] focus-visible:ring-2 focus-visible:ring-[#0E6B63]/30'

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#162033]">
      <main className="mx-auto max-w-sm px-5 py-20">
        <h1 className="text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-1 text-sm text-[#5B6577]">Upload rating sheets and release grades.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[#B42318]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#162033] px-4 py-2.5 font-medium text-white hover:bg-[#0E1626] disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}