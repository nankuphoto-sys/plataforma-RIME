// Corrección puntual de datos de demo: de los 6 registros con precio/costo
// que existían en la base antes de este cambio (2 servicios, 3 ítems de
// inventario, 1 gift card), solo 2 estaban en escala USD implícita — los
// otros 4 ya eran valores realistas en pesos colombianos (cargados a mano en
// alguna sesión de prueba anterior, sin ninguna convención de moneda
// forzada). No hay una regla general segura para distinguir uno del otro
// (no hay ningún campo que lo marque), así que esto NO es un backfill
// genérico — es una corrección explícita, fila por fila, revisada y
// confirmada a mano antes de escribirla.
//
// Cada update valida que el valor actual sea exactamente el esperado antes
// de escribir — si no coincide (porque alguien ya lo cambió, o porque el
// script se corre dos veces), se salta esa fila en vez de sobreescribir a
// ciegas. Pensado para correr UNA SOLA VEZ.
//
// Uso:
//   npx tsx prisma/backfill-convert-usd-to-cop.ts

import { PrismaClient, Prisma } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // Si no hay .env (env vars ya inyectadas por la plataforma) seguimos con
  // lo que ya esté en process.env.
}

const prisma = new PrismaClient();

async function main() {
  let applied = 0;
  let skipped = 0;

  const service = await prisma.service.findFirst({ where: { name: "Primera consulta" } });
  if (service && service.price.equals(new Prisma.Decimal(35))) {
    await prisma.service.update({ where: { id: service.id }, data: { price: new Prisma.Decimal(140000) } });
    console.log(`Servicio "Primera consulta" (${service.id}): 35 -> 140000`);
    applied++;
  } else {
    console.log(`Servicio "Primera consulta" no encontrado o ya no vale 35 — saltado.`);
    skipped++;
  }

  const giftCard = await prisma.giftCard.findFirst({ where: { code: "RIME-UYV6-BUYG" } });
  if (
    giftCard &&
    giftCard.initialAmount.equals(new Prisma.Decimal(20)) &&
    giftCard.balance.equals(new Prisma.Decimal(20))
  ) {
    await prisma.giftCard.update({
      where: { id: giftCard.id },
      data: { initialAmount: new Prisma.Decimal(80000), balance: new Prisma.Decimal(80000) },
    });
    console.log(`Gift card RIME-UYV6-BUYG (${giftCard.id}): init=20/bal=20 -> init=80000/bal=80000`);
    applied++;
  } else {
    console.log(`Gift card RIME-UYV6-BUYG no encontrada o ya no vale 20/20 — saltada.`);
    skipped++;
  }

  console.log(`--- Corrección puntual USD->COP: ${applied} aplicados, ${skipped} saltados ---`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
