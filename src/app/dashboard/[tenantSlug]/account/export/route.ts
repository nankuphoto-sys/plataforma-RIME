import { NextResponse } from "next/server";
import { requireOwnerAccess } from "@/lib/auth-guards";
import { buildTenantExportPayload, tenantExportFilenameBase } from "@/lib/tenantExport";

// "Descargar mis datos" de Mi cuenta — la cuenta del NEGOCIO completa, no un
// solo cliente (para eso está clients/[clientId]/export, ver el comentario
// ahí). Mismo criterio de "etiquetas legibles, no keys internas" para la
// ficha de cada cliente. Solo OWNER (requireOwnerAccess, mismo guard que
// Facturación y Configuración) — es el respaldo completo del negocio,
// incluye datos de todo el equipo y de todos los clientes, no solo lo propio
// de quien lo pide.
//
// El armado del JSON en sí (incluyendo el descifrado de customFields) vive
// en src/lib/tenantExport.ts, compartido con el cron de backups automáticos
// (src/app/api/cron/backup-tenants/route.ts) — este route handler solo
// agrega el guard de acceso y los headers de descarga.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const { tenant } = await requireOwnerAccess(tenantSlug);

  const exportPayload = await buildTenantExportPayload(tenant);

  const filename = `${tenantExportFilenameBase(tenant)}-datos-completos.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
