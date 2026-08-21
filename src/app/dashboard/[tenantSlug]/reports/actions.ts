"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReportsAccess } from "@/lib/auth-guards";
import { calculateCommissionAmount, getDefaultReportRange, parseReportDateParam } from "@/lib/reports";
import { sendCommissionPaidEmail } from "@/lib/email";
import { planIncludesModule } from "@/lib/planLimits";
import { askReportsCopilot } from "@/lib/copilot";
import { isCopilotRateLimited, recordCopilotAttempt } from "@/lib/rateLimit";

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
    include: { user: { select: { email: true } } },
  });
  if (!professional) notFound();

  const parsedFrom = parseReportDateParam(fromRaw);
  const parsedTo = parseReportDateParam(toRaw, { endOfDay: true });
  const { from, to } =
    parsedFrom && parsedTo ? { from: parsedFrom, to: parsedTo } : getDefaultReportRange(new Date());

  const defaultRatePercent = Number(professional.commissionRate);

  // Leemos las citas que se van a marcar como pagadas ANTES del updateMany
  // (mismo where, en la misma transacción) para poder avisarle al
  // profesional cuánto se le pagó — el updateMany en sí no devuelve las filas
  // afectadas. Reusa calculateCommissionAmount, la misma fórmula por cita que
  // ya usa computeReportData (ver ese archivo para el razonamiento del
  // override de Service.commissionRate).
  const paidAppointments = await prisma.$transaction(async (tx) => {
    const toPay = await tx.appointment.findMany({
      where: {
        tenantId: tenant.id,
        professionalId: professional.id,
        status: "COMPLETED",
        startsAt: { gte: from, lte: to },
        commissionPaidAt: null,
      },
      select: { id: true, service: { select: { price: true, commissionRate: true } } },
    });

    if (toPay.length > 0) {
      await tx.appointment.updateMany({
        where: { id: { in: toPay.map((appointment) => appointment.id) } },
        data: { commissionPaidAt: new Date() },
      });
    }

    return toPay;
  });

  revalidatePath(`/dashboard/${tenantSlug}/reports`);

  // Fuera de la transacción a propósito, fire-and-forget — mismo criterio
  // que maybeSendLowStockAlerts (un envío de red nunca vive dentro de una
  // transacción de base de datos).
  if (paidAppointments.length > 0 && professional.user?.email) {
    let totalAmount = 0;
    for (const appointment of paidAppointments) {
      const effectiveRatePercent =
        appointment.service.commissionRate !== null
          ? Number(appointment.service.commissionRate)
          : defaultRatePercent;
      totalAmount += calculateCommissionAmount(Number(appointment.service.price), effectiveRatePercent);
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    void sendCommissionPaidEmail({
      to: professional.user.email,
      professionalName: professional.name,
      amountLabel: `$${totalAmount.toLocaleString("es-CO")}`,
      appointmentCount: paidAppointments.length,
      fromLabel: formatDateLabel(from),
      toLabel: formatDateLabel(to),
      tenantName: tenant.name,
    });
  }

  const query = rangeParams.toString();
  redirect(`/dashboard/${tenantSlug}/reports${query ? `?${query}` : ""}`);
}

// Nivel 1 del Copiloto RIME (solo lectura) — ver src/lib/copilot.ts. Mismo
// guard que el resto de Reportes MÁS el chequeo explícito de plan del
// módulo "aiAssistant": PREMIUM/PRO únicamente, aunque el tenant ya tenga
// acceso a Reportes en un plan más chico (BASICO).
export async function askReportsCopilotAction(
  tenantSlug: string,
  question: string
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const { session, tenant } = await requireReportsAccess(tenantSlug);

  if (!planIncludesModule(tenant.plan, "aiAssistant")) {
    return { ok: false, error: "Esta función no está disponible en tu plan." };
  }

  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, error: "Escribe una pregunta." };
  }

  // Antes de llamar al modelo (que cuesta real): tope de uso por usuario,
  // compartido con Inventario (ver src/lib/rateLimit.ts). Mismo criterio
  // que login/forgot-password: el chequeo NO cuenta como intento nuevo,
  // se registra recién acá, una vez confirmado que se va a llamar al
  // modelo de verdad.
  if (await isCopilotRateLimited(session.user.id)) {
    return {
      ok: false,
      error: "Alcanzaste el límite de preguntas al Copiloto por esta hora. Intenta de nuevo más tarde.",
    };
  }
  await recordCopilotAttempt(session.user.id);

  try {
    const answer = await askReportsCopilot(tenant.id, trimmed);
    return { ok: true, answer };
  } catch (err) {
    console.error("[askReportsCopilotAction]", err);
    return { ok: false, error: "No se pudo responder tu pregunta. Intenta de nuevo en un momento." };
  }
}
