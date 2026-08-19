import Papa from "papaparse";

// Tope de filas de datos por importación. Cada fila hace al menos una
// consulta de dedup (findDuplicateClient) más, eventualmente, un create —
// sin un tope, un archivo enorme (ej. exportado por error desde otro
// sistema con cientos de miles de filas) podría hacer que confirmImportAction
// tarde minutos y choque con el timeout de la función serverless. 5000 filas
// cubre con margen el caso real (importar la base de un negocio chico/mediano
// desde otro software) — un archivo más grande se puede partir en varios.
export const MAX_IMPORT_ROWS = 5000;

// Tope de tamaño de archivo validado del lado del cliente, antes de mandarlo
// como string al server action — mismo motivo/criterio que
// MAX_CLIENT_PHOTO_BYTES en clientPhotos.ts: el body de una Server Action
// tiene un límite de 6MB (bodySizeLimit en next.config.mjs), así que sin
// esta validación previa un archivo más pesado da "Failed to fetch" en vez
// de un aviso prolijo. 5MB de texto CSV son decenas de miles de filas, muy
// por encima de MAX_IMPORT_ROWS, así que en la práctica el tope de filas se
// alcanza primero.
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_FILE_LABEL = "5MB";

export interface CsvParseResult {
  headers: string[];
  rows: string[][]; // solo filas de datos, sin la de encabezados
}

// Parsea el contenido crudo de un CSV a encabezados + filas de datos. Se usa
// header:false (en vez de header:true) y se separa a mano la primera fila
// como encabezados porque así cada fila de datos queda como array posicional
// (string[]) en vez de objeto keyed por nombre de columna — más simple de
// re-mapear cuando el usuario corrige a mano qué columna es cuál en la UI.
export function parseCsvContent(fileContent: string): CsvParseResult {
  const result = Papa.parse<string[]>(fileContent.trim(), {
    skipEmptyLines: true,
  });
  const [headerRow, ...dataRows] = result.data;
  return {
    headers: (headerRow ?? []).map((h) => h.trim()),
    rows: dataRows,
  };
}

export interface ColumnMapping {
  name: string | null;
  email: string | null;
  phone: string | null;
}

// Listas de sinónimos ya normalizados (ver normalizeHeader) — sin acentos,
// en minúscula y sin separadores, así "Teléfono", "telefono_cliente" y
// "Número de Teléfono" matchean todos contra el mismo hint "telefono".
const NAME_HEADER_HINTS = ["nombre", "name", "cliente", "nombrecompleto", "fullname"];
const EMAIL_HEADER_HINTS = ["email", "correo", "mail", "correoelectronico"];
const PHONE_HEADER_HINTS = ["telefono", "phone", "celular", "movil", "whatsapp"];

// Quita acentos, pasa a minúsculas y deja solo alfanumérico — para que la
// detección de columnas ignore mayúsculas/acentos/espacios/guiones tal como
// pide el flujo ("nombre" debe matchear con "Nombre completo", "NOMBRE_1", etc.).
function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Primero busca una coincidencia EXACTA (todo el header normalizado ==
// algún hint) entre los headers disponibles; si no hay ninguna, recién ahí
// cae a una coincidencia parcial (el header normalizado CONTIENE el hint).
// El orden importa: preferir exacto evita que, por ejemplo, un header
// "Teléfono de contacto" se lleve la columna antes que un header "Teléfono"
// exacto si ambos existieran en el mismo archivo.
function detectHeader(headers: string[], hints: string[]): string | null {
  const normalized = headers.map((original) => ({ original, normalized: normalizeHeader(original) }));

  const exact = normalized.find((h) => hints.includes(h.normalized));
  if (exact) return exact.original;

  const partial = normalized.find((h) => hints.some((hint) => h.normalized.includes(hint)));
  return partial ? partial.original : null;
}

// Detecta el mapeo de columnas a partir de los encabezados del archivo. Se
// detecta nombre primero y se lo saca de la lista antes de buscar email, y
// email antes de buscar teléfono, para que un mismo header nunca quede
// asignado a dos campos a la vez (ej. un header ambiguo tipo "Contacto" no
// puede terminar siendo a la vez el de nombre Y el de teléfono).
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const name = detectHeader(headers, NAME_HEADER_HINTS);
  const remainingAfterName = headers.filter((h) => h !== name);

  const email = detectHeader(remainingAfterName, EMAIL_HEADER_HINTS);
  const remainingAfterEmail = remainingAfterName.filter((h) => h !== email);

  const phone = detectHeader(remainingAfterEmail, PHONE_HEADER_HINTS);

  return { name, email, phone };
}

export interface CsvPreview {
  headers: string[];
  mapping: ColumnMapping;
  previewRows: string[][];
  totalRows: number;
}

// Arma la vista previa que se le muestra al usuario antes de confirmar: el
// mapeo auto-detectado (para que pueda corregirlo si hizo falta) y las
// primeras filas de datos, tal cual vienen en el archivo.
export function buildCsvPreview(fileContent: string, previewLimit = 10): CsvPreview {
  const { headers, rows } = parseCsvContent(fileContent);
  return {
    headers,
    mapping: detectColumnMapping(headers),
    previewRows: rows.slice(0, previewLimit),
    totalRows: rows.length,
  };
}

export interface ImportedClientRow {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ExtractClientRowsResult {
  valid: ImportedClientRow[];
  errors: string[];
}

// Aplica el mapeo de columnas confirmado por el usuario a las filas de datos
// del CSV completo, validando el mínimo indispensable (nombre no vacío) fila
// por fila. Las columnas de email/teléfono son opcionales — columnMapping.email
// o .phone pueden venir como string vacío si el usuario eligió "no mapear".
export function extractClientRows(
  headers: string[],
  rows: string[][],
  columnMapping: { name: string; email: string; phone: string }
): ExtractClientRowsResult {
  const nameIdx = headers.indexOf(columnMapping.name);
  const emailIdx = columnMapping.email ? headers.indexOf(columnMapping.email) : -1;
  const phoneIdx = columnMapping.phone ? headers.indexOf(columnMapping.phone) : -1;

  const valid: ImportedClientRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 por índice base 0, +1 por la fila de encabezado

    const name = nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "";
    if (!name) {
      errors.push(`Fila ${rowNumber}: el nombre está vacío, se omitió.`);
      return;
    }

    const email = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() || null : null;
    const phone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() || null : null;
    valid.push({ name, email, phone });
  });

  return { valid, errors };
}
