// Script de QA descartable — arma un tenant PREMIUM (incluye el módulo
// "packages") con 4 paquetes de sesiones en distintos estados, para verificar
// en vivo:
//   (a) detect-expiring-packages encola exactamente el paquete que corresponde
//       (ACTIVE, con sesiones disponibles, vencimiento dentro de la ventana de
//       aviso) e ignora los otros tres (sin vencimiento, fuera de ventana, sin
//       sesiones disponibles),
//   (b) una segunda corrida del mismo cron no duplica el encolado (dedup por
//       packageId, no solo por clientId — un cliente puede tener más de un
//       paquete por vencer a la vez),
//   (c) la lógica de redención (canRedeemSession + la transacción de
//       usedSessions/status) funciona igual que la usaría
//       redeemPackageSessionAction.
//
// Número de teléfono deliberadamente falso/de prueba — NO se corre
// send-package-expiration-alerts contra él (la plantilla
// "alerta_paquete_vencimiento" no existe/no está aprobada en Meta todavía,
// mismo criterio ya documentado en CLAUDE.md para alerta_stock_bajo: evitar
// gastar cuota o arriesgar un envío indeseado).
//
// Uso:
//   npx tsx prisma/qa-paquetes.ts
//
// Al terminar de verificar, borrar todo con:
//   npx tsx prisma/qa-paquetes-cleanup.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "qa-paquetes";
const OWNER_EMAIL = "owner-paquetes-qa@qa.test";
const PASSWORD = "QaPaquetes123!";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(
      `Ya existe un tenant con slug "${SLUG}" (id ${existing.id}). Corré primero ` +
        `"npx tsx prisma/qa-paquetes-cleanup.ts" y volvé a correr este script.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await prisma.tenant.create({
    data: { name: "QA Paquetes", slug: SLUG, plan: "PREMIUM", status: "ACTIVE", vertical: "ESTETICA" },
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

  const service = await prisma.service.create({
    data: { tenantId: tenant.id, name: "Masaje descontracturante", durationMinutes: 45, price: 80, active: true },
  });

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "Cliente QA Paquetes", phone: "+573000000099" },
  });

  const nearingExpiration = await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      serviceId: service.id,
      totalSessions: 3,
      usedSessions: 2, // 1 disponible
      expiresAt: daysFromNow(3), // dentro de la ventana de 7 días
      status: "ACTIVE",
    },
  });

  const fullyUsed = await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      totalSessions: 5,
      usedSessions: 5, // 0 disponibles — no debe alertar aunque venza pronto
      expiresAt: daysFromNow(2),
      status: "ACTIVE",
    },
  });

  const farExpiration = await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      totalSessions: 10,
      usedSessions: 1, // 9 disponibles, pero vence lejos — no debe alertar
      expiresAt: daysFromNow(30),
      status: "ACTIVE",
    },
  });

  const noExpiration = await prisma.sessionPackage.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      totalSessions: 8,
      usedSessions: 0, // sin fecha de vencimiento — nunca debe alertar
      expiresAt: null,
      status: "ACTIVE",
    },
  });

  console.log(`
QA listo — tenant "QA Paquetes" (${SLUG}), plan PREMIUM, status ACTIVE.

Login OWNER:
  email:    ${owner.email}
  password: ${PASSWORD}
URL clientes: /dashboard/${SLUG}/clients/${client.id}

Paquetes sembrados (todos del cliente "${client.name}"):
  - nearingExpiration (${nearingExpiration.id}): 2/3 usadas, vence en 3 días -> DEBE alertar.
  - fullyUsed         (${fullyUsed.id}): 5/5 usadas, vence en 2 días -> NO debe alertar (sin sesiones).
  - farExpiration     (${farExpiration.id}): 1/10 usadas, vence en 30 días -> NO debe alertar (fuera de ventana).
  - noExpiration      (${noExpiration.id}): 0/8 usadas, sin vencimiento -> NO debe alertar (nunca).

Siguiente paso: correr "npx tsx prisma/qa-paquetes-verify.ts" para ejercitar
el cron de detección + la lógica de redención contra estos datos reales.
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
