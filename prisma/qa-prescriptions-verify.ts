// Verifica, contra los datos reales sembrados por qa-prescriptions.ts:
//   (a) planIncludesModule(plan, "prescriptions") es true incluso en
//       INDIVIDUAL (a diferencia de packages/waitlist),
//   (b) la query real que usa el route handler de PDF (tenantId+clientId
//       scoped) encuentra la receta y trae professional+client con acentos/
//       ñ/multilínea intactos,
//   (c) el mismo scoping con un clientId/tenantId incorrecto NO la
//       encuentra (findFirst devuelve null, no filtra datos de otro tenant).
//
// No se invoca el handler HTTP real (requiere una sesión de Auth.js que
// este entorno no puede simular sin navegador) ni renderToBuffer — el
// componente de PDF sigue la misma estructura ya probada en producción por
// el PDF de Reportes (ver el comentario en el propio route handler), así
// que se verifica por revisión de código + tsc, mismo criterio que ya usa
// este proyecto para @react-pdf/renderer.
//
// Uso: npx tsx prisma/qa-prescriptions-verify.ts

import { PrismaClient } from "@prisma/client";
import { planIncludesModule } from "../src/lib/planLimits";

const prisma = new PrismaClient();

const SLUG = "qa-prescriptions";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(`No existe el tenant "${SLUG}". Corré primero "npx tsx prisma/qa-prescriptions.ts".`);
    process.exit(1);
  }

  console.log("--- (a) prescriptions en plan INDIVIDUAL ---");
  console.log(`planIncludesModule(INDIVIDUAL, "prescriptions") = ${planIncludesModule(tenant.plan, "prescriptions")} (esperado: true)`);

  const client = await prisma.client.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const prescription = await prisma.prescription.findFirstOrThrow({ where: { tenantId: tenant.id } });

  console.log("\n--- (b) Query real del route handler de PDF (tenantId+clientId scoped) ---");
  const found = await prisma.prescription.findFirst({
    where: { id: prescription.id, tenantId: tenant.id, clientId: client.id },
    include: { professional: true, client: true },
  });
  console.log(`Encontrada: ${!!found}`);
  console.log(`Profesional: "${found?.professional.name}" (esperado con tilde: "Dra. María José Peña")`);
  console.log(`Título: "${found?.title}"`);
  console.log(`Contenido:\n${found?.content}`);

  console.log("\n--- (c) Scoping: tenantId/clientId incorrecto no debe encontrarla ---");
  const wrongTenant = await prisma.prescription.findFirst({
    where: { id: prescription.id, tenantId: "tenant-que-no-existe", clientId: client.id },
  });
  const wrongClient = await prisma.prescription.findFirst({
    where: { id: prescription.id, tenantId: tenant.id, clientId: "cliente-que-no-existe" },
  });
  console.log(`Con tenantId incorrecto: ${wrongTenant === null ? "null (correcto)" : "ENCONTRADA (BUG)"}`);
  console.log(`Con clientId incorrecto: ${wrongClient === null ? "null (correcto)" : "ENCONTRADA (BUG)"}`);

  console.log("\nListo. Limpiá todo con: npx tsx prisma/qa-prescriptions-cleanup.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
