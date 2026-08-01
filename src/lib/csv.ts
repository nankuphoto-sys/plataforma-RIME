// Envuelve en comillas dobles y escapa comillas internas si el valor tiene
// coma, comilla o salto de línea — mismo criterio estándar de CSV (RFC 4180).
export function escapeCsvField(value: string | number): string {
  const stringValue = String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildCsvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}
