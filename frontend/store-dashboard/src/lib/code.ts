/** Digits only, capped at maxLength. Used for typed and pasted pickup codes ("123 456" and "123-456" both work). */
export function cleanCode(raw: string, maxLength: number): string {
  return raw.replace(/\D/g, '').slice(0, maxLength)
}
