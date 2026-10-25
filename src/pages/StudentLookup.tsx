import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeStudentNo } from '../lib/studentNo'
import GradeCard from '../components/GradeCard'
import type { GradeRecord } from '../types'

type Status = 'idle' | 'loading' | 'done' | 'error'

export default function StudentLookup() {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [records, setRecords] = useState<GradeRecord[]>([])
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const digits = normalizeStudentNo(input) // keeps only the 7 digits
    setRecords([])

    if (digits.length !== 7) {
      setStatus('error')
      setMessage('Enter your 7-digit student ID, for example 26-47798.')
      return
    }

    setStatus('loading')
    setMessage(null)

    // Later: swap for a call to the Edge Function (CAPTCHA + rate limit).
    // The response shape stays the same.
    const { data, error } = await supabase.rpc('lookup_grades', { p_student_no: digits })

    if (error) {
      setStatus('error')
      setMessage('Something went wrong on our side. Please try again in a moment.')
      return
    }
    setRecords((data ?? []) as GradeRecord[])
    setStatus('done')
  }

  const busy = status === 'loading'

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#162033]">
      <main className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold sm:text-4xl">Check your grades</h1>
        <p className="mt-2 max-w-md text-[#5B6577]">
          Enter your student ID to see the midterm and final grades your instructors have released.
        </p>

        <form onSubmit={handleSubmit} className="mt-8" noValidate>
          <label htmlFor="student-id" className="block text-sm font-medium">
            Student ID
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="student-id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="26-47798"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={status === 'error'}
              aria-describedby="student-id-help"
              className="w-full rounded-md border border-[#B8C1D0] bg-white px-4 py-3 text-2xl tracking-wider tabular-nums outline-none placeholder:text-[#B8C1D0] focus-visible:border-[#0E6B63] focus-visible:ring-2 focus-visible:ring-[#0E6B63]/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[#0E6B63] px-6 py-3 font-medium text-white hover:bg-[#0B5851] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E6B63] disabled:opacity-60"
            >
              {busy ? 'Looking up…' : 'View grades'}
            </button>
          </div>
          <p id="student-id-help" className="mt-2 text-sm text-[#5B6577]">
            Dashes and spaces are fine. Only the digits are used.
          </p>
        </form>

        <div aria-live="polite" className="mt-8">
          {status === 'error' && message && (
            <p className="rounded-md border border-[#F1B8B3] bg-[#FDF0EF] px-4 py-3 text-sm text-[#B42318]">
              {message}
            </p>
          )}

          {status === 'done' && records.length === 0 && (
            <p className="rounded-md border border-[#D5DBE5] bg-white px-4 py-3 text-sm">
              No grades found for that ID.
            </p>
          )}

          {status === 'done' && records.length > 0 && (
            <section>
              <p className="mb-4 text-lg font-medium">
                {records[0].full_name}
                <span className="ml-2 text-base font-normal tabular-nums text-[#5B6577]">
                  {records[0].student_no}
                </span>
              </p>
              <div className="flex flex-col gap-4">
                {records.map((r) => (
                  <GradeCard
                    key={`${r.course_code}-${r.section}-${r.academic_year}-${r.semester}`}
                    record={r}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}