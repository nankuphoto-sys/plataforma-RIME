import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const GRACE_PERIOD_DAYS = 30;

// El query param `secret` es solo para poder probar el endpoint a mano desde
// el navegador en desarrollo local, donde no hay un cron real invocándolo.
// Mismo patrón que src/app/api/cron/charge-wompi-subscriptions/route.ts.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const due = await prisma.tenant.findMany({
    where: {
      status: "DELETION_REQUESTED",
      deletionRequestedAt: { lte: cutoff },
    },
    select: { id: true, slug: true },
  });

  let deleted = 0;
  let failed = 0;

  for (const tenant of due) {
    try {
      // prisma.tenant.delete() dispara el cascade completo (locations,
      // users, professionals, services, clients, appointments, pagos,
      // inventario, paquetes, gift cards, reseñas, etc. — ver el @@relation
      // onDelete: Cascade de cada modelo que cuelga de Tenant en
      // prisma/schema.prisma). Verificado en vivo contra la base de
      // desarrollo antes de escribir este cron: se creó un tenant con un
      // grafo completo (sede, usuario con StaffLocationRole/Account/Session/
      // PushSubscription/PasswordResetToken, profesional, servicio, cliente,
      // cita con pago/reseña/gift card redimida/notificación, paquete con
      // redención, receta, foto, insumo de inventario con stock/movimiento,
      // campaña de marketing, cobro de Wompi) y prisma.tenant.delete() lo
      // borró entero sin errores y sin dejar ninguna fila huérfana. Las
      // únicas relaciones que cuelgan de Appointment/Professional sin
      // onDelete: Cascade explícito (location/professional/service/client en
      // Appointment, professional en Prescription) quedan cubiertas porque
      // esos padres TAMBIÉN se borran en cascada desde este mismo Tenant en
      // la misma sentencia — Postgres valida las restricciones de FK recién
      // al final de la sentencia completa, así que no llegan a bloquear el
      // borrado.
      await prisma.tenant.delete({ where: { id: tenant.id } });
      deleted += 1;
    } catch (error) {
      // Un tenant con algún problema puntual no debe frenar el borrado del
      // resto del lote — mismo criterio que el cron de cobro de Wompi.
      console.error(`[delete-requested-tenants] fallo borrando tenant ${tenant.id} (${tenant.slug}):`, error);
      failed += 1;
    }
  }

  return NextResponse.json({ processed: due.length, deleted, failed });
}
