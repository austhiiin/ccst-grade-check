export function formatGrade(value: string | null | undefined): string | null {
  const grade = value?.trim()
  if (!grade) return null

  if (/^\d+(?:\.\d+)?$/.test(grade)) {
    const numeric = Number(grade)
    if (numeric >= 1 && numeric <= 5) return numeric.toFixed(2)
  }

  return grade
}
