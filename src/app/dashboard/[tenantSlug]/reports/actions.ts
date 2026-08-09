"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReportsAccess } from "@/lib/auth-guards";
import { getDefaultReportRange, parseReportDateParam } from "@/lib/reports";

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

// Marca como pagada la comisión pendiente de un profesional para el rango de
// fechas actualmente visible en Reportes (nunca cita por cita — sería
// tedioso, y el reporte ya está organizado por profesional + rango). Solo
// toca citas COMPLETED de este profesional en ese rango que todavía no
// tengan commissionPaidAt seteado — un segundo click sobre el mismo rango es
// un no-op (no vuelve a "pagar" lo ya pagado). Idempotente y sin necesidad de
// leer antes: el `where` con `commissionPaidAt: null` ya lo garantiza.
export async function markCommissionAsPaidAction(
  tenantSlug: string,
  professionalId: string,
  formData: FormData
): Promise<void> {
  const { tenant } = await requireReportsAccess(tenantSlug);

  const fromRaw = formData.get("from")?.toString();
  const toRaw = formData.get("to")?.toString();
  const rangeParams = new URLSearchParams();
  if (fromRaw) rangeParams.set("from", fromRaw);
  if (toRaw) rangeParams.set("to", toRaw);

  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: tenant.id },
  });
  if (!professional) notFound();

  const parsedFrom = parseReportDateParam(fromRaw);
  const parsedTo = parseReportDateParam(toRaw);
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  await prisma.appointment.updateMany({
    where: {
      tenantId: tenant.id,
      professionalId: professional.id,
      status: "COMPLETED",
      startsAt: { gte: from, lte: to },
      commissionPaidAt: null,
    },
    data: { commissionPaidAt: new Date() },
  });

  revalidatePath(`/dashboard/${tenantSlug}/reports`);
  const query = rangeParams.toString();
  redirect(`/dashboard/${tenantSlug}/reports${query ? `?${query}` : ""}`);
}
