import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizeStudentNo } from '../../lib/studentNo'
import { formatGrade } from '../../lib/grade'
import type { ClassRow } from '../../types'

interface StudentRow {
  id: string
  student_no: string
  full_name: string
  program_sec: string | null
  midterm: string | null
  final: string | null
  remarks: string | null
}

type StudentDraft = Omit<StudentRow, 'id'>

function toDraft(student: StudentRow): StudentDraft {
  return {
    student_no: student.student_no,
    full_name: student.full_name,
    program_sec: student.program_sec,
    midterm: student.midterm,
    final: student.final,
    remarks: student.remarks,
  }
}

function canonicalStudentNo(value: string): string | null {
  const digits = normalizeStudentNo(value)
  return digits.length === 7 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : null
}

export default function ClassStudents() {
  const { classId } = useParams()
  const [classRow, setClassRow] = useState<ClassRow | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, StudentDraft>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      if (!classId) {
        setError('Class was not specified.')
        setLoading(false)
        return
      }

      const [{ data: classData, error: classError }, { data: studentData, error: studentError }] =
        await Promise.all([
          supabase.from('classes').select('*').eq('id', classId).single(),
          supabase
            .from('grades')
            .select('id, student_no, full_name, program_sec, midterm, final, remarks')
            .eq('class_id', classId)
            .order('student_no'),
        ])

      if (!active) return
      if (classError || studentError) {
        setError(classError?.message ?? studentError?.message ?? 'Could not load this class.')
      } else {
        setClassRow(classData as ClassRow)
        setStudents((studentData ?? []) as StudentRow[])
      }
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [classId])

  function changeDraft(id: string, field: keyof StudentDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }))
  }

  function startEditing(student: StudentRow) {
    setError(null)
    setDrafts((current) => ({ ...current, [student.id]: toDraft(student) }))
    setEditingId(student.id)
  }

  async function saveStudent(student: StudentRow) {
    const draft = drafts[student.id]
    if (!draft) return

    const studentNo = canonicalStudentNo(draft.student_no)
    if (!studentNo) {
      setError('Student ID must contain exactly 7 digits.')
      return
    }
    if (!draft.full_name.trim()) {
      setError('Student name cannot be empty.')
      return
    }

    setSaving(true)
    setError(null)
    const updated: StudentDraft = {
      ...draft,
      student_no: studentNo,
      full_name: draft.full_name.trim().replace(/\s+/g, ' '),
      program_sec: draft.program_sec?.trim() || null,
      midterm: formatGrade(draft.midterm),
      final: formatGrade(draft.final),
      remarks: draft.remarks?.trim() || null,
    }

    const { error: saveError } = await supabase
      .from('grades')
      .update(updated)
      .eq('id', student.id)
      .eq('class_id', classId)
    if (saveError) {
      setError(`Could not save ${student.full_name}: ${saveError.message}`)
      setSaving(false)
      return
    }

    setStudents((current) =>
      current.map((row) => (row.id === student.id ? { ...row, ...updated } : row)),
    )
    setEditingId(null)
    setSaving(false)
  }

  const fieldClass =
    'w-full rounded border border-[#B8C1D0] bg-white px-2 py-1.5 outline-none focus-visible:border-[#0E6B63] focus-visible:ring-2 focus-visible:ring-[#0E6B63]/30'

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#162033]">
      <main className="mx-auto max-w-6xl px-5 py-10">
        <Link to="/admin" className="text-sm text-[#5B6577] underline">
          Back to classes
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Edit student list</h1>
        {classRow && (
          <p className="mt-1 text-sm text-[#5B6577]">
            {classRow.course_code}: {classRow.course_title} · {classRow.section} ·{' '}
            {classRow.semester}, {classRow.academic_year}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-[#FDF0EF] px-4 py-3 text-sm text-[#B42318]">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-[#5B6577]">Loading students…</p>
        ) : students.length === 0 ? (
          <p className="mt-8 rounded-md border border-[#D5DBE5] bg-white p-5 text-sm">
            No students have been saved for this class.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#D5DBE5] bg-white">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-[#D5DBE5] text-[#5B6577]">
                <tr>
                  <th className="px-3 py-3 font-medium">Student no.</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Program / section</th>
                  <th className="px-3 py-3 font-medium">Midterm</th>
                  <th className="px-3 py-3 font-medium">Final</th>
                  <th className="px-3 py-3 font-medium">Remarks</th>
                  <th className="px-3 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const editing = editingId === student.id
                  const draft = drafts[student.id]

                  return (
                    <tr key={student.id} className="border-b border-[#E6EAF0] last:border-0">
                      {editing && draft ? (
                        <>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Student number"
                              className={fieldClass}
                              value={draft.student_no}
                              onChange={(event) =>
                                changeDraft(student.id, 'student_no', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Student name"
                              className={fieldClass}
                              value={draft.full_name}
                              onChange={(event) =>
                                changeDraft(student.id, 'full_name', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Program and section"
                              className={fieldClass}
                              value={draft.program_sec ?? ''}
                              onChange={(event) =>
                                changeDraft(student.id, 'program_sec', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Midterm grade"
                              className={fieldClass}
                              value={draft.midterm ?? ''}
                              onChange={(event) =>
                                changeDraft(student.id, 'midterm', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Final grade"
                              className={fieldClass}
                              value={draft.final ?? ''}
                              onChange={(event) =>
                                changeDraft(student.id, 'final', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              aria-label="Remarks"
                              className={fieldClass}
                              value={draft.remarks ?? ''}
                              onChange={(event) =>
                                changeDraft(student.id, 'remarks', event.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveStudent(student)}
                                className="text-[#0E6B63] underline disabled:opacity-60"
                              >
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="text-[#5B6577] underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 tabular-nums">{student.student_no}</td>
                          <td className="px-3 py-3">{student.full_name}</td>
                          <td className="px-3 py-3">{student.program_sec ?? ''}</td>
                          <td className="px-3 py-3">{student.midterm ?? '—'}</td>
                          <td className="px-3 py-3">{student.final ?? '—'}</td>
                          <td className="px-3 py-3">{student.remarks ?? ''}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => startEditing(student)}
                              className="text-[#0E6B63] underline"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
