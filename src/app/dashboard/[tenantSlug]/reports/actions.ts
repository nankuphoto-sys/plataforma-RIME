"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReportsAccess } from "@/lib/auth-guards";

export async function updateProfessionalCommissionRateAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireReportsAccess(tenantSlug);

  // Preserva el rango de fechas actual (viaja como inputs ocultos en el
  // formulario) al redirigir de vuelta, si está disponible.
  const from = formData.get("from")?.toString();
  const to = formData.get("to")?.toString();
  const rangeParams = new URLSearchParams();
  if (from) rangeParams.set("from", from);
  if (to) rangeParams.set("to", to);

  const raw = formData.get("commissionRate")?.toString();
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value < 0 || value > 100) {
    rangeParams.set("error", "El porcentaje debe estar entre 0 y 100.");
    redirect(`/dashboard/${tenantSlug}/reports?${rangeParams.toString()}`);
  }

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) notFound();

  await prisma.professional.update({
    where: { id: professional.id },
    data: { commissionRate: value },
  });

  revalidatePath(`/dashboard/${tenantSlug}/reports`);
  const query = rangeParams.toString();
  redirect(`/dashboard/${tenantSlug}/reports${query ? `?${query}` : ""}`);
}
