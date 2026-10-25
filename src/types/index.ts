/** Row returned by rpc('lookup_grades') */
export interface GradeRecord {
  course_code: string
  course_title: string
  instructor: string | null
  semester: string
  academic_year: string
  section: string
  student_no: string
  full_name: string
  midterm: string | null
  final: string | null
  remarks: string | null
}

/** Row in the `classes` table */
export interface ClassRow {
  id: string
  course_code: string
  course_title: string
  instructor: string | null
  semester: string
  academic_year: string
  section: string
  midterm_visible: boolean
  final_visible: boolean
  source_file: string | null
  updated_at: string
}

/** Output of parseRatingSheet.ts */
export interface ClassInfo {
  courseCode: string
  courseTitle: string
  instructor: string
  semester: string
  academicYear: string
  section: string
}

export interface ParsedStudent {
  row: number
  studentNo: string
  fullName: string
  programSec: string | null
  midterm: string | null
  final: string | null
  remarks: string | null
}

export interface ParseWarning {
  row?: number
  message: string
}

export interface ParseResult {
  classInfo: ClassInfo
  students: ParsedStudent[]
  warnings: ParseWarning[]
}