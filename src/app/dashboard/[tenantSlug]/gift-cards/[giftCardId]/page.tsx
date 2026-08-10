import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireGiftCardsAccess } from "@/lib/auth-guards";
import { hasAnyOfRolesInTenantLocations } from "@/lib/authorization";
import { LinkPendingSpinner } from "@/components/ui/LinkPendingSpinner";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { cancelGiftCardAction } from "../actions";

const STATUS_LABELS = {
  ACTIVE: "Activa",
  DEPLETED: "Sin saldo",
  CANCELLED: "Anulada",
} as const;

export default async function GiftCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; giftCardId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { tenantSlug, giftCardId } = await params;
  const { error, saved } = await searchParams;
  const { session, tenant } = await requireGiftCardsAccess(tenantSlug);

  const giftCard = await prisma.giftCard.findFirst({
    where: { id: giftCardId, tenantId: tenant.id },
    include: {
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        include: { appointment: { include: { service: true, client: true } } },
      },
    },
  });
  if (!giftCard) notFound();

  const canManage = hasAnyOfRolesInTenantLocations(
    session.user.locationRoles,
    tenant.locations.map((location) => location.id),
    ["OWNER", "ADMIN"]
  );

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/${tenantSlug}/gift-cards`} className="group inline-flex items-center gap-1 shell-link">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:-translate-x-0.5" />
        Volver a gift cards
        <LinkPendingSpinner />
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h1 className="data-mono page-title">{giftCard.code}</h1>
        <CopyButton value={giftCard.code}>Copiar código</CopyButton>
      </div>
      <p className="page-subtitle">
        {giftCard.recipientName ? `Para ${giftCard.recipientName}` : "Sin destinatario registrado"}
        {giftCard.purchaserName ? ` — compró ${giftCard.purchaserName}` : ""}
      </p>

      {error && <p className="msg-error mt-3">{error}</p>}
      {saved && !error && <p className="msg-success mt-3">Cambios guardados.</p>}

      <div className="panel mt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Saldo actual</p>
            <p className="data-mono mt-0.5 text-2xl font-semibold text-ink">
              {Number(giftCard.balance).toLocaleString("es-CO")}
            </p>
            <p className="data-mono text-xs text-ink/45">
              de {Number(giftCard.initialAmount).toLocaleString("es-CO")} emitidos
            </p>
          </div>
          <span className="badge badge-pine">{STATUS_LABELS[giftCard.status]}</span>
        </div>
        {giftCard.expiresAt && (
          <p className="mt-3 text-xs text-ink/50">
            Vence el {giftCard.expiresAt.toLocaleDateString("es-CO", { dateStyle: "medium" })}
          </p>
        )}
        {giftCard.note && <p className="mt-3 text-sm text-ink/70">{giftCard.note}</p>}
      </div>

      <div className="mt-6 border-t border-sage-dark/30 pt-4">
        <p className="section-title text-sm">Historial de canjes</p>
        {giftCard.redemptions.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">Todavía no se usó en ninguna cita.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sage-dark/25">
            {giftCard.redemptions.map((redemption) => (
              <li key={redemption.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{redemption.appointment.client.name}</p>
                  <p className="text-ink/50">
                    {redemption.appointment.service.name} ·{" "}
                    {redemption.redeemedAt.toLocaleDateString("es-CO", { dateStyle: "medium" })}
                  </p>
                </div>
                <span className="data-mono text-ink/70">
                  -{Number(redemption.amountApplied).toLocaleString("es-CO")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && giftCard.status === "ACTIVE" && (
        <div className="mt-6 border-t border-sage-dark/30 pt-4">
          <form action={cancelGiftCardAction.bind(null, tenantSlug, giftCardId)}>
            <SubmitButton icon={<Ban className="h-4 w-4" />} pendingLabel="Anulando…" className="btn-secondary">
              Anular gift card
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
