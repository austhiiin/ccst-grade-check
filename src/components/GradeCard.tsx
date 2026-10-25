import type { GradeRecord } from '../types'
import { formatGrade } from '../lib/grade'

const NOT_AVAILABLE = 'Not yet available'

function GradeValue({ label, value }: { label: string; value: string | null }) {
  const formatted = formatGrade(value)
  const missing = formatted === null
  const isNumeric = formatted !== null && /^\d+(?:\.\d+)?$/.test(formatted)
  const failed = isNumeric && Number(formatted) >= 5

  return (
    <div className="flex-1 rounded-md border border-[#D5DBE5] bg-white px-4 py-3">
      <dt className="text-sm text-[#5B6577]">{label}</dt>
      <dd
        className={
          missing
            ? 'mt-1 text-base italic text-[#8A94A6]'
            : isNumeric
              ? `mt-1 text-3xl font-semibold tabular-nums ${failed ? 'text-[#B42318]' : 'text-[#162033]'}`
              : 'mt-1 text-2xl font-semibold text-[#162033]' // UW, AW, INC
        }
      >
        {missing ? NOT_AVAILABLE : formatted}
      </dd>
    </div>
  )
}

export default function GradeCard({ record }: { record: GradeRecord }) {
  return (
    <article className="rounded-lg border border-[#D5DBE5] bg-[#F4F6F9] p-5">
      <header>
        <p className="text-sm font-medium text-[#0E6B63]">{record.course_code}</p>
        <h2 className="text-xl font-semibold text-[#162033]">{record.course_title}</h2>
        <p className="mt-1 text-sm text-[#5B6577]">
          {record.instructor ? `${record.instructor}. ` : ''}
          {record.semester} semester, AY {record.academic_year}. Section {record.section}.
        </p>
      </header>

      <dl className="mt-4 flex flex-col gap-3 sm:flex-row">
        <GradeValue label="Midterm" value={record.midterm} />
        <GradeValue label="Final" value={record.final} />
      </dl>

      {record.remarks && (
        <p className="mt-3 text-sm text-[#162033]">
          <span className="text-[#5B6577]">Remarks: </span>
          {record.remarks}
        </p>
      )}
    </article>
  )
}