export function normalizeStudentNo(value: string): string {
  return value.replace(/\D/g, '')
}
