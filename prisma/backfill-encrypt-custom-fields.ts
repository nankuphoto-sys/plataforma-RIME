// Backfill de cifrado a nivel de aplicación para Client.customFields.
//
// Antes de este cambio, Client.customFields guardaba el objeto de la ficha
// (motivo de consulta, alergias, diagnóstico, etc.) en texto plano dentro de
// la columna Json. La nueva convención (ver src/lib/clientCustomFields.ts)
// envuelve ese objeto cifrado como { "_enc": "<ciphertext>" } — sigue siendo
// un Json válido, así que no hizo falta tocar el schema.
//
// Este script migra los clientes existentes que todavía tienen customFields
// en texto plano (datos de demo de antes de este cambio). Es IDEMPOTENTE:
// correrlo dos veces no vuelve a cifrar algo ya migrado (se detecta la forma
// { _enc: ... } y se salta) ni corrompe nada. Seguro de correr sin
// supervisión.
//
// Uso:
//   npx tsx prisma/backfill-encrypt-custom-fields.ts

import { PrismaClient } from "@prisma/client";
import { encryptCustomFields } from "../src/lib/clientCustomFields";

// Los otros scripts standalone de prisma/ (qa-*.ts, seed.ts) asumen que
// DATABASE_URL/APP_ENCRYPTION_KEY ya están en el entorno del proceso; acá se
// cargan defensivamente desde .env si todavía no están seteadas, para que el
// script funcione con solo `npx tsx ...` sin depender de cómo se invoque.
try {
  process.loadEnvFile(".env");
} catch {
  // Si no hay .env (ej. las env vars ya vienen inyectadas por la plataforma)
  // seguimos con lo que ya esté en process.env.
}

const prisma = new PrismaClient();

const ENC_KEY = "_enc";

function isAlreadyEncrypted(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[ENC_KEY] === "string"
  );
}

async function main() {
  // Se trae TODA la tabla de clientes (dataset de demo, chico) y se filtra en
  // JS en vez de armar un `where` sobre la columna Json — Prisma exige el
  // marcador especial `Prisma.JsonNull`/`Prisma.DbNull` para comparar contra
  // null en una columna Json, y filtrar además "no vacío" no tiene un
  // operador directo. Más simple y menos propenso a errores traer todo y
  // filtrar acá.
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, customFields: true },
  });

  const candidates = clients.filter((c) => {
    const cf = c.customFields;
    if (cf === null || cf === undefined) return false;
    if (typeof cf === "object" && !Array.isArray(cf) && Object.keys(cf as object).length === 0) return false;
    return true;
  });

  let migrated = 0;
  let alreadyMigrated = 0;
  let skippedEmpty = clients.length - candidates.length;

  for (const client of candidates) {
    if (isAlreadyEncrypted(client.customFields)) {
      alreadyMigrated++;
      continue;
    }

    const plainFields = client.customFields as Record<string, unknown>;
    await prisma.client.update({
      where: { id: client.id },
      data: { customFields: encryptCustomFields(plainFields) },
    });
    migrated++;
  }

  console.log("--- Backfill de cifrado de Client.customFields ---");
  console.log(`Clientes con customFields no vacío revisados: ${candidates.length}`);
  console.log(`Migrados ahora (texto plano -> cifrado): ${migrated}`);
  console.log(`Ya estaban migrados (saltados, idempotente): ${alreadyMigrated}`);
  console.log(`Sin customFields o vacío (sin tocar): ${skippedEmpty}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
