// Script de QA descartable — arma un tenant PREMIUM (incluye los módulos
// "reports" e "inventory") para verificar en vivo, vía la UI real del
// dashboard (no llamadas directas a funciones de librería como en la
// verificación anterior del 2 ago 2026), el flujo completo de:
//   (a) cargar un costo unitario real en un insumo desde Inventario,
//   (b) confirmar que el override de comisión de un servicio (Service.commissionRate)
//       se usa en vez del % default del profesional al completar una cita real,
//   (c) marcar una comisión como pagada dos veces seguidas desde Reportes
//       (idempotencia),
//   (d) configurar Tenant.lowStockAlertPhone y cruzar el umbral de stock bajo
//       completando la cita — sin llegar a disparar un envío real a la API de
//       Meta (ver CLAUDE.md: la plantilla "alerta_stock_bajo" sigue sin
//       aprobar, y el proyecto ya decidió antes no gastar cuota/arriesgar un
//       envío indeseado en verificaciones de QA).
//
// Números elegidos para que UNA sola cita completada cruce el umbral de stock
// bajo en un solo click:
//   - InventoryItem "Insumo QA": lowStockThreshold = 5, unitCost = null
//     (se carga a mano desde la UI durante la verificación — así el paso (a)
//     es una edición real, no solo confirmar un valor ya sembrado).
//   - InventoryStock inicial en Sede QA: quantity = 6 (por encima del umbral).
//   - ServiceInventoryItem: quantityPerUse = 2 → 6 - 2 = 4, que es <= umbral
//     (5) y el previo (6) > umbral → cruza el umbral exactamente una vez.
//
// Comisión:
//   - Professional.commissionRate = 20 (default)
//   - Service.commissionRate = 40 (override) — si el reporte usa 40% en vez
//     de 20% para esta cita, el override está funcionando.
//
// La cita ya se siembra en estado CONFIRMED (no PENDING) — ALLOWED_STATUS_TRANSITIONS
// permite CONFIRMED -> COMPLETED directo, así que un solo click en el
// dashboard alcanza para completarla.
//
// Uso:
//   npx tsx prisma/qa-costo-comision-alertas.ts
//
// Al terminar de verificar, borrar todo con:
//   npx tsx prisma/qa-costo-comision-alertas-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-costo-comision";
const OWNER_EMAIL = "owner-costo-comision-qa@qa.test";
const PASSWORD = "QaCostoComision123!";

function todayAtLocalHour(hour: number): Date {
  const now = new Date();
  // 10:00 hora de Bogotá (UTC-5, sin horario de verano) == 15:00 UTC.
  const utcHour = hour + 5;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0, 0));
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${SLUG}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-costo-comision-alertas-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: "QA Costo Comisión Alertas",
      slug: SLUG,
      plan: "PREMIUM",
      status: "ACTIVE",
      vertical: "GENERAL",
    },
  });

  const location = await prisma.location.create({
    data: { tenantId: tenant.id, name: "Sede QA", timezone: "America/Bogota" },
  });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      name: "Owner QA",
      passwordHash,
      locationRoles: { create: [{ locationId: location.id, role: "OWNER" }] },
    },
  });

  const item = await prisma.inventoryItem.create({
    data: {
      tenantId: tenant.id,
      name: "Insumo QA",
      unit: "unidad",
      lowStockThreshold: 5,
      unitCost: null, // se carga a mano desde la UI durante la verificación
      active: true,
    },
  });

  await prisma.inventoryStock.create({
    data: { itemId: item.id, locationId: location.id, quantity: 6 },
  });

  const service = await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: "Servicio QA (comisión override)",
      durationMinutes: 30,
      price: 100.0,
      commissionRate: 40, // override — distinto del 20% default del profesional
      active: true,
    },
  });

  await prisma.serviceInventoryItem.create({
    data: { serviceId: service.id, itemId: item.id, quantityPerUse: 2 },
  });

  const professional = await prisma.professional.create({
    data: {
      tenantId: tenant.id,
      name: "Profesional QA",
      commissionRate: 20, // default — el override del servicio debe ganarle
      active: true,
      services: { create: [{ serviceId: service.id }] },
      professionalLocations: { create: [{ locationId: location.id }] },
    },
  });

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente QA", email: "cliente-qa@qa.test", phone: "+573000000000" },
  });

  const startsAt = todayAtLocalHour(10);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      locationId: location.id,
      professionalId: professional.id,
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  console.log(`
QA listo — tenant "QA Costo Comisión Alertas" (${SLUG}), plan PREMIUM, status ACTIVE.

Login OWNER:
  email:    ${owner.email}
  password: ${PASSWORD}
URL agenda:      /dashboard/${SLUG}
URL inventario:  /dashboard/${SLUG}/inventory
URL servicios:   /dashboard/${SLUG}/services
URL reportes:    /dashboard/${SLUG}/reports

Datos sembrados:
  - Insumo "Insumo QA": stock inicial 6 en Sede QA, umbral de stock bajo 5, SIN costo unitario cargado.
  - Servicio "Servicio QA (comisión override)": comisión override 40% (vs. 20% default del profesional), consume 2 unidades de "Insumo QA" por uso.
  - Profesional "Profesional QA": comisión default 20%.
  - Cita ${appointment.id}: hoy a las 10:00 (Bogotá), estado CONFIRMED, lista para completar con un click.

Pasos sugeridos:
  1. Inventario -> Insumo QA -> cargar un costo unitario (ej. 5000) y guardar.
  2. Agenda -> click en la cita de Cliente QA -> "Completada".
     - Confirmar en Inventario que el stock bajó de 6 a 4 y quedó el badge "Stock bajo".
     - Confirmar en Reportes que la comisión de esa cita usó 40% (100 * 0.40 = 40), no 20%.
  3. Reportes -> "Marcar como pagada" en la fila de Profesional QA -> confirmar que pasa a Pagada.
     Click "Marcar como pagada" de nuevo (ya no debería quedar pendiente / no debería duplicar nada).
  4. Inventario -> configurar un teléfono de alerta de stock bajo SOLO si querés
     probar el intento de envío real a Meta (¡plantilla alerta_stock_bajo sigue
     sin aprobar! evitar un número real a propósito, según ya quedó documentado
     en CLAUDE.md).

Cuando termines de verificar, limpiá todo con:
  npx tsx prisma/qa-costo-comision-alertas-cleanup.ts
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
