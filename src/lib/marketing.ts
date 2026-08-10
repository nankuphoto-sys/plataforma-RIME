import type { MarketingCampaignSegment, Prisma } from "@prisma/client";
import { INACTIVITY_THRESHOLD_DAYS } from "@/lib/reengagement";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Arma el filtro de audiencia de una campaña. Ambos segmentos excluyen
// siempre clientes sin email y los que se dieron de baja — eso no es
// negociable por segmento, va primero.
//
// INACTIVE_60_DAYS reimplementa la semántica de isClientInactive
// (src/lib/reengagement.ts) como filtro de relación en vez de sobre un
// cliente ya cargado: "tuvo al menos una cita COMPLETED" Y "ninguna cita
// COMPLETED más nueva que el corte de 60 días, ni ninguna cita futura sin
// cancelar" — las dos condiciones "ninguna" se combinan en un solo `none`
// con OR porque Prisma no permite dos claves `none` en el mismo filtro de
// relación.
export function buildSegmentWhereClause(
  segment: MarketingCampaignSegment,
  tenantId: string,
  now: Date
): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = {
    tenantId,
    email: { not: null },
    marketingOptOut: false,
  };

  if (segment === "ALL_CLIENTS") {
    return base;
  }

  const cutoffDate = new Date(now.getTime() - INACTIVITY_THRESHOLD_DAYS * MS_PER_DAY);

  return {
    ...base,
    appointments: {
      some: { status: "COMPLETED" },
      none: {
        OR: [
          { status: "COMPLETED", startsAt: { gt: cutoffDate } },
          { status: { not: "CANCELLED" }, startsAt: { gt: now } },
        ],
      },
    },
  };
}
