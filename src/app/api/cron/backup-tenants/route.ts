import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { buildTenantExportPayload, tenantExportFilenameBase } from "@/lib/tenantExport";
import { logError } from "@/lib/errorLog";

// Mismo esquema de autorización que charge-wompi-subscriptions: header
// `Authorization: Bearer <CRON_SECRET>` (lo que manda el cron real de
// Vercel) o `?secret=` (para poder probarlo a mano en dev, donde no hay un
// cron real invocándolo).
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

// Backup automático: para cada tenant que no esté en baja definitiva
// (DELETION_REQUESTED — un tenant que ya pidió borrarse no necesita que le
// sigamos generando backups nuevos de datos que están por eliminarse), arma
// el mismo export completo que "Descargar mis datos" (ver
// src/lib/tenantExport.ts, compartido con
// src/app/dashboard/[tenantSlug]/account/export/route.ts) y lo sube a
// Vercel Blob en backups/{tenantId}/{fecha-ISO}.json con access privado.
//
// Store dedicado (2026-08-21): sube al store `plataforma-agenda-backups`
// (creado con --access private), vía `BACKUPS_READ_WRITE_TOKEN` — NO al
// store `plataforma-agenda` por default (`BLOB_READ_WRITE_TOKEN`, creado
// con --access public para "Línea de tiempo de fotos"). Confirmado en vivo
// que Vercel Blob no permite mezclar accesos dentro del mismo store: un
// `put(..., {access: "private"})` contra un store público tira
// `BlobError: Cannot use private access on a public store` — el acceso es
// una propiedad del store entero, no algo que se elija por archivo pese a
// que el SDK lo acepta como parámetro por llamada. Un backup contiene
// datos reales del negocio (nombres/emails/teléfonos de clientes, montos,
// citas — la ficha de salud en sí ya viene cifrada a nivel de campo, pero
// el resto no), así que un store privado de verdad importa acá, a
// diferencia de las fotos de clientes, donde `<img src>` público sin login
// es el comportamiento buscado.
//
// Retención: NO se implementa rotación/borrado de backups viejos en este
// alcance — queda pendiente de decidir una política (ej. "conservar los
// últimos 30 días") antes de que el volumen de blobs crezca sin límite.
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const blobToken = process.env.BACKUPS_READ_WRITE_TOKEN;

  // Sin el token no hay forma de subir nada — en vez de que cada tenant
  // falle uno por uno con el mismo error, se corta acá con un mensaje
  // claro. En producción real (deploy en Vercel, store conectado) este
  // token se inyecta solo; en dev local no está configurado, así que ahí
  // este cron no puede correr — el mensaje deja claro por qué.
  if (!blobToken) {
    const message = "BACKUPS_READ_WRITE_TOKEN no está configurado: no se puede subir ningún backup.";
    console.error(`[backup-tenants] ${message}`);
    await logError(new Error(message), { cron: "backup-tenants" });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "DELETION_REQUESTED" } },
  });

  // Sanitizado (":" y "." no son ideales en un pathname) pero se mantiene
  // ordenable alfabéticamente igual que el ISO original.
  const backedUpAt = new Date().toISOString().replace(/[:.]/g, "-");

  let backedUp = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const exportPayload = await buildTenantExportPayload(tenant);
      const pathname = `backups/${tenant.id}/${backedUpAt}.json`;

      await put(pathname, JSON.stringify(exportPayload, null, 2), {
        access: "private",
        token: blobToken,
        contentType: "application/json",
        // El path ya es único por tenant+timestamp (a nivel de segundo) —
        // sin este flag el default es agregar un sufijo aleatorio, lo que
        // haría el pathname impredecible sin ganar nada acá.
        addRandomSuffix: false,
      });

      backedUp += 1;
    } catch (error) {
      // Un tenant con error (ej. algún dato inesperado, o un timeout puntual
      // subiendo a Blob) no debe frenar el backup del resto del lote — sin
      // este catch, una excepción acá dejaría a todos los tenants
      // siguientes sin backup en esta corrida.
      console.error(
        `[backup-tenants] fallo respaldando tenant ${tenant.id} (${tenantExportFilenameBase(tenant)}):`,
        error
      );
      await logError(error, { tenantId: tenant.id, cron: "backup-tenants" });
      failed += 1;
    }
  }

  return NextResponse.json({ processed: tenants.length, backedUp, failed });
}
