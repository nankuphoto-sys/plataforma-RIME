"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDashboardAccess } from "@/lib/auth-guards";
import { isProfessionalOnlyInTenant } from "@/lib/authorization";
import { encryptCustomFields } from "@/lib/clientCustomFields";
import {
  MAX_IMPORT_ROWS,
  buildCsvPreview,
  extractClientRows,
  parseCsvContent,
  type ColumnMapping,
} from "@/lib/clientImport";
import { findDuplicateClient } from "../actions";

// Mismo mensaje/motivo que createClientAction: un usuario "solo profesional"
// (nunca OWNER/ADMIN/STAFF en ninguna sede) ve el CRM filtrado a "sus"
// clientes, así que un cliente importado por él quedaría invisible hasta
// tener una cita — importar clientes queda para recepción/administración,
// igual que crear uno a mano.
async function assertCanImportClients(tenantSlug: string) {
  const { session, tenant } = await requireDashboardAccess(tenantSlug);
  const isProfessionalOnly = isProfessionalOnlyInTenant(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id)
  );
  return { tenant, isProfessionalOnly };
}

export async function parseCsvPreviewAction(
  tenantSlug: string,
  fileContent: string
): Promise<
  | { ok: true; headers: string[]; mapping: ColumnMapping; previewRows: string[][]; totalRows: number }
  | { ok: false; error: string }
> {
  const { isProfessionalOnly } = await assertCanImportClients(tenantSlug);
  if (isProfessionalOnly) {
    return {
      ok: false,
      error: "No tienes permiso para importar clientes. Pídele a recepción o a tu administrador que lo haga.",
    };
  }

  if (!fileContent.trim()) {
    return { ok: false, error: "El archivo está vacío." };
  }

  const preview = buildCsvPreview(fileContent);
  if (preview.headers.length === 0) {
    return { ok: false, error: "No se pudo leer el archivo — revisa que sea un CSV válido." };
  }
  if (preview.totalRows === 0) {
    return { ok: false, error: "El archivo no tiene filas de datos, solo la fila de encabezados." };
  }
  if (preview.totalRows > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `El archivo tiene ${preview.totalRows} filas — el máximo por importación es ${MAX_IMPORT_ROWS}. Divídelo en archivos más chicos e impórtalos por separado.`,
    };
  }

  return { ok: true, ...preview };
}

export async function confirmImportAction(
  tenantSlug: string,
  fileContent: string,
  columnMapping: { name: string; email: string; phone: string }
): Promise<{ ok: true; created: number; skipped: number; errors: string[] } | { ok: false; error: string }> {
  const { tenant, isProfessionalOnly } = await assertCanImportClients(tenantSlug);
  if (isProfessionalOnly) {
    return {
      ok: false,
      error: "No tienes permiso para importar clientes. Pídele a recepción o a tu administrador que lo haga.",
    };
  }

  if (!columnMapping.name) {
    return { ok: false, error: "Debes indicar qué columna corresponde al nombre." };
  }

  const { headers, rows } = parseCsvContent(fileContent);
  if (!headers.includes(columnMapping.name)) {
    return {
      ok: false,
      error: "El mapeo de columnas no coincide con el archivo — vuelve a subirlo e inténtalo de nuevo.",
    };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `El archivo tiene ${rows.length} filas — el máximo por importación es ${MAX_IMPORT_ROWS}. Divídelo en archivos más chicos e impórtalos por separado.`,
    };
  }

  const { valid, errors } = extractClientRows(headers, rows, columnMapping);

  let created = 0;
  let skipped = 0;

  // Se procesa por lotes chicos, cada uno en su propia transacción, en vez
  // de una sola transacción para todo el archivo: cada fila necesita su
  // propia consulta de dedup (findDuplicateClient) antes de decidir si crea
  // o salta, así que no hay una operación atómica única que ganar agrupando
  // TODO el archivo — y con archivos de miles de filas, una transacción
  // gigante corre riesgo real de superar el timeout del pool de conexiones.
  // BATCH_SIZE=25 mantiene cada transacción corta (además de acotar cuántas
  // filas se pierden si una transacción puntual falla a mitad de camino)
  // sin abrir una transacción nueva por cada fila individual.
  const BATCH_SIZE = 25;
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      for (const row of batch) {
        const duplicate = await findDuplicateClient(tenant.id, row.email, row.phone, undefined, tx);
        if (duplicate) {
          skipped += 1;
          continue;
        }

        await tx.client.create({
          data: {
            tenantId: tenant.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            birthdate: null,
            // El CSV solo trae nombre/email/teléfono (ver alcance del
            // prompt) — nunca objeto plano directo en customFields, mismo
            // criterio que create/updateClientAction.
            customFields: encryptCustomFields({}),
          },
        });
        created += 1;
      }
    });
  }

  revalidatePath(`/dashboard/${tenantSlug}/clients`);

  return { ok: true, created, skipped, errors };
}
