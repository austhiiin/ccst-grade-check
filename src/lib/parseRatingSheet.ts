import * as XLSX from 'xlsx'
import { formatGrade } from './grade'
import type { ClassInfo, ParseResult, ParseWarning, ParsedStudent } from '../types'

const METADATA_LABELS = {
  instructor: 'Instructor',
  semester: 'Sem',
  academicYear: 'AY',
  courseCode: 'Course Code',
  courseTitle: 'Course Title',
} as const

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function normalizedHeader(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function readMetadata(rows: unknown[][]): Record<keyof typeof METADATA_LABELS, string> {
  const result = {} as Record<keyof typeof METADATA_LABELS, string>

  for (const [key, label] of Object.entries(METADATA_LABELS) as [
    keyof typeof METADATA_LABELS,
    (typeof METADATA_LABELS)[keyof typeof METADATA_LABELS],
  ][]) {
    const matcher = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.*)$`, 'i')
    for (const row of rows.slice(0, 10)) {
      const index = row.findIndex((cell) => matcher.test(cellText(cell)))
      if (index === -1) continue
      const match = cellText(row[index]).match(matcher)
      result[key] = match?.[1]?.trim() || cellText(row[index + 1])
      break
    }
    result[key] ??= ''
  }

  return result
}

function findHeaderRow(rows: unknown[][]): number {
  const index = rows.findIndex((row) =>
    row.some((cell) => normalizedHeader(cellText(cell)).includes('NAMEOFSTUDENTS')),
  )
  if (index < 0) throw new Error('Could not find the student table header in this workbook.')
  return index
}

function findColumn(headers: string[], pattern: RegExp, name: string): number {
  const index = headers.findIndex((header) => pattern.test(normalizedHeader(header)))
  if (index < 0) throw new Error(`Could not find the ${name} column in this workbook.`)
  return index
}

function parseGrade(
  value: unknown,
  row: number,
  label: string,
  warnings: ParseWarning[],
): string | null {
  const raw = cellText(value)
  if (!raw) return null

  const code = raw.toUpperCase()
  if (code === 'UW' || code === 'AW' || code === 'INC') return code

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw)
    if (numeric >= 1 && numeric <= 5) return formatGrade(raw)
  }

  warnings.push({ row, message: `Invalid ${label} grade "${raw}". It will not be imported.` })
  return null
}

function parseStudentNo(value: unknown, row: number, warnings: ParseWarning[]): string {
  const studentNo = cellText(value)
  if (!studentNo) {
    warnings.push({ row, message: 'Student number is missing; this row will not be imported.' })
    return ''
  }
  if (!/^\d{2}-\d{5}$/.test(studentNo)) {
    warnings.push({
      row,
      message: `Student number "${studentNo}" is not in YY-NNNNN format.`,
    })
  }
  return studentNo
}

export async function parseRatingSheet(file: File): Promise<ParseResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Choose an Excel .xlsx file.')
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false, raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.')

  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  })
  const headerRow = findHeaderRow(rows)
  const headers = (rows[headerRow] ?? []).map(cellText).map((value, index) => {
    const nextRowValue = cellText(rows[headerRow + 1]?.[index])
    return `${value} ${nextRowValue}`.trim()
  })
  const studentNoColumn = findColumn(headers, /STUDENTNO/, 'student number')
  const nameHeaderColumn = findColumn(headers, /NAMEOFSTUDENTS/, 'student name')
  const columns = {
    rowNumber: 0,
    // Some rating sheets place the "NAME OF STUDENTS" heading in column A,
    // above the row numbers, while student names are in the cell before Student No.
    name:
      nameHeaderColumn === 0 && studentNoColumn > 1
        ? studentNoColumn - 1
        : nameHeaderColumn,
    studentNo: studentNoColumn,
    programSec: findColumn(headers, /PROGRAM.*(?:YR|YEAR).*SEC|PROGRAM.*SEC/, 'program/section'),
    midterm: findColumn(headers, /MIDTERM/, 'midterm'),
    final: findColumn(headers, /FINAL/, 'final'),
    remarks: findColumn(headers, /REMARKS?/, 'remarks'),
  }
  const warnings: ParseWarning[] = []
  const students: ParsedStudent[] = []
  const seenStudentNos = new Set<string>()
  const sectionCounts = new Map<string, number>()

  for (let index = headerRow + 2; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const rowNumber = Number(cellText(row[columns.rowNumber]))
    if (!Number.isFinite(rowNumber) || rowNumber <= 0) break

    const excelRow = index + 1
    const studentNo = parseStudentNo(row[columns.studentNo], excelRow, warnings)
    const normalizedStudentNo = studentNo.replace(/\D/g, '')
    if (normalizedStudentNo.length === 7) {
      if (seenStudentNos.has(normalizedStudentNo)) {
        warnings.push({
          row: excelRow,
          message: `Duplicate student number "${studentNo}" in this file.`,
        })
      }
      seenStudentNos.add(normalizedStudentNo)
    }

    const programSec = cellText(row[columns.programSec]) || null
    if (programSec) sectionCounts.set(programSec, (sectionCounts.get(programSec) ?? 0) + 1)

    students.push({
      row: excelRow,
      studentNo,
      fullName: cellText(row[columns.name]).replace(/\s+/g, ' '),
      programSec,
      midterm: parseGrade(row[columns.midterm], excelRow, 'midterm', warnings),
      final: parseGrade(row[columns.final], excelRow, 'final', warnings),
      remarks: cellText(row[columns.remarks]) || null,
    })
  }

  const metadata = readMetadata(rows)
  const section = [...sectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const classInfo: ClassInfo = {
    courseCode: metadata.courseCode,
    courseTitle: metadata.courseTitle,
    instructor: metadata.instructor,
    semester: metadata.semester,
    academicYear: metadata.academicYear,
    section,
  }

  const missing = Object.entries({
    courseCode: classInfo.courseCode,
    courseTitle: classInfo.courseTitle,
    semester: classInfo.semester,
    academicYear: classInfo.academicYear,
    section: classInfo.section,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`Missing required class information: ${missing.join(', ')}.`)
  }
  if (students.length === 0) throw new Error('No numbered student rows were found in this workbook.')

  return { classInfo, students, warnings }
}
