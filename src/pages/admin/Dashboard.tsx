import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { ClassRow } from '../../types'

type ClassWithCount = ClassRow & { grades: { count: number }[] }
type VisibilityField = 'midterm_visible' | 'final_visible'

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E6B63] ${
        checked ? 'bg-[#0E6B63]' : 'bg-[#B8C1D0]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase
        .from('classes')
        .select('*, grades(count)')
        .order('academic_year', { ascending: false })
        .order('course_code')
      if (!active) return
      if (error) setError('Couldn’t load classes. Refresh to try again.')
      else {
        setError(null)
        setClasses((data ?? []) as ClassWithCount[])
      }
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  async function setVisible(c: ClassWithCount, field: VisibilityField, next: boolean) {
    // Optimistic update, rolled back if the write fails.
    setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, [field]: next } : x)))
    const { error } = await supabase.from('classes').update({ [field]: next }).eq('id', c.id)
    if (error) {
      setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, [field]: !next } : x)))
      setError('Couldn’t change visibility. Try again.')
    }
  }

  async function remove(c: ClassWithCount) {
    const ok = window.confirm(
      `Delete ${c.course_code} (${c.section}) and all of its grades? This can’t be undone.`,
    )
    if (!ok) return
    const { error } = await supabase.from('classes').delete().eq('id', c.id)
    if (error) setError('Couldn’t delete that class. Try again.')
    else setClasses((prev) => prev.filter((x) => x.id !== c.id))
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#162033]">
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Classes</h1>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/upload"
              className="rounded-md bg-[#0E6B63] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B5851]"
            >
              Upload rating sheet
            </Link>
            <button onClick={signOut} className="text-sm text-[#5B6577] underline">
              Sign out
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-[#FDF0EF] px-4 py-3 text-sm text-[#B42318]">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-[#5B6577]">Loading classes…</p>
        ) : classes.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-[#B8C1D0] bg-white p-8 text-center">
            <p className="font-medium">No classes yet</p>
            <p className="mt-1 text-sm text-[#5B6577]">
              Upload an Excel rating sheet to add your first class.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#D5DBE5] bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[#D5DBE5] text-[#5B6577]">
                <tr>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Term</th>
                  <th className="px-4 py-3 text-right font-medium">Students</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Midterm visible</th>
                  <th className="px-4 py-3 font-medium">Final visible</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} className="border-b border-[#E6EAF0] last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.course_code}</p>
                      <p className="text-[#5B6577]">
                        {c.course_title}. {c.section}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {c.semester}, {c.academic_year}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.grades?.[0]?.count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-[#5B6577]">
                      {new Date(c.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={c.midterm_visible}
                        label={`Midterm visible for ${c.course_code} ${c.section}`}
                        onChange={(v) => setVisible(c, 'midterm_visible', v)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={c.final_visible}
                        label={`Final visible for ${c.course_code} ${c.section}`}
                        onChange={(v) => setVisible(c, 'final_visible', v)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/admin/classes/${c.id}/students`}
                          className="text-[#0E6B63] underline"
                        >
                          Edit students
                        </Link>
                        <button onClick={() => remove(c)} className="text-[#B42318] underline">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}