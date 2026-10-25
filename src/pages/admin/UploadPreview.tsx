import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizeStudentNo } from '../../lib/studentNo'
import { parseRatingSheet } from '../../lib/parseRatingSheet'
import type { ParseResult, ParsedStudent } from '../../types'

const CHUNK = 500

/** '2647798' or '26 47798' -> '26-47798' so re-uploads always match stored rows */
function canonicalStudentNo(raw: string): string {
  const d = normalizeStudentNo(raw)
  return `${d.slice(0, 2)}-${d.slice(2)}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export default function UploadPreview() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Rows with a usable 7-digit ID are importable; the rest are skipped.
  const importable: ParsedStudent[] =
    result?.students.filter((s) => normalizeStudentNo(s.studentNo).length === 7) ?? []
  const skipped = (result?.students.length ?? 0) - importable.length

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setResult(null)
    setParseError(null)
    setSaveError(null)
    if (!file) return
    setFileName(file.name)
    try {
      setResult(await parseRatingSheet(file))
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'We couldn’t read that file. Use the Rating Sheet .xlsx exported from the instructor.',
      )
    }
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    setSaveError(null)
    const { classInfo } = result

    try {
      // 1. Upsert the class. Visibility flags aren't sent, so existing ones are kept.
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .upsert(
          {
            course_code: classInfo.courseCode,
            course_title: classInfo.courseTitle,
            instructor: classInfo.instructor,
            semester: classInfo.semester,
            academic_year: classInfo.academicYear,
            section: classInfo.section,
            source_file: fileName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'course_code,semester,academic_year,section' },
        )
        .select('id')
        .single()
      if (clsErr || !cls) throw clsErr ?? new Error('Class was not saved.')

      // 2. Read existing grades so an empty cell in this file
      //    (e.g. Final in the midterm sheet) never erases a saved grade.
      const { data: existing, error: exErr } = await supabase
        .from('grades')
        .select('student_no, midterm, final, remarks')
        .eq('class_id', cls.id)
      if (exErr) throw exErr
      const prev = new Map((existing ?? []).map((g) => [g.student_no as string, g]))

      // 3. Merge (last row wins for duplicate IDs inside the file).
      const merged = new Map<string, Record<string, unknown>>()
      for (const s of importable) {
        const no = canonicalStudentNo(s.studentNo)
        const old = prev.get(no)
        merged.set(no, {
          class_id: cls.id,
          student_no: no,
          full_name: s.fullName,
          program_sec: s.programSec,
          midterm: s.midterm ?? old?.midterm ?? null,
          final: s.final ?? old?.final ?? null,
          remarks: s.remarks ?? old?.remarks ?? null,
        })
      }

      for (const part of chunk([...merged.values()], CHUNK)) {
        const { error } = await supabase
          .from('grades')
          .upsert(part, { onConflict: 'class_id,student_no' })
        if (error) throw error
      }

      navigate('/admin', { replace: true })
    } catch (err) {
      const details = err instanceof Error ? err.message : 'Unknown error.'
      setSaveError(`Couldn’t save this class: ${details}`)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#162033]">
      <main className="mx-auto max-w-4xl px-5 py-10">
        <Link to="/admin" className="text-sm text-[#5B6577] underline">
          Back to classes
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Upload rating sheet</h1>
        <p className="mt-1 text-sm text-[#5B6577]">
          The file is read in your browser. Nothing is saved until you confirm.
        </p>

        <div className="mt-6">
          <label htmlFor="file" className="block text-sm font-medium">
            Excel file (.xlsx)
          </label>
          <input
            id="file"
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="mt-2 block w-full cursor-pointer rounded-md border border-[#B8C1D0] bg-white text-sm file:mr-4 file:cursor-pointer file:border-0 file:bg-[#162033] file:px-4 file:py-2 file:text-white"
          />
        </div>

        {parseError && (
          <p role="alert" className="mt-4 rounded-md bg-[#FDF0EF] px-4 py-3 text-sm text-[#B42318]">
            {parseError}
          </p>
        )}

        {result && (
          <section className="mt-8 space-y-6">
            <div className="rounded-lg border border-[#D5DBE5] bg-white p-5">
              <h2 className="text-lg font-semibold">
                {result.classInfo.courseCode}: {result.classInfo.courseTitle}
              </h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[#5B6577]">Instructor</dt>
                  <dd>{result.classInfo.instructor || 'Not found'}</dd>
                </div>
                <div>
                  <dt className="text-[#5B6577]">Section</dt>
                  <dd>{result.classInfo.section}</dd>
                </div>
                <div>
                  <dt className="text-[#5B6577]">Semester</dt>
                  <dd>{result.classInfo.semester}</dd>
                </div>
                <div>
                  <dt className="text-[#5B6577]">Academic year</dt>
                  <dd>{result.classInfo.academicYear}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm">
                <span className="font-medium tabular-nums">{importable.length}</span> students ready
                to import
                {skipped > 0 && (
                  <span className="text-[#B42318]">
                    , {skipped} skipped because the student number is missing or incomplete
                  </span>
                )}
                .
              </p>
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E5] p-5">
                <h2 className="font-semibold">
                  {result.warnings.length} {result.warnings.length === 1 ? 'warning' : 'warnings'} to
                  review
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      {w.row ? `Row ${w.row}: ` : ''}
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-[#D5DBE5] bg-white">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[#D5DBE5] text-[#5B6577]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Student no.</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Midterm</th>
                    <th className="px-4 py-2 font-medium">Final</th>
                    <th className="px-4 py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {result.students.map((s) => (
                    <tr key={s.row} className="border-b border-[#E6EAF0] last:border-0">
                      <td className="px-4 py-2 tabular-nums">{s.studentNo || '—'}</td>
                      <td className="px-4 py-2">{s.fullName}</td>
                      <td className="px-4 py-2">
                        {s.midterm ?? <span className="text-[#8A94A6]">empty</span>}
                      </td>
                      <td className="px-4 py-2">
                        {s.final ?? <span className="text-[#8A94A6]">empty</span>}
                      </td>
                      <td className="px-4 py-2">{s.remarks ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-[#5B6577]">
              If this class already exists, matching students are updated. Empty grade cells keep the
              grade that’s already saved.
            </p>

            {saveError && (
              <p role="alert" className="text-sm text-[#B42318]">
                {saveError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || importable.length === 0}
                className="rounded-md bg-[#0E6B63] px-5 py-2.5 font-medium text-white hover:bg-[#0B5851] disabled:opacity-60"
              >
                {saving ? 'Saving…' : `Save ${importable.length} students`}
              </button>
              <Link to="/admin" className="text-sm text-[#5B6577] underline">
                Cancel
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}