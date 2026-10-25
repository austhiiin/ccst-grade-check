import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type State = 'loading' | 'anon' | 'denied' | 'ok'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let active = true

    async function check() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        if (active) setState('anon')
        return
      }
      // RLS lets an admin read only their own row; no row means not an admin.
      const { data: row } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (active) setState(row ? 'ok' : 'denied')
    }

    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check()
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (state === 'loading') {
    return <p className="p-8 text-sm text-[#5B6577]">Checking your access…</p>
  }
  if (state === 'anon') return <Navigate to="/admin/login" replace />
  if (state === 'denied') {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold text-[#162033]">This account isn’t an admin</h1>
        <p className="mt-2 text-sm text-[#5B6577]">
          Sign in with an account that has been added to the admins table.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-4 rounded-md bg-[#162033] px-4 py-2 text-sm font-medium text-white"
        >
          Sign out
        </button>
      </main>
    )
  }
  return <>{children}</>
}