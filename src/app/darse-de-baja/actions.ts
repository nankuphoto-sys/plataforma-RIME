"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Sin token firmado a propósito: el peor caso de que alguien adivine un
// clientId ajeno es que active la baja de otra persona — cero exposición de
// datos, no dispara ningún envío. No amerita la complejidad de un token
// firmado como el de reseñas/reset de contraseña.
export async function unsubscribeAction(clientId: string, tenantSlug: string): Promise<void> {
  const client = await prisma.client.findFirst({ where: { id: clientId, tenant: { slug: tenantSlug } } });
  if (!client) {
    redirect(`/darse-de-baja?error=1`);
  }

  await prisma.client.update({ where: { id: client!.id }, data: { marketingOptOut: true } });

  redirect(`/darse-de-baja?client=${clientId}&tenant=${tenantSlug}&done=1`);
}
